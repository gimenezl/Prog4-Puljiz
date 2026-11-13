# API HTTP

- **Base URL:** `http://localhost:3000`
- **Formato:** JSON en solicitudes y respuestas.
- **Autenticación:** `Authorization: Bearer <token>` en las rutas protegidas.
- **Errores:** todas las respuestas de error comparten la forma
  `{ "error": { "codigo", "mensaje" }, "requestId" }`.

## 1. Salud

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/health` | Público | Liveness. No consulta dependencias. |
| `GET` | `/ready` | Público | Readiness. Comprueba base, tablas, cobros, idempotencia y reloj. |

`GET /ready` responde `200` con `estado: "listo"` o `503` si algún chequeo falla
o supera `READINESS_TIMEOUT_MS`.

## 2. Autenticación

| Método | Ruta | Acceso | Cuerpo |
|---|---|---|---|
| `POST` | `/auth/registro` | Público | `{ email, nombre, contrasena, rol }` |
| `POST` | `/auth/login` | Público | `{ email, contrasena }` |
| `GET` | `/auth/yo` | Bearer | — |

- `rol` en el registro solo admite `PASAJERO` o `CHOFER`.
- La contraseña debe tener entre 8 y 72 caracteres, al menos una letra y un
  número.
- El login devuelve `{ tipo: "Bearer", token, expiraEn, usuario }`.
- El login tiene su propio rate limit, que solo cuenta intentos fallidos.

## 3. Usuarios

| Método | Ruta | Acceso | Cuerpo |
|---|---|---|---|
| `GET` | `/usuarios/:id` | Dueño o `ADMINISTRADOR` | — |
| `PATCH` | `/usuarios/:id` | Solo dueño | `{ nombre }` |

La credencial nunca se devuelve.

## 4. Choferes

| Método | Ruta | Acceso | Cuerpo |
|---|---|---|---|
| `GET` | `/choferes/yo` | `CHOFER` | — |
| `PATCH` | `/choferes/yo` | `CHOFER` | `{ disponible: boolean }` |
| `PATCH` | `/choferes/:usuarioId/habilitacion` | `ADMINISTRADOR` | `{ habilitado: boolean }` |

Un chofer nace inhabilitado y no disponible. Para aceptar viajes debe estar
habilitado por un administrador, disponible y sin viaje activo.

## 5. Viajes

| Método | Ruta | Acceso | Cuerpo / cabeceras |
|---|---|---|---|
| `POST` | `/viajes` | `PASAJERO` | `{ origen: { lat, lng }, destino: { lat, lng } }` + `Idempotency-Key` |
| `GET` | `/viajes/disponibles` | `CHOFER` elegible | — |
| `GET` | `/viajes/:id` | Participantes, `ADMINISTRADOR` u `OPERADOR_SOPORTE` | — |
| `POST` | `/viajes/:id/aceptar` | `CHOFER` elegible | — |
| `POST` | `/viajes/:id/finalizar` | Chofer asignado | `Idempotency-Key` |
| `GET` | `/viajes/:id/cobro` | Participantes, `ADMINISTRADOR` u `OPERADOR_SOPORTE` | — |
| `POST` | `/viajes/:id/cancelar` | `PASAJERO` dueño | `{ motivo }` |

### Crear un viaje

```http
POST /viajes
Authorization: Bearer <token-pasajero>
Idempotency-Key: 5f0c2d9e-...
Content-Type: application/json

{
  "origen": { "lat": -34.6037, "lng": -58.3816 },
  "destino": { "lat": -34.6083, "lng": -58.3712 }
}
```

- Primera ejecución: `201` con `{ viaje }`.
- Replay con la misma clave y el mismo contenido: `200`, cabecera
  `Idempotency-Replayed: true`.
- Misma clave y otro contenido: `409 CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO`.
- El precio se calcula siempre en el servidor.

### Finalizar y cobrar

```http
POST /viajes/<viajeId>/finalizar
Authorization: Bearer <token-chofer-asignado>
Idempotency-Key: 9b7e...
```

Respuesta `200`:

```json
{
  "viaje": {
    "id": "...",
    "estado": "FINALIZADO",
    "cerradoEn": "2026-11-12T14:30:00.000Z",
    "...": "..."
  },
  "cobro": {
    "id": "...",
    "viajeId": "...",
    "montoCentavos": 154050,
    "estado": "COBRADO",
    "creadoEn": "2026-11-12T14:30:00.000Z",
    "cobradoEn": "2026-11-12T14:30:00.000Z",
    "referencia": "SIM-..."
  }
}
```

- Solo el chofer asignado puede finalizar.
- Solo se puede finalizar un viaje `ASIGNADO`.
- La operación finaliza el viaje, libera al chofer y registra el cobro en una
  sola transacción.
- Un replay con la misma clave devuelve `200` e
  `Idempotency-Replayed: true`.
- Un viaje solo puede tener un cobro (`viaje_id` es `UNIQUE`).
- La referencia del simulador es determinista: `SIM-<viajeId>`.

La política completa está en `docs/politica-de-idempotencia.md`.

### Consultar el cobro

```http
GET /viajes/<viajeId>/cobro
Authorization: Bearer <token>
```

- `200` con `{ cobro }` si existe.
- `404 NO_ENCONTRADO` si el viaje no existe o todavía no tiene cobro.
- `403 NO_AUTORIZADO` si el solicitante no es participante ni tiene un rol de
  consulta.

## 6. Rate limits

| Ámbito | Variables | Valor por defecto |
|---|---|---|
| Global | `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` | 60 s, 300 pedidos |
| Login | `LOGIN_RATE_LIMIT_WINDOW_MS`, `LOGIN_RATE_LIMIT_MAX` | 15 min, 5 fallos |
| Registro | `REGISTRO_RATE_LIMIT_WINDOW_MS`, `REGISTRO_RATE_LIMIT_MAX` | 60 s, 10 pedidos |
| Viajes | `VIAJES_RATE_LIMIT_WINDOW_MS`, `VIAJES_RATE_LIMIT_MAX` | 60 s, 30 pedidos |

El límite de viajes se aplica a `POST /viajes`, `/aceptar`, `/finalizar` y
`/cancelar`.

Todas las respuestas incluyen los encabezados informativos del estándar
`RateLimit-*`:

```http
RateLimit-Limit: 30
RateLimit-Remaining: 29
RateLimit-Reset: 41
```

Cuando se supera el límite:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 41

{
  "error": {
    "codigo": "DEMASIADAS_SOLICITUDES",
    "mensaje": "Se superó el límite de operaciones sobre viajes. Intente más tarde."
  },
  "requestId": "..."
}
```

## 7. Códigos de estado

| Código | Uso |
|---|---|
| `200` | Operación exitosa o replay idempotente. |
| `201` | Recurso creado (registro, viaje nuevo). |
| `400` | Validación inválida o falta de `Idempotency-Key`. |
| `401` | Sin token o token inválido. |
| `403` | Autenticado sin permiso sobre el recurso. |
| `404` | Recurso inexistente. |
| `409` | Conflicto de estado, chofer ocupado o clave reutilizada. |
| `413` | Cuerpo demasiado grande. |
| `415` | Codificación no soportada. |
| `422` | Fuera de cobertura. |
| `429` | Rate limit superado. |
| `503` | Readiness con una dependencia caída. |
