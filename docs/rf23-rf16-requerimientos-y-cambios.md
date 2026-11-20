# RF-23 + RF-16: requerimientos y cambios

- **Estado:** implementado y verificado en el árbol de trabajo; **commit y push
  pendientes de confirmación**.
- **Fecha:** 2026-11-20.
- **Rama:** `E2-·-RF-23-+-RF-16---Tarifas,-zonas-y-multiplicador-por-demanda`.
- **Base:** `main` en `3c8591b` (PR #8: PostGIS, vehículos y ubicaciones
  vigentes). El esquema de configuración quedó registrado en `786debb`; el resto
  de la entrega está sin commitear.
- **Diseño detallado:** `docs/migraciones-configuracion-administrativa.md`.
- **Contrato HTTP:** `docs/api.md` §5.2 y §5.3.
- **Prueba manual:** `docs/guia-de-prueba-y-rutas.md`.

Este documento consolida los requerimientos cubiertos, las decisiones tomadas y
la verificación de la entrega. El detalle físico de las tablas está en el
documento de diseño enlazado.

## 1. Requerimientos

### 1.1 RF-23 — Configuración administrativa

El administrador define zonas, tarifas y reglas. La configuración es versionada:
se prepara un borrador, se publica y desde ese momento no se modifica.

| ID | Requerimiento | Criterio de aceptación |
| --- | --- | --- |
| R23-01 | Crear zonas de demanda con nombre y criterio geográfico. | La zona se guarda con nombre único sin distinguir mayúsculas y un polígono válido y no vacío. |
| R23-02 | Desactivar zonas sin borrarlas. | `PATCH .../zonas/{id}` con `activa: false` funciona; `DELETE` es rechazado. Una zona inactiva no participa del solapamiento ni cotiza. |
| R23-03 | Evitar zonas activas superpuestas (I16). | Un alta, reactivación o cambio de área que intersecte otra zona activa falla con `409 ZONAS_SUPERPUESTAS`, incluso si solo comparte un borde. |
| R23-04 | Crear tarifas como borrador. | Toda tarifa nueva nace en `BORRADOR`, sin versión ni datos de publicación. |
| R23-05 | Publicar tarifas en versiones consecutivas. | La primera publicación obtiene `version = 1`; las siguientes, `MAX(version) + 1`. Dos publicaciones concurrentes no repiten versión. |
| R23-06 | Hacer inmutables las tarifas publicadas (I12). | `UPDATE` y `DELETE` sobre una fila `PUBLICADA` fallan; exponer un precio nuevo exige publicar otra versión. |
| R23-07 | Validar los importes de la tarifa. | `base`, `porKm` y `porMinuto` son enteros no negativos en centavos; `precioMaximo >= base`. |
| R23-08 | Consultar la tarifa vigente. | La vigente es la `PUBLICADA` de mayor versión con `vigenteDesde <= ahora`; el índice parcial acompaña esa consulta. |
| R23-09 | Crear, editar y publicar reglas de multiplicador. | La regla sigue el mismo ciclo que la tarifa y valida fórmula, umbrales, mínimo, máximo y escala. |
| R23-10 | Reservar la configuración al administrador. | Las rutas `/admin/configuracion/**` exigen `ADMINISTRADOR` en el middleware y el caso de uso vuelve a validar el rol. `creada_en`, `vigenteDesde` y `publicadaEn` salen del mismo `Reloj`. |

### 1.2 RF-16 — Multiplicador por demanda

El multiplicador sube cuando la demanda supera la oferta. La fórmula vigente es
`LINEAL_POR_TRAMOS` y se parametriza con una regla versionada.

| ID | Requerimiento | Criterio de aceptación |
| --- | --- | --- |
| R16-01 | Persistir la fórmula y sus parámetros. | `formula` solo admite `LINEAL_POR_TRAMOS`; `umbralInferior >= 0`; `umbralSuperior > umbralInferior`. |
| R16-02 | Garantizar un multiplicador que solo sube. | `multiplicadorMinimo >= 1` y `multiplicadorMaximo >= multiplicadorMinimo`. |
| R16-03 | Guardar decimales exactos. | Umbrales y multiplicadores usan `NUMERIC` de escala fija; nunca `FLOAT`. La escala de redondeo está entre 0 y 4. |
| R16-04 | Versionar la regla para auditoría. | Cada publicación conserva su número de versión, quién la publicó, cuándo y desde cuándo rige. |
| R16-05 | Calcular el multiplicador al cotizar. | Implementado: demanda baja fija el mínimo, demanda alta el máximo, umbrales cerrados, tramo lineal, `0/0` usa el mínimo y demanda sin choferes usa el máximo. El resultado se acota a la escala de la regla (I18). |

