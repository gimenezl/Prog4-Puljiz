# RF-09 + RF-07 + RF-22 + RF-08 + RF-10: requerimientos, implementación y verificación

- **Estado:** requerimiento **implementado y verificado** en el árbol de trabajo.
  RF-07 y RF-22 siguen pendientes por decisión D4.
- **Fecha:** 2026-11-27.
- **Tarjeta:** E3 · Estados, ofertas y asignación.
- **Diseño de referencia:** `docs/modelo.md` §4.10, §4.11, §6.1, §6.2 y
  §9.1–§9.5; `docs/api.md` §4.4, §5.5 y §5.6;
  `docs/adr/0004-bloqueo-de-filas-para-asignacion-y-cancelacion.md`.

Este documento consolida los requerimientos de la tarjeta y registra cómo quedó
implementada la máquina de estados del viaje (RF-09) y la cancelación
actor-aware (RF-10):

```text
SOLICITADO --aceptar--> ASIGNADO
ASIGNADO --en-camino--> CHOFER_EN_CAMINO
CHOFER_EN_CAMINO --iniciar--> EN_CURSO
EN_CURSO --finalizar--> FINALIZADO
```

Las ofertas con vencimiento (RF-07) y el cierre por falta de candidatos
(RF-22) forman parte de la tarjeta, pero **no están implementados** por decisión
D4. Quedan especificados en §6 como alcance pendiente; no se los presenta como
entregados.

## 1. Resumen ejecutivo

- La base ya tenía los nueve estados y el bloqueo de filas viaje → chofer para
  aceptar y cancelar (RF-08).
- RF-09 quedó completo: `CHOFER_EN_CAMINO` y `EN_CURSO` son estados de primera
  clase en el dominio, la migración `013_viaje_iniciado_en.sql` persiste
  `iniciado_en`, el repositorio y la vista pública lo exponen, y las rutas
  `POST /viajes/:id/en-camino` y `POST /viajes/:id/iniciar` están implementadas.
- `finalizar` exige `EN_CURSO` y devuelve
  `"Solo un viaje en curso puede finalizarse."` desde `ASIGNADO` o
  `CHOFER_EN_CAMINO`. No se acepta el origen `ASIGNADO` legacy.
- RF-10 quedó completo: una sola ruta `POST /viajes/:id/cancelar`, actor-aware.
  La decision la toma el **vínculo con el recurso**, no el rol: pasajero dueño
  (`SOLICITADO`, `ASIGNADO`, `CHOFER_EN_CAMINO`) o chofer asignado (`ASIGNADO`,
  `CHOFER_EN_CAMINO`). No hay cancelación por soporte (D8 sigue vigente).
- El `motivo` de cancelación se valida en HTTP (Zod) y en el dominio
  (`validarMotivo`: obligatorio, no vacío, hasta 500 caracteres); en la base la
  columna es `VARCHAR(500)` con check de no nulo para estados cancelados, pero
  **sin check de no vacío**. `>500` lo rechazan dominio y base (`22001`).
- La «escritura condicional» del REQ §5.5 se implementó como
  **`SELECT ... FOR UPDATE` + validación de dominio antes del `UPDATE`**; no hay
  `UPDATE ... WHERE estado = origen`. La fila bloqueada garantiza la
  serialización y el dominio decide si la transición es válida.
- Los perdedores de una carrera reciben errores de dominio claros. La excepción
  deliberada es R09-05: desde un estado terminal, `asignar()` responde
  `VIAJE_NO_DISPONIBLE` y no `TRANSICION_INVALIDA` (ADR-0004, carrera
  aceptación-vs-cancelación). Es una decisión cerrada, no un bug.
- RF-07 y RF-22 siguen pendientes (D4); la integración de RF-08 con ofertas
  también.

## 2. Cobertura de la tarjeta

