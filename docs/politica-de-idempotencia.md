# Política de idempotencia

Esta política cubre las dos operaciones que producen efectos persistentes y que
pueden reintentarse por un cliente, por un proxy o por la red:

| Operación | Endpoint | Efecto | Alcance de la clave |
|---|---|---|---|
| Confirmar/crear un viaje | `POST /viajes` | Crea un viaje y fija su precio | `viaje:crear:<pasajeroId>` |
| Finalizar y cobrar un viaje | `POST /viajes/:id/finalizar` | Finaliza el viaje, libera al chofer y registra un cobro simulado | `viaje:finalizar:<choferId>` |

## 1. Contrato del cliente

1. Toda petición a `POST /viajes` o `POST /viajes/:id/finalizar` debe incluir la
   cabecera `Idempotency-Key`.
2. La clave es un valor no vacío. Se recomienda un UUID generado por el cliente
   por cada operación lógica, no por cada reintento.
3. El cliente debe reutilizar exactamente la misma clave y el mismo contenido
   mientras esté reintentando la misma operación.
4. Si cambia el contenido de la operación, debe usar una clave nueva.

Si falta la cabecera, la API responde:

```http
HTTP/1.1 400 Bad Request

{
  "error": {
    "codigo": "CLAVE_DE_IDEMPOTENCIA_REQUERIDA",
    "mensaje": "La cabecera Idempotency-Key es obligatoria para crear un viaje."
  },
  "requestId": "..."
}
```

## 2. Registro de la clave

La clave se guarda en la tabla `claves_idempotencia` con:

- `alcance`: prefijo que incluye el usuario que ejecuta la operación;
- `clave`: valor enviado por el cliente;
- `hash_contenido`: SHA-256 del contenido canónico de la operación;
- `respuesta`: respuesta pública original, en JSON;
- `creada_en` y `vence_en`.

La clave primaria compuesta `(alcance, clave)` impide que dos peticiones
registren la misma operación. El alcance por usuario evita que dos clientes que
eligen la misma clave se pisen entre sí.

### Huella de contenido

- `POST /viajes`: se calcula sobre el origen y el destino normalizados.
- `POST /viajes/:id/finalizar`: se calcula sobre el `viajeId`.

La serialización ordena las claves de los objetos antes de aplicar SHA-256. Por
eso el orden de las propiedades JSON no cambia la huella.

## 3. Comportamiento ante reintentos

### Misma clave, mismo contenido

Se devuelve la respuesta original sin repetir el efecto:

```http
HTTP/1.1 200 OK
Idempotency-Replayed: true

{
  "viaje": { "id": "...", "estado": "FINALIZADO", "...": "..." },
  "cobro": { "id": "...", "estado": "COBRADO", "...": "..." }
}
```

Para `POST /viajes`, la primera ejecución responde `201` y el replay `200`. Para
`POST /viajes/:id/finalizar`, ambas respuestas son `200`.

### Misma clave, contenido distinto

Se rechaza con `409` y no se ejecuta ningún efecto nuevo:

```http
HTTP/1.1 409 Conflict

{
  "error": {
    "codigo": "CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO",
    "mensaje": "La clave de idempotencia ya fue usada con otro contenido."
  },
  "requestId": "..."
}
```

### Clave vencida

Cada registro vence según `IDEMPOTENCIA_TTL_MS` (24 horas por defecto). Si llega
un reintento con una clave vencida:

- el registro vencido se elimina;
- la operación se evalúa como una petición nueva;
- si el viaje ya está finalizado, la finalización se rechaza con
  `409 TRANSICION_INVALIDA` y **no** se cobra de nuevo;
- si se trata de una creación, se genera un viaje nuevo.

La limpieza es perezosa: el borrado del registro vencido ocurre cuando se
vuelve a usar la misma clave. El índice `claves_idempotencia_vence_en_idx`
permite ubicar registros vencidos sin recorrer toda la tabla y deja preparada
una purga periódica futura.

## 4. Atomicidad

### Crear un viaje

El viaje y la clave de idempotencia se escriben en la misma transacción:

1. se busca la clave;
2. si no existe, se crea el viaje;
3. se registra la clave con la respuesta;
4. si el registro de la clave falla porque otra transacción ganó la carrera, se
   revierte todo y se devuelve la respuesta ganadora.

### Finalizar y cobrar

La finalización es una sola operación atómica:

1. se bloquea la fila del viaje con `SELECT ... FOR UPDATE`;
2. se busca la clave después del bloqueo, para que un reintento simultáneo vea
   la respuesta ya confirmada;
3. se valida que el chofer sea el asignado y que el viaje esté `ASIGNADO`;
4. se crea el cobro `PENDIENTE`;
5. se ejecuta el simulador determinista;
6. se confirma el cobro como `COBRADO`;
7. se actualiza el viaje a `FINALIZADO` con `cerrado_en`;
8. se libera al chofer;
9. se registra la clave con la respuesta.

Si cualquiera de esos pasos falla, la transacción revierte el viaje, el cobro,
el chofer y la clave. El simulador no mueve dinero y su referencia es
determinista (`SIM-<viajeId>`), por lo que un reintento tampoco duplica el
efecto externo.

## 5. Garantías contra el doble cobro

El cobro tiene dos defensas independientes:

1. **Clave de idempotencia de la operación:** un reintento con la misma clave
   devuelve el cobro original.
2. **Clave natural `viaje_id` UNIQUE:** la tabla `cobros_simulados` no admite
   más de un cobro por viaje, aunque dos operaciones usen claves distintas.

Además, la transición del viaje solo permite finalizar desde `ASIGNADO`. Si dos
peticiones con claves distintas compiten, la primera finaliza y la segunda
recibe `409 TRANSICION_INVALIDA`; la base termina con un solo cobro.

## 6. Concurrencia

| Escenario | Resultado esperado |
|---|---|
| Dos peticiones simultáneas, misma clave, mismo contenido | Una ejecuta el efecto; la otra recibe el replay. Un solo cobro. |
| Dos peticiones simultáneas, claves distintas, mismo viaje | Una finaliza; la otra recibe `409 TRANSICION_INVALIDA`. Un solo cobro. |
| Reintento después de un timeout de red | Si la primera transacción se confirmó, devuelve la respuesta original. |
| Reintento después de un fallo antes del commit | No hay clave registrada; la operación puede ejecutarse de nuevo. |
| Dos viajes distintos con la misma clave y el mismo chofer | El segundo recibe `409 CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO`. |

En PostgreSQL la serialización se apoya en `SELECT ... FOR UPDATE` y en las
restricciones únicas. En los adaptadores en memoria, la unidad de trabajo
serializa las transacciones y restaura una instantánea si la operación falla.

## 7. Consulta del cobro

`GET /viajes/:id/cobro` es de solo lectura y no requiere clave de idempotencia.
Está autorizado para el pasajero, el chofer asignado, un administrador o un
operador de soporte. Si el viaje todavía no tiene cobro, responde `404`.

## 8. Cobertura de pruebas

La política se verifica en:

- `tests/unit/application/viajes/crear-viaje.test.js`
- `tests/unit/application/viajes/finalizar-viaje.test.js`
- `tests/unit/domain/cobro-simulado.test.js`
- `tests/integration/cobros.test.js`
- `tests/integration/postgres/postgres.test.js`

Los casos incluyen replay, conflicto de contenido, clave vencida, concurrencia
con la misma clave, concurrencia con claves distintas, autorización y unicidad
del cobro por viaje.