**Demanda y oferta.** Se cuentan los viajes activos (`SOLICITADO`, `ASIGNADO`,
`CHOFER_EN_CAMINO`, `EN_CURSO`) con origen en la zona y
`solicitado_en >= ahora - DEMANDA_VENTANA_MS` (300 000 ms por defecto). Se
cuentan como choferes disponibles los habilitados, sin viaje activo, con
`disponible = true` y con ubicación vigente dentro de la zona.

### 1.3 RF-17, RF-18 y RF-19 — Cotización, confirmación y carrera

| ID | Requerimiento | Criterio de aceptación |
| --- | --- | --- |
| R17 | Mostrar precio y multiplicador antes de confirmar. | `POST /cotizaciones` calcula distancia, tiempo, zona, conteos, multiplicador y precio en el servidor. El cliente no envía importes. |
| R18 | Fijar el precio al confirmar. | `POST /cotizaciones/{id}/confirmar` copia precio y multiplicador al viaje con un `UPDATE` condicional; un cambio posterior de demanda no altera el viaje. |
| R19 | Proteger la carrera recálculo/confirmación. | La cotización es inmutable salvo `estado`; la confirmación usa comparación condicional e idempotencia por `cotizacion:confirmar:<pasajeroId>`, todo en una transacción. La segunda llamada con la misma clave devuelve el mismo viaje. |

### 1.4 Invariantes del modelo

| Invariante | Cómo queda cubierta |
| --- | --- |
| I11: la cotización es una foto inmutable. | Trigger `cotizaciones_proteger()` en la base y entidad sin mutadores de datos. Solo cambia `estado`. |
| I12: una regla o tarifa publicada es inmutable. | Trigger de inmutabilidad, índice único parcial de versión y `CHECK` de coherencia borrador/publicada. |
| I16: un punto pertenece a lo sumo a una zona activa. | Trigger con `ST_Intersects` sobre `geography(Polygon, 4326)` y bloqueo de asesoría para altas concurrentes. |
| I18: el multiplicador está entre mínimo y máximo. | Restricciones de la regla, aritmética exacta con BigInt y tests de límites en dominio, casos de uso y PostgreSQL. |
| I19: ningún importe lo decide el cliente. | Esquemas Zod estrictos: `POST /cotizaciones` solo acepta `origen` y `destino`; la confirmación no recibe precio. |

## 2. Decisiones de diseño

1. **Una tabla por entidad.** Borradores y versiones publicadas conviven en
   `tarifas` y `reglas_multiplicador`. `version` es `NULL` en borrador y un
   consecutivo único en publicadas.
2. **Versionado en la base.** Un trigger asigna el consecutivo con
   `MAX(version) + 1`, completa la publicación y rechaza cambios sobre filas
   publicadas. Un bloqueo de asesoría serializa publicaciones concurrentes.
   `publicar()` produce un estado transitorio `PUBLICADA` con `version: null`;
   el repositorio devuelve la entidad ya persistida con su versión.
3. **Zonas con PostGIS.** El criterio geográfico se guarda como
   `geography(Polygon, 4326)`, con índice GiST para `ST_Covers(area, punto)`. La
   API expone `criterio` como `{ "tipo": "POLIGONO", "puntos": [...] }`.
4. **Zonas sin solapamiento y sin borrado.** El trigger usa `ST_Intersects`
   porque un punto del borde pertenece a ambas zonas; la baja es `activa = false`.
5. **Dinero y decimales exactos.** Importes en `INTEGER` centavos; parámetros en
   `NUMERIC(12,4)`/`NUMERIC(6,4)`; precio y multiplicador calculados con BigInt
   y redondeo mitad hacia arriba, sin redondeos parciales.
6. **Sin tabla de mediciones.** No existe `multiplicadores_de_zona`: la
   medición queda dentro de cada cotización (`solicitudes_usadas`,
   `choferes_disponibles_usados`, `parametros_conteo`, id y versión de regla y
   tarifa). Así se puede reproducir el precio de cada cotización.