| RF / ADR | Qué exige | Estado en la implementación actual | Conclusión |
|---|---|---|---|
| **RF-09** | Máquina de estados del viaje con transiciones válidas y rechazo de las inválidas. | Nueve estados en el dominio y en la base; `en-camino`, `iniciar` y `finalizar` desde `EN_CURSO`, con `iniciadoEn` persistido y expuesto. | **Implementado y verificado.** |
| **RF-07** | Ofertas con vencimiento, aceptación/rechazo y expiración. | No hay tabla `ofertas`, entidad, repositorio, caso de uso ni rutas. Solo están los códigos de error en `error-mapping.js`. | **Pendiente por D4.** Especificado en §6.1. |
| **RF-22** | Viaje sin candidatos termina en `SIN_CHOFERES_DISPONIBLES`. | El estado existe, pero ninguna operación lo alcanza. | **Pendiente por D4.** Especificado en §6.2. |
| **RF-08** | Aceptación exclusiva: un solo ganador y un chofer como máximo en un viaje activo. | Bloqueo viaje → chofer, `viajeActivoId` UNIQUE e índice parcial. Tests: 50 aceptaciones unitarias y 50 contra PostgreSQL real. | **Cubierto para el flujo directo.** Falta la integración con ofertas. |
| **RF-10** | Cancelación concurrente sin viaje cancelado con chofer ocupado. | Cancelación actor-aware por vínculo con el recurso, desde los estados permitidos, con liberación del chofer en la misma transacción. | **Implementado y verificado.** Sin cancelación por soporte (D8). |
| **ADR-0004** | Bloqueo pesimista en orden fijo, transacciones cortas y rechazos claros. | Vigente para viaje → chofer, incluidas las transiciones y la cancelación por chofer. Test de 50 aceptaciones en PostgreSQL resuelto (D5). | **Vigente y actualizado (D9).** Sigue pendiente el orden viaje → oferta → chofer cuando existan ofertas. |

## 3. Implementación actual

### 3.1 Estados y restricciones en la base

`db/migrations/002_viajes.sql` declara los nueve estados (`SOLICITADO`,
`ASIGNADO`, `CHOFER_EN_CAMINO`, `EN_CURSO`, `FINALIZADO`,
`CANCELADO_POR_PASAJERO`, `CANCELADO_POR_CHOFER`, `CANCELADO_POR_SOPORTE` y
`SIN_CHOFERES_DISPONIBLES`), la coherencia estado/chofer, el requisito de motivo
y cierre para los cancelados, el índice parcial `viajes_chofer_activo_idx` y
`choferes.viaje_activo_id` UNIQUE.

`db/migrations/013_viaje_iniciado_en.sql` agrega `iniciado_en` con backfill de
filas históricas, y los checks `viajes_iniciado_check`,
`viajes_cierre_check`, `viajes_cancelacion_autor_check` y
`viajes_cancelado_por_chofer_check`. Es idempotente y se aplica con
`pnpm db:migrate` (o automáticamente en el arranque con Docker).

`iniciadoEn` está en el repositorio PostgreSQL (`CAMPOS`, `INSERT`, `UPDATE` y
`mapearViaje`) y en `aVistaPublica()` como ISO o `null`.

### 3.2 Transiciones y concurrencia

- `en-camino` e `iniciar` bloquean solo la fila del viaje, validan al chofer
  asignado y el origen en el dominio, y recién entonces persisten. No usan
  `UPDATE ... WHERE estado = origen`.
- `finalizar` bloquea viaje → chofer, valida chofer asignado y `EN_CURSO`, crea
  y ejecuta el cobro, actualiza el viaje, libera al chofer y registra la clave
  de idempotencia en una sola transacción. Conserva `precioFijadoCentavos`
  mientras E4 no calcule la tarifa final (D7).
- `cancelar` bloquea el viaje, decide por vínculo (`pasajeroId` o `choferId`
  igual al `usuarioId` del actor), aplica la transición de dominio y, si había
  chofer, bloquea su perfil y lo libera en la misma transacción.
- `PostgresDatabase.transaccion()` revierte completo y reintenta errores de
  serialización (`40001`) o interbloqueo (`40P01`) hasta dos veces.
- Ninguna operación toma el chofer antes que el viaje (ADR-0004).

### 3.3 Pruebas que cubren el cambio

| Archivo | Cobertura |
|---|---|
| `tests/unit/domain/viaje.test.js` | Matriz de transiciones válidas e inválidas, `iniciadoEn`, motivo de cancelación y estados terminales. |
| `tests/unit/application/viajes/marcar-en-camino.test.js`, `iniciar-viaje.test.js` | Éxito, chofer ajeno, viaje inexistente, origen inválido y transición repetida. |
| `tests/unit/application/viajes/finalizar-viaje.test.js` | Finalización desde `EN_CURSO`, rechazo desde `ASIGNADO`, idempotencia, cobro único y liberación. |
| `tests/unit/application/viajes/cancelar-viaje.test.js` | Cancelación del pasajero y del chofer, liberación, motivo inválido y carreras. |
| `tests/integration/authorization.test.js` | Matriz de roles y recursos: chofer asignado cancela `200`; chofer ajeno `403`. |
| `tests/integration/cobros.test.js` | Llega a `EN_CURSO` antes de finalizar; cobro único e idempotencia. |
| `tests/integration/postgres/postgres.test.js` | 50 aceptaciones concurrentes, chofer ocupado, aceptación contra cancelación, `iniciado_en`, transiciones, carreras nuevas, motivo 500/501 y cobro idempotente. |

