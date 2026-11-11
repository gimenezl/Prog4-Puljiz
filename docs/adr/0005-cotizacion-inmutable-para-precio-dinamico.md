# ADR-0005: Cotización inmutable y confirmación condicional para el precio dinámico

- **Estado:** Propuesto (se acepta en el PR que implemente RF-16, RF-17 y RF-18)
- **Fecha:** 2026-11-11
- **Participantes:** Lucas Gimenez, Guido Ayala, Enzo Vernet
- **Tarjeta:** E2 · ADR de precio dinámico y cotización

## Contexto

La variante del grupo es el **precio dinámico**: cuando en una zona las
solicitudes superan a los choferes disponibles, el precio sube con un
multiplicador (RF-16). El pasajero ve el multiplicador y el precio antes de
confirmar (RF-17), y al confirmar ese precio queda fijo aunque la demanda cambie
(RF-18). RF-19 exige probar la carrera entre el recálculo del multiplicador y la
confirmación: **el precio que vio es el que paga**.

Hay que decidir:

1. cómo y cuándo se calcula el multiplicador de una zona;
2. cómo se garantiza que la confirmación usa exactamente lo que vio el pasajero;
3. qué se guarda para auditar y explicar cada precio.

Estado actual del código: `src/domain/services/precio-base.js` calcula un precio
fijo por distancia (base + km, con mínimo y máximo) y lo guarda en
`viajes.precio_fijado_centavos`. Todavía no hay zonas, reglas, multiplicador ni
cotizaciones. Las entidades ya están definidas en `docs/modelo.md` (secciones 4.5
a 4.9 y 7).

## Alternativas consideradas

### Momento del cálculo del multiplicador

| Alternativa                      | Ventajas                                                                                                                                      | Desventajas                                                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **A1. Al cotizar** (propuesta)   | Siempre usa la demanda del momento; no hace falta un proceso periódico; la cotización guarda los dos números usados (solicitudes y choferes). | Cada cotización cuenta solicitudes y choferes de la zona: es una consulta más por pedido, que hay que medir en E4.   |
| A2. Recálculo periódico por zona | La cotización solo lee el último multiplicador; consulta barata.                                                                              | Necesita un proceso programado; el multiplicador puede estar desactualizado entre recálculos; más piezas que probar. |

### Garantía de «el precio que vio es el que paga»

| Alternativa                                                               | Ventajas                                                                                                                                                                                                                                                                    | Desventajas                                                                                                                                    |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **B1. Cotización inmutable persistida** (propuesta)                       | La confirmación no vuelve a calcular nada: copia precio y multiplicador de la cotización. El recálculo nunca toca la cotización, así que **no comparten ningún recurso** y la carrera desaparece. Auditable: la cotización guarda zona, conteos, versión de regla y tarifa. | Hay que guardar una fila por cotización (también las que nunca se confirman) y limpiarlas.                                                     |
| B2. Recalcular al confirmar y comparar con el precio que manda el cliente | No hace falta guardar cotizaciones.                                                                                                                                                                                                                                         | Confía en un importe del cliente (prohibido por RF-17); si el precio cambió, el pasajero recibe un rechazo aunque haya visto un precio válido. |
| B3. Token firmado con el precio (sin persistir)                           | Sin fila en la base.                                                                                                                                                                                                                                                        | Para auditar (RF-18) igual hay que guardar los datos al confirmar; la doble confirmación con el mismo token necesita otro mecanismo.           |

## Decisión (propuesta)

1. **Multiplicador al cotizar (A1).** Al cotizar se cuentan las solicitudes y los
   choferes disponibles de la zona del origen y se aplica la regla de
   multiplicador vigente (`docs/modelo.md`, §7.1). Si las mediciones de E4
   muestran que es caro, se pasa a A2 sin cambiar la cotización: A1 es el caso de
   A2 con período cero.
2. **Cotización inmutable (B1).** La cotización guarda origen, destino, distancia y
   tiempo estimados, zona, solicitudes y choferes usados, versión de la regla y de
   la tarifa, multiplicador, precio y vencimiento. Solo cambia su `estado`
   (`VIGENTE` → `CONFIRMADA` o `VENCIDA`).
3. **Confirmación con escritura condicional**, en una sola transacción:

   ```sql
   BEGIN;
   -- reservar la clave de idempotencia (ADR-0002)
   UPDATE cotizaciones
      SET estado = 'CONFIRMADA'
    WHERE id = $1 AND pasajero_id = $2
      AND estado = 'VIGENTE' AND vence_en > $3
   RETURNING precio_centavos, multiplicador, ...;
   -- 0 filas: COTIZACION_VENCIDA o COTIZACION_YA_CONFIRMADA
   INSERT INTO viajes (..., cotizacion_id, precio_fijado_centavos, multiplicador_fijado)
   VALUES (..., $1, <precio de la cotización>, <multiplicador de la cotización>);
   COMMIT;
   ```

   Un índice único sobre `viajes.cotizacion_id` impide dos viajes por la misma
   cotización aunque fallara el `UPDATE`.

4. **El cliente nunca manda importes.** La API de confirmación recibe solo el id de
   la cotización y la clave de idempotencia; un campo `precio` se rechaza por el
   esquema estricto.
5. Los cambios de regla o tarifa del administrador (RF-23) publican una versión
   nueva y se aplican a cotizaciones nuevas, nunca a viajes confirmados.

## Consecuencias

- RF-19 se prueba ejecutando confirmación y recálculo a la vez en ambos órdenes y
  verificando que el viaje tiene el precio y el multiplicador de la cotización
  (`docs/modelo.md`, §9.6).
- Hace falta una migración nueva con `zonas_de_demanda`, `reglas_multiplicador`,
  `tarifas` y `cotizaciones`, y agregar `cotizacion_id` y `multiplicador_fijado` a
  `viajes`. `precio-base.js` pasa a ser parte de `calcularPrecio` con multiplicador.
- La tarifa final (RF-12) usa la misma función pero respeta el precio y el
  multiplicador fijados.
- Las cotizaciones vencidas se acumulan: hay que definir una limpieza (por ejemplo,
  borrar las vencidas de más de un día que no tienen viaje).
- Quedan como «valor inicial a configurar»: vigencia de la cotización, umbrales,
  multiplicador mínimo y máximo, y la ventana de conteo de solicitudes.
- Depende de cómo se ubica un punto en una zona: ver ADR-0006.

## Condición de revisión

Reabrir si contar la demanda al cotizar supera el p95 objetivo del endpoint de
estimación en las mediciones de E4 (pasar a A2), si el volumen de cotizaciones sin
confirmar crece más de lo que la limpieza resuelve, o si la cátedra pide precios
por tipo de vehículo o por zona.