7. **Cotización antes que viaje.** `POST /viajes` se mantiene como ruta
   legacy/provisional para no romper a los clientes actuales, pero el flujo
   nuevo es cotizar → confirmar. Los viajes ya confirmados no se recalculan.
8. **Publicación con reloj único.** `creada_en`, `vigenteDesde` y
   `publicada_en` se toman de una sola llamada a `Reloj`; el actor se valida como
   `ADMINISTRADOR` en el caso de uso, además del middleware HTTP.

## 3. Cambios realizados

### 3.1 Migraciones

| Archivo | Cambio |
| --- | --- |
| `db/migrations/007_funciones_configuracion_versionada.sql` | Función compartida de versionado e inmutabilidad. |
| `db/migrations/008_zonas_de_demanda.sql` | Tabla `zonas_de_demanda` con área PostGIS, nombre único, índice GiST y control de solapamiento (I16). |
| `db/migrations/009_tarifas.sql` | Tabla `tarifas` versionada con importes en centavos. |
| `db/migrations/010_reglas_multiplicador.sql` | Tabla `reglas_multiplicador` versionada con umbrales y escala fijos. |
| `db/migrations/011_cotizaciones.sql` | Tabla `cotizaciones`, columnas `cotizacion_id` y `multiplicador_fijado` en `viajes`, índices, trigger de inmutabilidad y protección contra borrado de cotizaciones que ya generaron viaje. |

### 3.2 Dominio y aplicación

- Servicios: `decimal-exacto.js`, `multiplicador.js` y `precio.js` (BigInt).
- Entidades: `zona-de-demanda.js`, `tarifa.js`, `regla-de-multiplicador.js` y
  `cotizacion.js`; `viaje.js` incorpora `cotizacionId` y `multiplicadorFijado`.
- Puertos: repositorios de zonas, tarifas, reglas y cotizaciones, y
  `MedidorDeDemanda`.
- Adaptadores: `MedidorDeDemanda`, `EstimadorDeRecorridoHaversine`,
  conversión GeoJSON ↔ PostGIS, repositorios PostgreSQL y en memoria.
- Casos de uso: alta/edición/publicación/listado de configuración (`validarAdministrador`),
  `cotizar`, `confirmarCotizacion`, `obtenerCotizacion` y `listarCotizaciones`.

### 3.3 HTTP y composición

- Rutas `/admin/configuracion/zonas|tarifas|reglas` y `/cotizaciones` con
  esquemas Zod estrictos, autorización por rol y por recurso.
- Nuevos códigos HTTP en `error-mapping.js`: `VERSION_YA_PUBLICADA`,
  `ZONAS_SUPERPUESTAS`, `NOMBRE_YA_REGISTRADO`, `CONFIGURACION_INCOMPLETA`,
  `COTIZACION_YA_CONFIRMADA`, `COTIZACION_VENCIDA` y `FUERA_DE_COBERTURA`.
- `env.js` y `.env.example`: `DEMANDA_VENTANA_MS`, `COTIZACION_VIGENCIA_MS` y
  `VELOCIDAD_ESTIMADA_KMH`; se reutiliza `UBICACION_VIGENCIA_MS`.
- `composition-root.js`, readiness (nuevos chequeos de zonas, tarifas, reglas y
  cotizaciones), `app.js` y `scripts/seed.js` (zona, tarifa y regla iniciales).

### 3.4 Pruebas

| Archivo | Cambio |
| --- | --- |
| `tests/unit/domain/configuracion.test.js`, `multiplicador.test.js`, `precio.test.js` | Entidades, decimal exacto, demanda baja/alta/límites y precio con multiplicador. |
| `tests/helpers/cotizaciones-kit.js` | Kit con adaptadores falsos y escenarios de demanda. |
| `tests/unit/application/cotizaciones/cotizar.test.js` | Trazabilidad, umbrales, ventana, vigencia y cambio de versión. |
| `tests/unit/application/cotizaciones/confirmar-cotizacion.test.js` | Copia de precio, idempotencia, expiración y doble confirmación. |
| `tests/integration/cotizaciones.test.js` | Flujo HTTP completo con adaptadores falsos. |
| `tests/integration/postgres/cotizaciones.test.js` | Foto inmutable, trigger y confirmación con PostgreSQL real. |
| `tests/integration/postgres/postgres.test.js` | Tabla `cotizaciones` e índices nuevos en la verificación del esquema. |
| `tests/integration/postgres/configuracion-administrativa.test.js` | 6 pruebas de esquema y concurrencia de la entrega anterior. |