### 3.4 Estado de la verificación local

| Comando | Resultado observado |
|---|---|
| `pnpm format:check` | OK. |
| `pnpm lint` | OK. |
| `pnpm test:unit` | 189 tests, 189 pass, 0 fail. |
| `pnpm test:integration` | 58 tests, 58 pass, 0 fail; 4 suites PostgreSQL omitidas en este comando (se ejecutan en el siguiente). |
| `pnpm test:db:up` → `pnpm test:integration:db` → `pnpm test:db:down` | 48 tests PostgreSQL reales, 48 pass, 0 fail, 0 skipped. Incluye 50 aceptaciones concurrentes, las carreras nuevas y motivo 500/501. |
| `pnpm verificar` | 15 OK, 0 fail, 3 omitidos (PM-10, PM-17, PM-18). |
| `pnpm test:db:up` → `pnpm verificar:postgres` | 16 OK, 0 fail, 2 omitidos (PM-17 requiere `--auditoria`, PM-18 requiere `--suite`). |

PostgreSQL **sí se ejecutó en vivo**: se levantó `compose.test.yaml` con
`pnpm test:db:up`, se corrieron las suites reales y se bajó con
`pnpm test:db:down`. `TEST_DATABASE_URL` no es un bloqueo: el runner efímero
configura la conexión. El orden exacto está en §10.1.

## 4. Requerimientos implementados

### 4.1 RF-09 — Transiciones del chofer

| ID | Requerimiento | Criterio verificado |
|---|---|---|
| R09-01 | El chofer asignado marca el viaje en camino. | `POST /viajes/:id/en-camino` sobre `ASIGNADO` responde `200` y deja `CHOFER_EN_CAMINO`. No cambia `asignadoEn`, `iniciadoEn` ni `cerradoEn`. |
| R09-02 | El chofer asignado inicia el viaje. | `POST /viajes/:id/iniciar` sobre `CHOFER_EN_CAMINO` responde `200`, deja `EN_CURSO` y fija `iniciadoEn` con el reloj del servidor. |
| R09-03 | El chofer asignado finaliza el viaje. | `POST /viajes/:id/finalizar` sobre `EN_CURSO` responde `200`, deja `FINALIZADO`, fija `cerradoEn`, libera al chofer y registra un único cobro. Conserva `Idempotency-Key` y el replay. |
| R09-04 | Rechazar toda transición no listada. | Otros orígenes responden `409 TRANSICION_INVALIDA` y no modifican viaje, chofer, cobro ni claves. Ejemplos: `en-camino` desde `SOLICITADO` o `EN_CURSO`; `iniciar` desde `ASIGNADO`; `finalizar` desde `ASIGNADO` o `CHOFER_EN_CAMINO`. |
| R09-05 | Los estados terminales son inmutables. | `FINALIZADO` y los cancelados no admiten transiciones. **Decisión cerrada:** desde un estado terminal `asignar()` responde `409 VIAJE_NO_DISPONIBLE`, no `TRANSICION_INVALIDA`, por ADR-0004 (carrera aceptación-vs-cancelación). No es un bug. |
| R09-06 | Coherencia entre estado y chofer. | `CHOFER_EN_CAMINO` y `EN_CURSO` exigen `choferId`; el dominio los acepta y `esParticipante()` autoriza al chofer asignado. `ESTADOS_DEMANDA_ACTIVA` los incluye. |
| R09-07 | Persistir y exponer `iniciadoEn`. | Migración 013, repositorio y `aVistaPublica()` (ISO o `null`). |
| R09-08 | Serializar transiciones concurrentes. | `SELECT ... FOR UPDATE` sobre el viaje + validación de dominio; el orden lo decide la fila bloqueada. No se usa `UPDATE ... WHERE estado = origen`. La excepción es `en-camino` contra cancelación del pasajero: no es un solo ganador (R10-07). |
| R09-09 | Autorización por rol y por recurso. | Solo `CHOFER` llega a las rutas; solo el chofer asignado las ejecuta. Otro chofer: `403`; pasajero, administrador y soporte: `403` por rol; viaje inexistente: `404`. |
| R09-10 | No introducir dependencias externas en la transacción. | Solo viaje, chofer, cobro y claves; sin mapas, notificaciones ni servicios externos con filas bloqueadas (ADR-0004). |

