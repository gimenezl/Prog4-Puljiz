# Migraciones de configuración administrativa (RF-23 + RF-16)

- **Estado:** implementada, verificada y publicada en la rama de trabajo.
- **Fecha:** 2026-11-19; última verificación: 2026-11-20.
- **Rama de trabajo:** `E2 · RF-23 + RF-16 — Tarifas, zonas y multiplicador por demanda`.
- **Base:** `main` actualizado a `3c8591b` (PR #8: vehículo, ubicación y PostGIS).
- **Referencias:** `docs/modelo.md` §3, §4.5, §4.6, §4.7, §7.1, §8 (I12 e I16);
  `docs/adr/0005-cotizacion-inmutable-para-precio-dinamico.md`;
  `docs/adr/0006-postgis-para-busqueda-geografica.md`; `docs/api.md` §5.2.

## 1. Alcance

Esta entrega incorpora el **esquema persistente** de la configuración
administrativa:

1. zonas de demanda (RF-23);
2. tarifas versionadas (RF-23);
3. reglas de multiplicador versionadas (RF-23 + RF-16).

No incluye todavía cotizaciones, la modificación de `viajes` para guardar
`cotizacion_id` y `multiplicador_fijado`, los casos de uso, las rutas HTTP ni los
repositorios. Esas piezas pertenecen a las tarjetas de cotización y confirmación
y se apoyan en este esquema.

## 2. Contexto: actualización de la base

La rama se actualizó con `origin/main` antes de reaplicar esta propuesta. Esa
actualización incorporó, entre otras cosas:

- `004_postgis.sql`: extensión PostGIS.
- `005_vehiculos.sql`: vehículo de cada chofer.
- `006_ubicaciones_vigentes.sql`: ubicación vigente con `geography(Point, 4326)`.

Por eso las migraciones de esta tarjeta se numeraron **007 a 010**: no pisan los
números que ya usa `main`. Además, las zonas de demanda ahora usan PostGIS en
lugar de guardar el criterio como JSONB.

## 3. Decisión de diseño

Se usa **una tabla por entidad**, con los borradores y las versiones publicadas
en la misma tabla. Es la representación más directa del modelo:

- `version` es `NULL` mientras la fila es `BORRADOR`.
- Al publicar, un trigger asigna el consecutivo y completa los datos de
  publicación.
- Una fila `PUBLICADA` no se puede modificar ni eliminar; cambiar la
  configuración exige crear otro borrador y publicarlo.
- El índice único parcial sobre `version` impide dos versiones publicadas con el
  mismo número.

Se descartaron las alternativas de dos tablas (`borradores` y `publicadas`) y de
una tabla genérica de configuraciones porque el modelo define entidades y
atributos distintos, y porque una tabla única mantiene el historial completo en
un solo lugar.

## 4. Migraciones creadas

| Archivo | Contenido |
| --- | --- |
| `db/migrations/007_funciones_configuracion_versionada.sql` | Función compartida que asigna versiones, completa la publicación y bloquea cambios sobre filas publicadas. |
| `db/migrations/008_zonas_de_demanda.sql` | Tabla `zonas_de_demanda` con área PostGIS, índice GiST, unicidad de nombre, bloqueo de borrado y control de solapamiento (I16). |
| `db/migrations/009_tarifas.sql` | Tabla `tarifas`, restricciones de importes, índices de versión y trigger de ciclo de vida. |
| `db/migrations/010_reglas_multiplicador.sql` | Tabla `reglas_multiplicador`, restricciones de umbrales y escala, índices y trigger. |

Todas son idempotentes: usan `CREATE TABLE IF NOT EXISTS`,
`CREATE INDEX IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION` y
`DROP TRIGGER IF EXISTS` antes de crear cada trigger. Se pueden volver a aplicar
sin destruir datos.

## 5. Modelo físico

### 5.1 `zonas_de_demanda`

| Columna | Tipo | Regla |
| --- | --- | --- |
| `id` | `UUID` | Clave primaria. |
| `nombre` | `VARCHAR(100)` | Obligatorio, sin espacios en los extremos, único sin distinguir mayúsculas. |
| `area` | `geography(Polygon, 4326)` | Polígono válido y no vacío. Es el criterio geográfico de la zona. |
| `activa` | `BOOLEAN` | Obligatorio, por defecto `true`. Una zona inactiva no cotiza. |
| `creada_en` | `TIMESTAMPTZ` | Obligatorio e inmutable. |

Reglas adicionales:

- Las zonas **no se eliminan**: un trigger rechaza `DELETE`. Se desactivan con
  `activa = false`.
- `id` y `creada_en` no se pueden modificar.
- La unicidad de nombre usa `LOWER(nombre)`, para que `Microcentro` y
  `MICROCENTRO` no convivan.
- La búsqueda de pertenencia se hace con `ST_Covers(area, punto)` y el índice
  GiST `zonas_de_demanda_area_idx`.

**I16 en la base:** un trigger rechaza cualquier alta, reactivación o cambio de
área que intersecte con otra zona activa. Se usa `ST_Intersects`, por lo que
tampoco se permite compartir solamente un borde: un punto del borde pertenece a
ambas zonas según `ST_Covers`. El chequeo toma un bloqueo de asesoría para
serializar altas concurrentes.

**Mapeo con la API:** `docs/api.md` muestra `criterio` como documento JSON. En la
base, ese criterio se representa con `area`; el futuro adaptador HTTP puede
exponerlo con `ST_AsGeoJSON(area::geometry)` al leer y convertir el polígono
recibido con `ST_GeogFromText` o `ST_GeomFromGeoJSON` al escribir. No se guardan
dos copias del mismo criterio.

### 5.2 `tarifas`

| Columna | Tipo | Regla |
| --- | --- | --- |
| `id` | `UUID` | Clave primaria. |
| `estado` | `VARCHAR(10)` | `BORRADOR` o `PUBLICADA`, por defecto `BORRADOR`. |
| `version` | `INTEGER` | `NULL` en borrador; consecutivo único en publicadas. |
| `base_centavos` | `INTEGER` | Importe fijo, mayor o igual que 0. |
| `por_km_centavos` | `INTEGER` | Importe por kilómetro, mayor o igual que 0. |
| `por_minuto_centavos` | `INTEGER` | Importe por minuto, mayor o igual que 0. |
| `precio_maximo_centavos` | `INTEGER` | Tope del precio total, mayor o igual que `base_centavos`. |
| `vigente_desde` | `TIMESTAMPTZ` | Obligatorio al publicar; no puede ser anterior a `publicada_en`. |
| `publicada_por_id` | `UUID` | Referencia a `usuarios(id)`; obligatorio al publicar. |
| `publicada_en` | `TIMESTAMPTZ` | Se completa al publicar; no puede ser anterior a `creada_en`. |
| `creada_en` | `TIMESTAMPTZ` | Obligatorio. |

La tarifa es global: no tiene `zona_id`. Una tarifa publicada se aplica a todas
las zonas, tal como propone el modelo.

### 5.3 `reglas_multiplicador`

| Columna | Tipo | Regla |
| --- | --- | --- |
| `id` | `UUID` | Clave primaria. |
| `estado` | `VARCHAR(10)` | `BORRADOR` o `PUBLICADA`, por defecto `BORRADOR`. |
| `version` | `INTEGER` | `NULL` en borrador; consecutivo único en publicadas. |
| `formula` | `VARCHAR(30)` | Hoy solo `LINEAL_POR_TRAMOS`. |
| `umbral_inferior` | `NUMERIC(12,4)` | Mayor o igual que 0. |
| `umbral_superior` | `NUMERIC(12,4)` | Mayor que `umbral_inferior`. |
| `multiplicador_minimo` | `NUMERIC(6,4)` | Mayor o igual que 1. |
| `multiplicador_maximo` | `NUMERIC(6,4)` | Mayor o igual que el mínimo. |
| `escala_multiplicador` | `SMALLINT` | Cantidad de decimales, entre 0 y 4. |
| `vigente_desde` | `TIMESTAMPTZ` | Obligatorio al publicar; no puede ser anterior a `publicada_en`. |
| `motivo` | `VARCHAR(500)` | Opcional, sin espacios en los extremos si se informa. |
| `publicada_por_id` | `UUID` | Referencia a `usuarios(id)`; obligatorio al publicar. |
| `publicada_en` | `TIMESTAMPTZ` | Se completa al publicar; no puede ser anterior a `creada_en`. |
| `creada_en` | `TIMESTAMPTZ` | Obligatorio. |

Los decimales se guardan como `NUMERIC` de escala fija, nunca como `FLOAT`, para
que la fórmula lineal y el redondeo sean reproducibles. La cota de 4 decimales
en la escala acompaña la precisión de las columnas.

### 5.4 Función común de versionado

`configuracion_versionada_proteger()` se ejecuta antes de insertar, actualizar o
eliminar en `tarifas` y `reglas_multiplicador`:

1. Un `INSERT` solo puede crear `BORRADOR`.
2. Un borrador puede editarse; el trigger limpia `version`, `vigente_desde`,
   `publicada_por_id` y `publicada_en`.
3. Al pasar a `PUBLICADA`, exige `publicada_por_id`, toma un bloqueo de
   asesoría por tabla y calcula `MAX(version) + 1` dentro de la misma
   transacción. El bloqueo serializa publicaciones concurrentes.
4. Completa `publicada_en` con el valor informado o con `NOW()`, y
   `vigente_desde` con el valor informado o con `publicada_en`.
5. Rechaza una vigencia anterior al instante de publicación y una publicación
   anterior a la creación del borrador.
6. Rechaza cualquier `UPDATE` o `DELETE` sobre una fila ya publicada.

El bloqueo de asesoría se libera al terminar la transacción. Si la publicación
falla, la versión no se consume: el siguiente intento vuelve a calcular el
consecutivo.

Para evitar diferencias entre el reloj de la aplicación y el de PostgreSQL, el
caso de uso debe informar `publicada_en` con el mismo `Reloj` con el que creó
`creada_en` y validó `vigente_desde`. Si se omite, la base usa `NOW()`.

## 6. Ciclo de vida

### 6.1 Crear un borrador

```sql
INSERT INTO tarifas (
  id, base_centavos, por_km_centavos, por_minuto_centavos,
  precio_maximo_centavos, creada_en
) VALUES (
  gen_random_uuid(), 100000, 50000, 2000, 1000000, NOW()
);
```

El estado queda en `BORRADOR`, `version` en `NULL` y los campos de publicación
en `NULL`.

### 6.2 Editar el borrador

```sql
UPDATE tarifas
   SET por_minuto_centavos = 2500
 WHERE id = $1
   AND estado = 'BORRADOR';
```

La condición `estado = 'BORRADOR'` es explícita en el caso de uso; el trigger es
la segunda línea de defensa.

### 6.3 Publicar

```sql
UPDATE tarifas
   SET estado = 'PUBLICADA',
       publicada_por_id = $administrador,
       vigente_desde = NOW() + INTERVAL '1 day'
 WHERE id = $1
   AND estado = 'BORRADOR'
RETURNING version, publicada_en, vigente_desde;
```

La primera publicación devuelve `version = 1`. La siguiente versión publicada
de la misma tabla devuelve `version = 2`, aunque se hayan creado y descartado
varios borradores.

Para reglas:

```sql
UPDATE reglas_multiplicador
   SET estado = 'PUBLICADA',
       publicada_por_id = $administrador,
       vigente_desde = NOW(),
       motivo = 'Ajuste por hora pico'
 WHERE id = $1
   AND estado = 'BORRADOR'
RETURNING version, publicada_en;
```

### 6.4 Consultar la versión vigente

```sql
SELECT *
  FROM tarifas
 WHERE estado = 'PUBLICADA'
   AND vigente_desde <= NOW()
 ORDER BY version DESC
 LIMIT 1;
```

```sql
SELECT *
  FROM reglas_multiplicador
 WHERE estado = 'PUBLICADA'
   AND vigente_desde <= NOW()
 ORDER BY version DESC
 LIMIT 1;
```

La consulta usa el índice parcial `(vigente_desde, version DESC)` de cada tabla.
Si no hay filas, el caso de uso debe responder `CONFIGURACION_INCOMPLETA`, como
indica `docs/api.md`.

### 6.5 Intentar cambiar una versión publicada

```sql
UPDATE tarifas SET por_km_centavos = 60000 WHERE id = $1;
```

El trigger responde con SQLSTATE `23514` y no modifica la fila. La operación
correcta es crear otro borrador y publicarlo.

## 7. Invariantes cubiertas

| Invariante | Cómo la cubre la migración |
| --- | --- |
| I12: una regla o tarifa publicada es inmutable. | Trigger que rechaza `UPDATE` y `DELETE` sobre `PUBLICADA`; `version` única por índice parcial. |
| Versión consecutiva y única. | Trigger `MAX(version) + 1` con bloqueo de asesoría; índice único parcial. |
| Coherencia borrador/publicada. | `CHECK` que exige `version`, `vigente_desde`, `publicada_por_id` y `publicada_en` solo en `PUBLICADA`, y los deja nulos en `BORRADOR`. |
| Cronología de la publicación. | `CHECK` de `publicada_en >= creada_en` y `vigente_desde >= publicada_en`. |
| Importes válidos. | `CHECK` de importes no negativos y `precio_maximo_centavos >= base_centavos`. |
| Umbrales y multiplicadores válidos (RF-16). | `CHECK` de umbrales, rango `[1, máximo]` y escala entre 0 y 4. |
| Zonas sin borrado. | Trigger que rechaza `DELETE`; la desactivación se hace con `activa = false`. |
| I16: zonas activas sin solapamiento. | Trigger con `ST_Intersects` y bloqueo de asesoría; índice GiST para la consulta. |
| Área de zona válida. | `CHECK` con `ST_IsValid` y `ST_IsEmpty`, más validación en el trigger. |

## 8. Verificación

La suite de integración con PostgreSQL real verifica:

- que las migraciones son idempotentes y crean las tablas e índices esperados;
- que una zona se puede desactivar pero no borrar;
- que dos zonas activas no se solapan ni comparten borde;
- que dos altas concurrentes de zonas superpuestas dejan una sola activa;
- que una tarifa nace como borrador, publica versiones 1 y 2 y no se puede
  modificar después de publicada;
- que una regla valida umbrales, mínimo, máximo, escala y fórmula;
- que ocho publicaciones concurrentes de tarifas obtienen las versiones 1 a 8
  sin colisiones.

Comando:

```bash
pnpm test:integration:db
```

Archivo nuevo: `tests/integration/postgres/configuracion-administrativa.test.js`.

La misma suite se ejecutó el 2026-11-20 sobre una copia temporal de `origin/main`
(`3c8591b`) con exactamente los mismos archivos: 178/178 pruebas generales y
22/22 de integración, sin conflictos.

## 9. Fuera de alcance y siguientes pasos

1. **Cotizaciones:** tabla `cotizaciones`, columnas `cotizacion_id` y
   `multiplicador_fijado` en `viajes`, según ADR-0005.
2. **Repositorios PostgreSQL** para zonas, tarifas y reglas.
3. **Casos de uso y rutas HTTP** de `docs/api.md` §5.2, incluyendo la conversión
   entre `criterio` JSON y `area` PostGIS.
4. **Carga inicial:** un seed de zona, tarifa y regla publicadas para desarrollo.
5. **Autorización de publicación:** validar en el caso de uso que
   `publicada_por_id` corresponda a un `ADMINISTRADOR`. La base solo verifica la
   existencia del usuario.

## 10. Referencias

- `db/migrations/007_funciones_configuracion_versionada.sql`
- `db/migrations/008_zonas_de_demanda.sql`
- `db/migrations/009_tarifas.sql`
- `db/migrations/010_reglas_multiplicador.sql`
- `tests/integration/postgres/configuracion-administrativa.test.js`
- `docs/rf23-rf16-requerimientos-y-cambios.md`
- `docs/modelo.md` §4.5 a §4.7 y §7.1
- `docs/adr/0005-cotizacion-inmutable-para-precio-dinamico.md`
- `docs/adr/0006-postgis-para-busqueda-geografica.md`