### 3.5 Documentación

- `docs/api.md` §5.2 y §5.3: rutas implementadas, errores e idempotencia.
- `docs/migraciones-configuracion-administrativa.md`: agrega `011_cotizaciones.sql`.
- `db/README.md`: inventario actualizado de migraciones.
- `docs/guia-de-prueba-y-rutas.md`: flujo manual completo.
- `docs/adr/0005-cotizacion-inmutable-para-precio-dinamico.md`: pasa a
  **Aceptado**; `docs/adr/README.md` refleja el cambio.

## 4. Verificación

### 4.1 Entorno

- PostgreSQL 15 con PostGIS 3.4 (`postgis/postgis:15-3.4-alpine`).
- Node.js 22 y pnpm 12.
- Base de prueba descartable definida en `compose.test.yaml`.

### 4.2 Resultados del 2026-11-20

| Comando | Resultado |
| --- | --- |
| `pnpm format` | Aplica formato a todo el árbol. |
| `pnpm format:check` | OK |
| `pnpm lint` | OK |
| `pnpm test` | 207/207 pruebas (3 suites PostgreSQL omitidas sin `TEST_DATABASE_URL`). |
| `pnpm test:integration:db` | 25/25 pruebas, incluidas las 3 nuevas de cotizaciones. |
| `pnpm verificar` | 15 OK, 0 fallas, 3 omitidos. |

Los casos límite cubiertos son demanda baja, demanda en los umbrales, demanda
alta, `0/0`, demanda sin choferes, ventanas vencidas y cotización vencida antes
de confirmar.

### 4.3 Sincronización con `main`

- `origin/main` y `main` local: `3c8591b`.
- El esquema de configuración está en el commit `786debb` de esta rama; el
  resto de los cambios está pendiente de confirmación del usuario para
  commitear y pushear.

## 5. Cómo reproducir

```bash
pnpm install
pnpm format:check
pnpm lint
pnpm test
pnpm test:integration:db
pnpm verificar
```

`test:integration:db` levanta la base de prueba, recrea el esquema, aplica todas
las migraciones, ejecuta las suites de `tests/integration/postgres/` y elimina el
contenedor al terminar. Con `KEEP_TEST_DB=1` se conserva para inspección manual.

## 6. Fuera de alcance y próximos pasos

1. **Ofertas y estados del viaje** (E3): `CHOFER_EN_CAMINO`, `EN_CURSO`,
   ofertas con vencimiento y búsqueda de choferes al confirmar.
2. **Retirar `POST /viajes`** cuando los clientes usen el flujo de cotización.
3. **Lectura por soporte** de la configuración, si se decide exponerla para
   explicar precios (hoy solo puede leer la cotización).
4. **Límites por usuario** para cotizar y confirmar, en lugar del contador
   compartido de IP.
5. **Tarifa final sobre recorrido real** y cobro en E4.

## 7. Historial

| Fecha | Cambio |
| --- | --- |
| 2026-11-19 | Primera versión sobre la base anterior, con zonas en JSONB. Se revirtió para actualizar la rama. |
| 2026-11-19 | Fast-forward a `3c8591b`; migraciones renumeradas `007`–`010` y zonas adaptadas a PostGIS. |
| 2026-11-20 | Esquema de configuración verificado y commiteado en `786debb`. |
| 2026-11-20 | Cotizaciones, confirmación, endpoints, seeding y documentación; ADR-0005 aceptado. Pendiente de commit. |

## 8. Referencias

- `docs/modelo.md` §3, §4.5, §4.6, §4.7, §7.1 y §8 (I11, I12, I16, I18, I19).
- `docs/api.md` §5.2 y §5.3.
- `docs/adr/0005-cotizacion-inmutable-para-precio-dinamico.md`.
- `docs/adr/0006-postgis-para-busqueda-geografica.md`.
- `docs/migraciones-configuracion-administrativa.md`.
- `db/migrations/007_funciones_configuracion_versionada.sql` a
  `db/migrations/011_cotizaciones.sql`.