### 4.2 RF-10 — Cancelación actor-aware

| ID | Requerimiento | Criterio verificado |
|---|---|---|
| R10-01 | El pasajero dueño cancela en `SOLICITADO`, `ASIGNADO` o `CHOFER_EN_CAMINO`. | Responde `200`, deja `CANCELADO_POR_PASAJERO`, registra autor, `cerradoEn` y motivo; libera al chofer si lo había. |
| R10-02 | El chofer asignado cancela en `ASIGNADO` o `CHOFER_EN_CAMINO`. | Responde `200`, deja `CANCELADO_POR_CHOFER`, `canceladoPorId = choferId`, conserva `choferId` como historial y libera al chofer. |
| R10-03 | El chofer no puede cancelar en estados inválidos. | `EN_CURSO` y terminales: `409 TRANSICION_INVALIDA`. En `SOLICITADO` no hay chofer asignado: `403 NO_AUTORIZADO` por recurso. |
| R10-04 | El chofer (y el pasajero) no puede cancelar `EN_CURSO`. | `409 TRANSICION_INVALIDA`. Como el chofer no puede cancelar en ese estado, `finalizar` gana siempre contra la cancelación del chofer: no hay doble cobro y el chofer queda libre; la rama «gana la cancelación» no es alcanzable. La cancelación por soporte queda fuera de alcance (D8). |
| R10-05 | Cancelaciones simultáneas. | Gana una sola: un estado terminal, un autor y una liberación. La otra recibe `409`. |
| R10-06 | Cancelación contra aceptación. | Si gana la cancelación, la aceptación recibe `VIAJE_NO_DISPONIBLE`; si gana la aceptación, la cancelación libera al chofer. Nunca queda cancelado con chofer ocupado. |
| R10-07 | Cancelación contra transición. | Se serializan por la fila del viaje. `marcarEnCamino` contra cancelación del pasajero **no** es un solo ganador: por D3 el pasajero puede cancelar desde `CHOFER_EN_CAMINO`, así que si el chofer marca en camino primero la cancelación también puede completarse después. El invariante es de **coherencia**: `CHOFER_EN_CAMINO` con chofer ocupado o `CANCELADO_POR_PASAJERO` con chofer libre, nunca cancelado con chofer ocupado. `finalizar` gana siempre contra la cancelación del chofer (R10-04); `iniciar` solo compite con la cancelación del pasajero desde `CHOFER_EN_CAMINO`. No hay doble cobro. |
| R10-08 | Motivo obligatorio y acotado. | HTTP (Zod) y dominio (`validarMotivo`): obligatorio, no vacío y hasta 500 caracteres (`DATOS_INVALIDOS`). En la base: `VARCHAR(500)` y check de no nulo para cancelados, **sin check de no vacío**; `>500` lo rechaza también la base con `22001`. |
| R10-09 | Autorización por recurso. | Solo pasajero dueño o chofer asignado. Otro pasajero/chofer: `403`. Administrador y soporte: `403` por rol (D8). |
| R10-10 | La cancelación no genera cobro. | Ningún cancelado crea `CobroSimulado`. |

### 4.3 Contrato HTTP implementado

| Método y ruta | Rol | Transición | Errores principales |
|---|---|---|---|
| `POST /viajes/:id/en-camino` | `CHOFER` asignado | `ASIGNADO → CHOFER_EN_CAMINO` | `400`, `403`, `404`, `409 TRANSICION_INVALIDA` |
| `POST /viajes/:id/iniciar` | `CHOFER` asignado | `CHOFER_EN_CAMINO → EN_CURSO` | `400`, `403`, `404`, `409 TRANSICION_INVALIDA` |
| `POST /viajes/:id/finalizar` | `CHOFER` asignado | `EN_CURSO → FINALIZADO` | `400 CLAVE_DE_IDEMPOTENCIA_REQUERIDA`, `403`, `404`, `409 TRANSICION_INVALIDA` |
| `POST /viajes/:id/cancelar` | `PASAJERO` dueño o `CHOFER` asignado | Según actor y estado | `400 DATOS_INVALIDOS`, `403`, `404`, `409 TRANSICION_INVALIDA` |

