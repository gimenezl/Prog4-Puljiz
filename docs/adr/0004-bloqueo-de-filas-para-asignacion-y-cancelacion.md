# ADR-0004: Bloqueo de filas en orden fijo para asignar y cancelar viajes

- **Estado:** Aceptado y actualizado: el test de 50 aceptaciones contra
  PostgreSQL está resuelto; las ofertas con vencimiento siguen pendientes (D4)
- **Fecha:** 2026-11-11
- **Participantes:** Lucas Gimenez, Guido Ayala, Enzo Vernet
- **Tarjeta:** E3 · ADR de asignación y cancelación

## Contexto

Varias operaciones pueden llegar al mismo tiempo sobre el mismo viaje o el mismo
chofer (`docs/modelo.md`, sección 9):

| #   | Carrera                                                 | Resultado correcto                                                                                                                          |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Muchos choferes aceptan el mismo viaje (RF-08)          | Gana exactamente uno; el resto recibe un rechazo claro.                                                                                     |
| C2  | Un chofer acepta dos viajes distintos a la vez          | Obtiene como máximo uno.                                                                                                                    |
| C3  | Aceptación contra cancelación del pasajero (RF-10)      | O se cancela antes (la aceptación falla con `VIAJE_NO_DISPONIBLE`) o se asigna y después se cancela liberando al chofer. Nunca un viaje cancelado con chofer ocupado. |
| C4  | Aceptación contra vencimiento de la oferta (RF-07)      | Una oferta vencida no se puede aceptar. _Pendiente: todavía no hay ofertas (D4)._                                                          |
| C5  | Dos pedidos con la misma clave de idempotencia          | Se crea un solo viaje y ambos reciben la misma respuesta.                                                                                   |
| C6  | Confirmación contra recálculo del multiplicador (RF-19) | Ver ADR-0005.                                                                                                                               |
| C7  | Reintento del cobro simulado (RF-13)                    | Un solo cobro: clave de idempotencia por chofer más `viaje_id UNIQUE` en `cobros_simulados`. Resuelto.                                      |
| C8  | Cambio de disponibilidad del chofer mientras acepta     | La aceptación ve un estado coherente del chofer.                                                                                            |
| C9  | `en-camino` contra cancelación del pasajero             | No es «un solo ganador»: por D3 el pasajero puede cancelar desde `CHOFER_EN_CAMINO`, así que ambas operaciones pueden completarse en serie. El invariante es de coherencia: `CHOFER_EN_CAMINO` con chofer ocupado o `CANCELADO_POR_PASAJERO` con chofer libre. |
| C10 | `finalizar` contra cancelación del chofer               | Por R10-04 el chofer no puede cancelar desde `EN_CURSO`: `finalizar` gana siempre. No hay doble cobro y el chofer queda libre. No existe la rama «gana la cancelación» con el estado actual. |

Hay que elegir un mecanismo atómico que resuelva estas carreras sin
interbloqueos y que se pueda probar contra la base real.

## Alternativas consideradas

### A. Bloqueo pesimista de filas con `SELECT ... FOR UPDATE` (elegida)

- Ventajas: dentro de la transacción, la lógica de dominio corre sobre un estado
  que nadie más puede cambiar; las reglas siguen en el dominio (`viaje.asignar`,
  `chofer.ocupar`); es fácil de explicar.
- Desventajas: las transacciones que compiten esperan en fila; si dos operaciones
  toman los mismos recursos en distinto orden, hay interbloqueo; requiere
  transacciones cortas.

### B. Escritura condicional optimista (`UPDATE ... WHERE estado = 'SOLICITADO'`)

- Ventajas: sin esperas; una sola sentencia; escala mejor con muchos intentos.
- Desventajas: la regla de negocio se duplica en el `WHERE` del SQL; coordinar dos
  filas (viaje y chofer) obliga a compensar si la segunda escritura falla.

### C. Cola o lock en memoria por viaje

- Ventajas: simple con una sola instancia.
- Desventajas: deja de funcionar con dos instancias del servidor; no sobrevive a un
  reinicio. Se descarta.

## Decisión

Usamos **bloqueo pesimista de filas** en PostgreSQL, con aislamiento `READ
COMMITTED`, y un **orden global de bloqueo**:

1. primero la fila del **viaje** (`SELECT ... FROM viajes WHERE id = $1 FOR UPDATE`);
2. después la fila del **chofer** (`SELECT ... FROM choferes WHERE usuario_id = $1 FOR UPDATE`).

