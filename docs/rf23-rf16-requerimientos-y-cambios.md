# RF-23 + RF-16: requerimientos y cambios

- **Estado:** implementado, verificado y publicado en la rama de trabajo.
- **Fecha:** 2026-11-20.
- **Rama:** `E2 · RF-23 + RF-16 — Tarifas, zonas y multiplicador por demanda`.
- **Base:** `main` en `3c8591b` (PR #8: PostGIS, vehículos y ubicaciones vigentes).
- **Alcance de esta entrega:** esquema persistente y pruebas de zonas de demanda,
  tarifas versionadas y reglas de multiplicador.
- **Diseño detallado:** `docs/migraciones-configuracion-administrativa.md`.

Este documento consolida los requerimientos que cubre la entrega, las decisiones
tomadas, la lista completa de cambios y las verificaciones ejecutadas. No repite
el detalle del modelo físico: para columnas, restricciones y ejemplos SQL, ver el
documento de diseño enlazado.

## 1. Requerimientos

### 1.1 RF-23 — Configuración administrativa

El administrador define las zonas, las tarifas y las reglas con las que se cotiza
un viaje. La configuración es versionada: se prepara un borrador, se publica y,
desde ese momento, no se modifica.

| ID | Requerimiento | Criterio de aceptación |
| --- | --- | --- |
| R23-01 | Crear zonas de demanda con nombre y criterio geográfico. | La zona se guarda con nombre único sin distinguir mayúsculas y un polígono válido y no vacío. |
| R23-02 | Desactivar zonas sin borrarlas. | `UPDATE ... SET activa = false` funciona; `DELETE` es rechazado. Una zona inactiva no participa del solapamiento ni cotiza. |
| R23-03 | Evitar zonas activas superpuestas (I16). | Un alta, reactivación o cambio de área que intersecte otra zona activa falla con SQLSTATE `23514`, incluso si solo comparte un borde. |
| R23-04 | Crear tarifas como borrador. | Toda tarifa nueva nace en `BORRADOR`, sin versión ni datos de publicación. |
| R23-05 | Publicar tarifas en versiones consecutivas. | La primera publicación obtiene `version = 1`; las siguientes, `MAX(version) + 1`. Dos publicaciones concurrentes no repiten versión. |
| R23-06 | Hacer inmutables las tarifas publicadas (I12). | `UPDATE` y `DELETE` sobre una fila `PUBLICADA` fallan; el cambio se hace publicando otra versión. |
| R23-07 | Validar los importes de la tarifa. | `base`, `porKm` y `porMinuto` son enteros no negativos en centavos; `precioMaximo >= base`. |
| R23-08 | Consultar la tarifa vigente. | La vigente es la `PUBLICADA` de mayor versión con `vigenteDesde <= ahora`; el índice parcial acompaña esa consulta. |
| R23-09 | Crear, editar y publicar reglas de multiplicador. | La regla sigue el mismo ciclo que la tarifa y valida fórmula, umbrales, mínimo, máximo y escala. |
| R23-10 | Reservar la escritura al administrador y permitir lectura al soporte. | El esquema no implementa autorización por rol; los casos de uso y las rutas HTTP de `docs/api.md` §5.2 quedan para la tarjeta de API. La base solo verifica que `publicadaPorId` exista. |

### 1.2 RF-16 — Multiplicador por demanda

El multiplicador hace que el precio suba cuando la demanda supera a la oferta. La
fórmula vigente es `LINEAL_POR_TRAMOS` y se parametriza con una regla versionada.

| ID | Requerimiento | Criterio de aceptación |
| --- | --- | --- |
| R16-01 | Persistir la fórmula y sus parámetros. | `formula` solo admite `LINEAL_POR_TRAMOS`; `umbralInferior >= 0`; `umbralSuperior > umbralInferior`. |
| R16-02 | Garantizar un multiplicador que solo sube. | `multiplicadorMinimo >= 1` y `multiplicadorMaximo >= multiplicadorMinimo`. |
| R16-03 | Guardar decimales exactos. | Umbrales y multiplicadores usan `NUMERIC` de escala fija; nunca `FLOAT`. La escala de redondeo está entre 0 y 4. |
| R16-04 | Versionar la regla para auditoría. | Cada publicación conserva su número de versión, quién la publicó, cuándo y desde cuándo rige. |
| R16-05 | Calcular el multiplicador al cotizar. | Fuera de alcance de esta entrega: pertenece a la tarjeta de cotización y confirmación (ADR-0005). El esquema ya guarda todos los parámetros que la función pura necesita. |

### 1.3 Invariantes del modelo

| Invariante | Cómo queda cubierta |
| --- | --- |
| I12: una regla o tarifa publicada es inmutable. | Trigger de inmutabilidad, índice único parcial de versión y `CHECK` de coherencia borrador/publicada. |
| I16: un punto pertenece a lo sumo a una zona activa. | Trigger con `ST_Intersects` sobre `geography(Polygon, 4326)` y bloqueo de asesoría para altas concurrentes. |
| I18: el multiplicador está entre mínimo y máximo. | Restricciones de la regla y precisión fija; la aplicación de la fórmula se prueba en la tarjeta de cotización. |
| I19: ningún importe lo decide el cliente. | El esquema no recibe importes del cliente; las rutas que los expongan se implementarán con esquemas estrictos. |

## 2. Decisiones de diseño

1. **Una tabla por entidad.** Borradores y versiones publicadas conviven en
   `tarifas` y `reglas_multiplicador`. `version` es `NULL` en borrador y un
   consecutivo único en publicadas.
2. **Versionado en la base.** Un trigger compartido asigna el consecutivo con
   `MAX(version) + 1`, completa la publicación y rechaza cambios sobre filas
   publicadas. Un bloqueo de asesoría serializa publicaciones concurrentes.
3. **Zonas con PostGIS.** El criterio geográfico se guarda como
   `geography(Polygon, 4326)`, con índice GiST para `ST_Covers(area, punto)`,
   siguiendo ADR-0006. La API seguirá exponiendo `criterio` como GeoJSON.
4. **Zonas sin solapamiento.** El trigger usa `ST_Intersects`, no `ST_Covers`,
   porque un punto del borde pertenece a ambas zonas y también debe rechazarse.
5. **Zonas sin borrado.** `DELETE` se rechaza siempre; la baja funcional es
   `activa = false`.
6. **Dinero en centavos.** Los importes son `INTEGER` en la unidad menor de la
   moneda, sin punto flotante.
7. **Decimales exactos.** Los parámetros del multiplicador usan `NUMERIC(12,4)` y
   `NUMERIC(6,4)`; la escala de redondeo es un entero entre 0 y 4.
8. **Alcance acotado.** Esta entrega no incluye repositorios, casos de uso, rutas
   HTTP, cotizaciones, seed ni la modificación de `viajes`.

## 3. Cambios realizados

### 3.1 Migraciones

| Archivo | Cambio |
| --- | --- |
| `db/migrations/007_funciones_configuracion_versionada.sql` | Nueva función `configuracion_versionada_proteger()`: ciclo `BORRADOR → PUBLICADA`, versión consecutiva, bloqueo de concurrencia e inmutabilidad. |
| `db/migrations/008_zonas_de_demanda.sql` | Nueva tabla `zonas_de_demanda` con área PostGIS, nombre único sin distinguir mayúsculas, índice GiST, bloqueo de borrado y trigger de solapamiento (I16). |
| `db/migrations/009_tarifas.sql` | Nueva tabla `tarifas` con importes en centavos, restricciones, índices de versión/vigencia y trigger de versionado. |
| `db/migrations/010_reglas_multiplicador.sql` | Nueva tabla `reglas_multiplicador` con fórmula, umbrales, rango, escala, motivo e índices, más trigger de versionado. |

Las migraciones se numeraron `007` a `010` para no colisionar con `004_postgis`,
`005_vehiculos` ni `006_ubicaciones_vigentes`, ya presentes en `main`. Todas son
idempotentes y se aplican en orden alfabético.

### 3.2 Pruebas

| Archivo | Cambio |
| --- | --- |
| `tests/integration/postgres/configuracion-administrativa.test.js` | Nuevo archivo con 6 pruebas de integración contra PostgreSQL/PostGIS real. |
| `tests/integration/postgres/postgres.test.js` | Se agregaron `zonas_de_demanda`, `tarifas` y `reglas_multiplicador` a las tablas esperadas, y sus índices a la verificación del esquema. Además, el test de ubicaciones usa instantes relativos a `ahora` para no depender del reloj. |

Las 6 pruebas nuevas cubren:

1. zonas PostGIS, nombre único, área inválida, desactivación y bloqueo de borrado;
2. I16 con solapamiento y borde compartido;
3. tarifas: borrador, versión 1, inmutabilidad, versión 2 y validación de fechas;
4. reglas: umbrales, rango, escala, fórmula y publicación;
5. ocho publicaciones concurrentes de tarifas con versiones 1 a 8;
6. dos altas concurrentes de zonas superpuestas: queda exactamente una activa.

### 3.3 Documentación

| Archivo | Cambio |
| --- | --- |
| `docs/migraciones-configuracion-administrativa.md` | Nuevo documento de diseño: modelo físico, ciclo de vida, invariantes y ejemplos SQL. |
| `docs/rf23-rf16-requerimientos-y-cambios.md` | Este documento: requerimientos, decisiones, cambios y verificación. |
| `README.md` | Se agregaron los enlaces a la documentación de la entrega. |
| `db/README.md` | Se actualizó la lista de migraciones `001` a `010` y la convención de nombres. |

### 3.4 Código de aplicación

No se modificó código de aplicación. La entrega es exclusivamente de esquema,
pruebas y documentación; los adaptadores y casos de uso se apoyarán en estas
tablas en las próximas tarjetas.

## 4. Verificación

### 4.1 Entorno

- PostgreSQL 15 con PostGIS 3.4 (`postgis/postgis:15-3.4-alpine`).
- Node.js 22 y pnpm 12.
- Base de prueba descartable definida en `compose.test.yaml`.

### 4.2 Resultados del 2026-11-20

| Comando | Resultado |
| --- | --- |
| `pnpm format:check` | OK |
| `pnpm lint` | OK |
| `pnpm test` | 178/178 pruebas |
| `pnpm test:integration:db` | 22/22 pruebas, incluidas las 6 nuevas |
| `pnpm test` en una copia integrada sobre `origin/main` | 178/178 |
| `pnpm test:integration:db` en esa copia | 22/22 |

La copia de integración se hizo en un worktree temporal sobre `origin/main`
(`3c8591b`), aplicando exactamente los mismos archivos y verificando su SHA-256.
El worktree se eliminó después. No hubo conflictos.

### 4.3 Sincronización con `main`

- `origin/main` y `main` local: `3c8591b`.
- Divergencia con `origin/main`: 0 commits adelante, 0 atrás.
- La rama de trabajo conserva los cambios de esta entrega como commits propios
  sobre esa base.

## 5. Cómo reproducir

```bash
pnpm install
pnpm format:check
pnpm lint
pnpm test
pnpm test:integration:db
```

`test:integration:db` levanta la base de prueba, recrea el esquema, aplica todas
las migraciones, ejecuta las suites de `tests/integration/postgres/` y elimina el
contenedor al terminar. Con `KEEP_TEST_DB=1` se conserva para inspección manual.

## 6. Fuera de alcance y próximos pasos

1. **Cotizaciones:** tabla `cotizaciones` y columnas `cotizacion_id` y
   `multiplicador_fijado` en `viajes` (ADR-0005).
2. **Repositorios PostgreSQL** para zonas, tarifas y reglas.
3. **Casos de uso y rutas HTTP** de `docs/api.md` §5.2, incluida la conversión
   entre `criterio` GeoJSON y `area` PostGIS.
4. **Cálculo del multiplicador** al cotizar y pruebas de sus propiedades
   (RF-16, §7.1 del modelo).
5. **Seed** con una zona, una tarifa y una regla publicadas para desarrollo.
6. **Autorización de publicación:** validar en el caso de uso que
   `publicadaPorId` sea un `ADMINISTRADOR`.
7. **Renumeración:** si `main` incorpora migraciones `007` o posteriores antes
   del merge, esta entrega debe renumerarse otra vez.

## 7. Historial

| Fecha | Cambio |
| --- | --- |
| 2026-11-19 | Primera versión sobre la base anterior, con zonas en JSONB. Se revirtió para actualizar la rama. |
| 2026-11-19 | Fast-forward a `3c8591b`; migraciones renumeradas `007`–`010` y zonas adaptadas a PostGIS. |
| 2026-11-20 | Verificación completa, prueba de integración sobre `main`, documentación consolidada y publicación de la rama. |

## 8. Referencias

- `docs/modelo.md` §3, §4.5, §4.6, §4.7, §7.1 y §8 (I12, I16, I18, I19).
- `docs/api.md` §5.2 (endpoints propuestos de zonas, tarifas y reglas).
- `docs/adr/0005-cotizacion-inmutable-para-precio-dinamico.md`.
- `docs/adr/0006-postgis-para-busqueda-geografica.md`.
- `docs/migraciones-configuracion-administrativa.md`.
- `db/migrations/007_funciones_configuracion_versionada.sql`.
- `db/migrations/008_zonas_de_demanda.sql`.
- `db/migrations/009_tarifas.sql`.
- `db/migrations/010_reglas_multiplicador.sql`.
- `tests/integration/postgres/configuracion-administrativa.test.js`.