Las tres primeras rutas tienen cuerpo vacío y responden `{ "viaje": { … } }`
con `iniciadoEn` en la vista. `finalizar` responde `{ "viaje", "cobro" }` y
conserva `Idempotency-Key`. `cancelar` exige `{ "motivo" }`. Las cuatro comparten
el contador de rate limit «de viajes» con crear, aceptar, cotizar, confirmar y
las escrituras administrativas (`docs/api.md` §7.1).

### 4.4 Persistencia y decisión D27

La migración 013 es idempotente y agrega los checks de `iniciado_en`, cierre y
autor de cancelación; el repositorio PostgreSQL lee y escribe la columna nueva.

**D27 sigue abierta:** `finalizar` sobre un viaje `SOLICITADO` responde
`403 NO_AUTORIZADO` (`"Solo el chofer asignado puede finalizar este viaje."`) y
no `409 TRANSICION_INVALIDA`, porque se valida al chofer antes que el estado.
Se documenta como comportamiento actual, no como cierre de la decisión.

## 5. Decisiones cerradas de la entrega

| # | Decisión | Estado |
|---|---|---|
| D1 | `finalizar` exige `EN_CURSO`; se descarta el origen `ASIGNADO` legacy. | Cerrado. Tests y flujos actualizados. |
| D2 | `iniciado_en` se agrega en esta entrega (migración 013). | Cerrado. |
| D3 | El pasajero cancela también desde `CHOFER_EN_CAMINO`. | Cerrado. |
| D4 | RF-07 y RF-22 no se implementan en esta rama. | Cerrado: siguen pendientes y especificados en §6. |
| D5 | Test de 50 aceptaciones contra PostgreSQL. | Cerrado: 50 casos en `tests/integration/postgres/postgres.test.js:634`, ejecutados en vivo en la suite de 48 tests PostgreSQL reales. |
| D6 | Una sola ruta `/cancelar` actor-aware; el caso de uso decide por vínculo con el recurso, no por rol. | Cerrado. |
| D7 | `finalizar` sigue cobrando `precioFijadoCentavos`; la tarifa final es E4. | Cerrado. |
| D8 | Sin cancelación por soporte: queda para E5/RF-15. | Cerrado y vigente. |
| D9 | Actualizar el ADR-0004 al cerrar. | Cerrado: el ADR refleja transiciones implementadas, test de 50 resuelto y ofertas pendientes. |

## 6. Alcance pendiente por D4

> RF-07, RF-22 y la integración de RF-08 con ofertas **no están implementados**.
> Se dejan especificados para la tarjeta que los retome.

### 6.1 RF-07 — Ofertas con vencimiento

| ID | Requerimiento | Criterio de aceptación |
|---|---|---|
| R07-01 | Persistir ofertas. | Tabla `ofertas` con `id`, `viaje_id`, `chofer_id`, `orden`, `estado`, `creada_en`, `vence_en`, `respondida_en`; único `(viaje_id, chofer_id)`; estados `PENDIENTE`, `ACEPTADA`, `RECHAZADA`, `VENCIDA`, `ANULADA`. |
| R07-02 | Vencimiento exclusivo. | Solo se acepta si `ahora < vence_en` y está `PENDIENTE`; si no, `410 OFERTA_VENCIDA` o `409 OFERTA_NO_PENDIENTE`. |
| R07-03 | Expiración sin cliente. | La validez no depende de que corra un proceso de vencimiento (I6). |
| R07-04 | Carrera aceptación/vencimiento. | Escritura condicional sobre la oferta: gana una sola. |
| R07-05 | API de ofertas. | `GET /ofertas`, `POST /ofertas/:id/aceptar`, `POST /ofertas/:id/rechazar` (`docs/api.md` §5.5). |

### 6.2 RF-22 — Viaje sin candidatos