Toda operación que necesite las dos filas las toma en ese orden. Una operación
que solo toca al chofer (cambiar disponibilidad) toma solo la del chofer. Como
nadie toma chofer y después viaje, no puede haber un ciclo de esperas y por lo
tanto no hay interbloqueo.

Cómo se resuelve cada carrera hoy:

- **C1:** la primera transacción bloquea el viaje; las demás esperan. Al liberarse,
  leen el viaje ya `ASIGNADO` y fallan con `VIAJE_NO_DISPONIBLE` (409).
- **C2:** cada transacción bloquea su viaje y después espera por el mismo chofer.
  La segunda ve `viaje_activo_id` ocupado y falla con `CHOFER_OCUPADO` (409).
- **C3:** las dos operaciones bloquean primero el viaje, así que se ejecutan en
  serie. Los dos resultados válidos (cancelado sin chofer, o asignado y luego
  cancelado con el chofer liberado en la misma transacción) quedan definidos en
  `cancelar-viaje.js`.
- **C5:** ver ADR-0002 (índice único `(alcance, clave)` e `INSERT ... ON CONFLICT DO NOTHING`).
- **C9:** las dos operaciones bloquean el viaje y se ejecutan en serie. Si gana
  `en-camino`, el viaje queda `CHOFER_EN_CAMINO` con el chofer ocupado y la
  cancelación del pasajero todavía puede completarse después (D3); si gana la
  cancelación primero, `en-camino` recibe `TRANSICION_INVALIDA`. El invariante
  es de coherencia, no de un único ganador: nunca un viaje cancelado con chofer
  ocupado.
- **C10:** `finalizar` exige `EN_CURSO` y el chofer no puede cancelar en ese
  estado (R10-04), por lo que la cancelación no es alcanzable: gana siempre la
  finalización, con un solo cobro y el chofer libre.
- La «escritura condicional» del requerimiento se implementa como
  `SELECT ... FOR UPDATE` del viaje más validación de dominio antes del
  `UPDATE`, no como `UPDATE ... WHERE estado = origen`. Desde un estado terminal,
  `asignar()` devuelve `VIAJE_NO_DISPONIBLE` y no `TRANSICION_INVALIDA` (C3,
  decisión cerrada).

Segunda línea de defensa en la base (`db/migrations/002_viajes.sql`):

- índice único parcial `viajes_chofer_activo_idx`: un chofer no puede tener dos
  viajes en `ASIGNADO`, `CHOFER_EN_CAMINO` o `EN_CURSO`;
- `choferes.viaje_activo_id` es `UNIQUE`;
- `CHECK` que exige chofer en los estados asignados y lo prohíbe en `SOLICITADO`.

## Consecuencias

- El test `50 aceptaciones concurrentes: exactamente un chofer gana` está en
  `tests/integration/postgres/postgres.test.js:634`, junto a los de chofer que
  no puede tomar dos viajes, aceptación contra cancelación, misma clave
  concurrente, `iniciado_en` y transiciones. **Pasó en vivo** en la suite
  `pnpm test:db:up` → `pnpm test:integration:db` → `pnpm test:db:down`: 48 tests
  PostgreSQL reales, 48 pass, 0 fail, 0 skipped. La verificación HTTP contra la
  misma base (`pnpm verificar:postgres`) dio 16 OK, 0 fail, 2 omitidos.
- **Resuelto:** el test de aceptaciones concurrentes contra PostgreSQL tiene
  **50** casos y se ejecutó con Docker; ya no hay que subirlo de 20 a 50.
- **Pendiente por D4:** cuando existan ofertas (RF-07), la oferta se bloquea
  **después** del viaje y antes del chofer (orden: viaje → oferta → chofer), y el
  vencimiento se compara con el reloj dentro de la transacción.
- Con muchos choferes compitiendo, las transacciones esperan en fila. La medición
  de E4 tiene que registrar el tiempo hasta la asignación.
- Las transacciones tienen que ser cortas: nada de llamadas externas (notificaciones,
  mapas) mientras se tienen filas bloqueadas.

## Condición de revisión

Reabrir si las mediciones de E4 muestran esperas por bloqueo que superan el tiempo
máximo de asignación fijado en la hipótesis, si aparece un interbloqueo en los
logs de PostgreSQL, o si se agrega una operación que necesite bloquear al chofer
antes que al viaje.