| ID | Requerimiento | Criterio de aceptación |
|---|---|---|
| R22-01 | Cerrar un viaje sin candidatos. | `SOLICITADO` sin elegibles ni ofertas `PENDIENTE` pasa a `SIN_CHOFERES_DISPONIBLES`, sin chofer ni cobro. |
| R22-02 | Plazo total de búsqueda. | Al cumplirse, el viaje cierra y las ofertas `PENDIENTE` pasan a `ANULADA`. |
| R22-03 | Concurrencia. | Bloqueo viaje → ofertas; compite con aceptación y cancelación. |
| R22-04 | Sin reapertura. | Desde `SIN_CHOFERES_DISPONIBLES` no sale ninguna transición. |

### 6.3 RF-08 — Integración con ofertas

Cuando existan ofertas, la aceptación bloqueará **viaje → oferta → chofer**,
marcará la oferta `ACEPTADA`, anulará las demás `PENDIENTE` y recién entonces
ocupará al chofer. La aceptación directa ya garantiza un solo ganador y un chofer
como máximo en un viaje activo.

## 7. Verificación de la máquina de estados

- Constructor y `aVistaPublica()` aceptan los nueve estados y exponen
  `iniciadoEn`.
- Matriz válida: `ASIGNADO → CHOFER_EN_CAMINO`,
  `CHOFER_EN_CAMINO → EN_CURSO` (con `iniciadoEn`), `EN_CURSO → FINALIZADO`
  (con `cerradoEn`), cancelación del pasajero desde `SOLICITADO`/`ASIGNADO`/
  `CHOFER_EN_CAMINO` y del chofer desde `ASIGNADO`/`CHOFER_EN_CAMINO`.
- Matriz inválida: cualquier otro origen lanza `TRANSICION_INVALIDA` y no muta
  la entidad. Excepción deliberada documentada en R09-05.
- Aplicación: éxito, actor ajeno, viaje inexistente, origen inválido,
  idempotencia, cobro único, liberación única y carreras
  (`en-camino`/`iniciar`/`finalizar` contra cancelación, dos cancelaciones y dos
  transiciones simultáneas). En `en-camino` contra cancelación del pasajero se
  verifica la **coherencia**, no un único ganador: si gana `en-camino`, la
  cancelación posterior también puede completarse (D3). En `finalizar` contra
  cancelación del chofer gana siempre la finalización (R10-04), sin doble cobro.
- HTTP: flujo completo con los cuatro estados intermedios, `iniciadoEn`,
  `cerradoEn`, cobro y perfil del chofer; matriz de roles; `409` en transiciones
  inválidas; `404` para viaje inexistente; replay de finalización con
  `Idempotency-Replayed: true`.
- PostgreSQL: migración 013 idempotente, lectura/escritura de `iniciado_en`,
  checks de tiempos y autor, 50 aceptaciones concurrentes, chofer ocupado,
  aceptación contra cancelación, transiciones, carreras nuevas, motivo 500/501 y
  cancelación por chofer.

## 8. Detalle de concurrencia y orden de bloqueo

La escritura condicional del REQ §5.5 se implementa como
`SELECT ... FOR UPDATE` sobre la fila del viaje más validación de dominio antes
del `UPDATE`, no como `UPDATE ... WHERE estado = origen`:

- `en-camino` e `iniciar`: bloquean solo el viaje; verifican chofer asignado y
  estado de origen en el dominio; persisten la copia resultante.
- `finalizar`: viaje → chofer, cobro y clave en la misma transacción.
- `cancelar`: viaje → chofer (si hay) y liberación solo si
  `chofer.viajeActivoId === viaje.id`.
- Nadie toma el chofer antes que el viaje. Los reintentos por `40001`/`40P01`
  siguen en `PostgresDatabase.transaccion()`.
- Carrera `marcarEnCamino` vs cancelación del pasajero: **no** es de un solo
  ganador. Por D3 el pasajero puede cancelar desde `CHOFER_EN_CAMINO`, así que si
  el chofer marca en camino primero, la cancelación también puede completarse
  después. El invariante es de coherencia: el estado final es
  `CHOFER_EN_CAMINO` con chofer ocupado o `CANCELADO_POR_PASAJERO` con chofer
  libre; nunca un viaje cancelado con chofer ocupado.
- Carrera `finalizar` vs cancelación del chofer: por R10-04 el chofer no puede
  cancelar desde `EN_CURSO`, así que `finalizar` gana siempre; no hay doble cobro
  y el chofer queda libre. La rama «gana la cancelación» no es alcanzable hoy.
  `iniciar` solo compite con la cancelación del pasajero desde
  `CHOFER_EN_CAMINO`.
- El perdedor recibe un error de dominio: `TRANSICION_INVALIDA`,
  `VIAJE_NO_DISPONIBLE`, `CHOFER_OCUPADO` o `NO_AUTORIZADO` según el caso.
  R09-05 documenta la excepción de estados terminales en `asignar()`.

## 9. Verificación PostgreSQL y decisiones

- **D5 resuelta:** el test `50 aceptaciones concurrentes: exactamente un chofer
  gana` está en `tests/integration/postgres/postgres.test.js:634` y pasó en vivo
  dentro de los 48 tests PostgreSQL reales. Ya no hay pendiente de subir de 20 a
  50.
- **D9 cerrada:** el ADR-0004 refleja el test de 50, la idempotencia del cobro y
  las transiciones implementadas; solo queda pendiente el orden
  viaje → oferta → chofer cuando existan ofertas (RF-07).
- La verificación PostgreSQL se ejecutó con Docker: `pnpm test:db:up`,
  `pnpm test:integration:db` (48/48) y `pnpm test:db:down`; además
  `pnpm verificar:postgres` dio 16 OK / 0 fail / 2 omitidos. Ver §10.1.

## 10. Ejecución manual

### 10.1 Comandos

Orden ejecutado con Docker disponible (resultados en §3.4):

```bash
pnpm format:check          # OK
pnpm lint                  # OK
pnpm test:unit             # 189 tests, 189 pass, 0 fail
pnpm test:integration      # 58 tests, 58 pass, 0 fail; 4 suites PG omitidas aquí

pnpm test:db:up             # levanta compose.test.yaml y migra la base de test
pnpm test:integration:db    # 48 tests PostgreSQL reales, 48 pass, 0 fail, 0 skipped
pnpm test:db:down           # baja la base de test

pnpm verificar             # 15 OK, 0 fail, 3 omitidos (PM-10, PM-17, PM-18)

pnpm test:db:up             # requerido por verificar:postgres
pnpm verificar:postgres     # 16 OK, 0 fail, 2 omitidos (PM-17, PM-18)
pnpm test:db:down           # baja la base de test
```

`pnpm test:integration:db` incluye las 50 aceptaciones concurrentes, las carreras
nuevas y el caso de motivo 500/501. Las 4 suites omitidas en
`pnpm test:integration` son justamente las que corren en
`pnpm test:integration:db`. `TEST_DATABASE_URL` solo permite apuntar a una base
externa; no fue necesaria para esta ejecución.

### 10.2 Levantar la app para el flujo HTTP

```bash
pnpm db:up && pnpm db:migrate && pnpm db:seed && pnpm dev
```

Credenciales sembradas (ver `docs/guia-de-prueba-y-rutas.md` §3):
`pasajero@prog4.test` / `Pasajero1234!` y `chofer1@prog4.test` /
`Chofer1234!`. El chofer debe haber informado ubicación reciente
(`PUT /choferes/yo/ubicacion`) para aceptar.

### 10.3 Flujo completo: aceptar → en camino → iniciar → finalizar

```bash
BASE=http://localhost:3000

TOKEN_PASAJERO=$(curl -s -X POST "$BASE/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"pasajero@prog4.test","contrasena":"Pasajero1234!"}' | jq -r '.token')

TOKEN_CHOFER=$(curl -s -X POST "$BASE/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"chofer1@prog4.test","contrasena":"Chofer1234!"}' | jq -r '.token')

CLAVE_VIAJE="req09-$(date +%s)"

VIAJE_JSON=$(curl -s -X POST "$BASE/viajes" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_PASAJERO" \
  -H "Idempotency-Key: $CLAVE_VIAJE" \
  -d '{"origen":{"lat":-34.6037,"lng":-58.3816},"destino":{"lat":-34.6083,"lng":-58.3712}}')
VIAJE_ID=$(echo "$VIAJE_JSON" | jq -r '.viaje.id')
echo "$VIAJE_JSON" | jq '.viaje | {id, estado, iniciadoEn}'

# ASIGNADO
curl -s -X POST "$BASE/viajes/$VIAJE_ID/aceptar" \
  -H "authorization: Bearer $TOKEN_CHOFER" \
  | jq '.viaje | {estado, choferId, iniciadoEn}'

# CHOFER_EN_CAMINO
curl -s -X POST "$BASE/viajes/$VIAJE_ID/en-camino" \
  -H "authorization: Bearer $TOKEN_CHOFER" \
  | jq '.viaje | {estado, iniciadoEn}'

# EN_CURSO: el servidor fija iniciadoEn
curl -s -X POST "$BASE/viajes/$VIAJE_ID/iniciar" \
  -H "authorization: Bearer $TOKEN_CHOFER" \
  | jq '.viaje | {estado, iniciadoEn}'

# FINALIZADO + cobro
CLAVE_FINAL="req09-final-$(date +%s)"
curl -s -X POST "$BASE/viajes/$VIAJE_ID/finalizar" \
  -H "authorization: Bearer $TOKEN_CHOFER" \
  -H "Idempotency-Key: $CLAVE_FINAL" | jq '{estado: .viaje.estado, cerradoEn: .viaje.cerradoEn, cobro}'

# Replay: 200 con Idempotency-Replayed: true y el mismo cobro
curl -s -i -X POST "$BASE/viajes/$VIAJE_ID/finalizar" \
  -H "authorization: Bearer $TOKEN_CHOFER" \
  -H "Idempotency-Key: $CLAVE_FINAL" | sed -n '1,15p'

curl -s "$BASE/viajes/$VIAJE_ID/cobro" \
  -H "authorization: Bearer $TOKEN_PASAJERO" | jq
```

Si se intenta `finalizar` antes de `iniciar`, la respuesta es
`409 TRANSICION_INVALIDA` con
`"Solo un viaje en curso puede finalizarse."`.

### 10.4 Flujo alternativo: cancelación por el chofer desde CHOFER_EN_CAMINO

```bash
CLAVE_CANCEL="req10-$(date +%s)"
CANCEL_JSON=$(curl -s -X POST "$BASE/viajes" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_PASAJERO" \
  -H "Idempotency-Key: $CLAVE_CANCEL" \
  -d '{"origen":{"lat":-34.6037,"lng":-58.3816},"destino":{"lat":-34.6083,"lng":-58.3712}}')
CANCEL_ID=$(echo "$CANCEL_JSON" | jq -r '.viaje.id')

curl -s -X POST "$BASE/viajes/$CANCEL_ID/aceptar" \
  -H "authorization: Bearer $TOKEN_CHOFER" | jq -r '.viaje.estado'
curl -s -X POST "$BASE/viajes/$CANCEL_ID/en-camino" \
  -H "authorization: Bearer $TOKEN_CHOFER" | jq -r '.viaje.estado'

curl -s -X POST "$BASE/viajes/$CANCEL_ID/cancelar" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN_CHOFER" \
  -d '{"motivo":"Cancelado por el chofer antes de iniciar"}' \
  | jq '.viaje | {estado, canceladoPorId, motivoCancelacion, choferId}'

# El chofer queda libre
curl -s "$BASE/choferes/yo" -H "authorization: Bearer $TOKEN_CHOFER" \
  | jq '{estado, viajeActivoId}'
```

Esperado: `CANCELADO_POR_CHOFER`, `canceladoPorId` igual al `userId` del chofer,
`choferId` conservado como historial y `viajeActivoId: null`. El pasajero dueño
puede cancelar en los mismos estados y obtiene `CANCELADO_POR_PASAJERO`; soporte
y administrador reciben `403` por rol (D8).

## 11. Referencias

- `docs/modelo.md` §4.10 (Viaje), §4.11 (Oferta), §6.1 (estados del viaje),
  §6.2 (estados de la oferta), §9.1 (orden de bloqueo), §9.2–§9.5 (carreras).
- `docs/api.md` §4.4 (viajes implementados), §5.5 (ofertas pendientes),
  §5.6 (transiciones), §7.1 (límites) y §8 (D5, D6, D7, D24, D27).
- `docs/adr/0004-bloqueo-de-filas-para-asignacion-y-cancelacion.md`.
- `db/migrations/002_viajes.sql` y `db/migrations/013_viaje_iniciado_en.sql`.
- `src/domain/entities/viaje.js`;
  `src/application/use-cases/viajes/{aceptar,marcar-en-camino,iniciar,finalizar,cancelar}-viaje.js`.
- `src/infrastructure/adapters/out/persistence/postgres-viaje-repository.js` y
  `postgres-chofer-repository.js`.
- `tests/unit/application/viajes/`, `tests/integration/cobros.test.js` y
  `tests/integration/postgres/postgres.test.js`.
- `docs/guia-de-prueba-y-rutas.md` y `docs/prueba-manual-requerimientos.md`.
