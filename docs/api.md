# Contrato de API y permisos

> **Grupo 7 · Programación IV (UTN)** · Tarjeta «E0 · Contrato de API y permisos»
>
> **Estado:** este contrato ya incluye la configuración administrativa y el flujo de cotización implementados en la rama E2 (§5.2 y §5.3). Los endpoints **existentes** están documentados tal como funcionan hoy y sus ejemplos son respuestas reales de la aplicación levantada con Docker (`docker compose up --build` y `pnpm db:seed`). Los endpoints **propuestos** todavía no existen: están marcados «Propuesto — tarjeta X» y son el acuerdo previo para programarlos.
>
> **Alcance:** variante de **precio dinámico**. No hay flotas, cupos ni administradores de flota.

**Documentos relacionados:** `docs/modelo.md` (entidades, estados y carreras), `docs/adr/0003` (autenticación), `docs/adr/0004` (asignación y cancelación), `docs/adr/0005` (cotización inmutable), `docs/adr/0007` y `docs/python.md` (integración con Python).

**Índice**

1. [Convenciones](#1-convenciones)
2. [Códigos de error](#2-códigos-de-error)
3. [Idempotencia](#3-idempotencia)
4. [Endpoints existentes](#4-endpoints-existentes)
5. [Endpoints propuestos](#5-endpoints-propuestos)
6. [Tabla de permisos](#6-tabla-de-permisos)
7. [Límites](#7-límites)
8. [Diferencias con el modelo](#8-diferencias-con-el-modelo)

---

## 1. Convenciones

| Tema | Regla |
|---|---|
| **URL base** | `http://localhost:3000` en desarrollo (puerto `APP_PORT`). Las rutas no llevan prefijo de versión. |
| **Formato** | JSON en UTF-8. Las solicitudes con cuerpo envían `Content-Type: application/json`. Los esquemas son **estrictos**: un campo no declarado se rechaza con `DATOS_INVALIDOS`. |
| **Autenticación** | `Authorization: Bearer <JWT>`, obtenido en `POST /auth/login` (ADR-0003). El esquema `Bearer` no distingue mayúsculas. El token vence a los `JWT_EXPIRES_IN_MINUTES` minutos (60 por defecto) y no hay refresh token. |
| **Identificadores** | UUID generados por el servidor. Un identificador de ruta que no es UUID se rechaza con `400 DATOS_INVALIDOS`. |
| **Montos** | Enteros en **centavos**, con sufijo `Centavos` en el nombre del campo (por ejemplo, `precioFijadoCentavos`). Nunca punto flotante. **El cliente nunca envía importes.** |
| **Multiplicador** | Texto decimal de escala fija (por ejemplo, `"1.25"`), para no perder precisión. Lo calcula el servidor al cotizar y queda guardado en la cotización y en el viaje. |
| **Distancias y tiempos** | Metros enteros (sufijo `M`) y segundos enteros (sufijo `S`). |
| **Fechas** | ISO-8601 en UTC con milisegundos y `Z` (por ejemplo, `2026-11-12T00:18:36.675Z`). La hora la fija siempre el servidor. |
| **Coordenadas** | Objeto `{ "lat": número, "lng": número }`, con `lat` entre −90 y 90 y `lng` entre −180 y 180. |
| **Correlación** | Cada respuesta incluye la cabecera `x-request-id`. Si la solicitud trae `x-request-id` (o `x-correlation-id`) con formato seguro (`[A-Za-z0-9._:-]`, hasta 128 caracteres) se reutiliza; si no, el servidor genera un UUID. |
| **Formato de error** | Todas las respuestas de error tienen esta forma (excepto `/ready`, ver §4.6): |

```json
{
  "error": {
    "codigo": "NO_AUTORIZADO",
    "mensaje": "No tenés permiso para realizar esta operación."
  },
  "requestId": "8d3b6c1e-2f4a-4b5c-9d6e-7f8a9b0c1d2e"
}
```

- `codigo` es estable y es lo que el cliente debe evaluar. `mensaje` es texto para personas y puede cambiar.
- `requestId` coincide con la cabecera `x-request-id` y con los logs del servidor.
- Nunca se devuelven stack traces, detalles del parser ni los valores recibidos.

En los ejemplos de este documento, los UUID, tokens y `requestId` reales se reemplazaron por valores de ejemplo coherentes:

| Valor de ejemplo | Representa |
|---|---|
| `3f1c2a9e-5b7d-4c11-9a2e-0d4b6f8e1a01` | Usuario `pasajero@prog4.test` |
| `7c9e4b21-2d3f-4a8b-b6c5-1e0f9d8a2b02` | Usuario `chofer1@prog4.test` |
| `4e5f6a7b-8c9d-4e0f-a1b2-c3d4e5f6a7b8` | Usuario `chofer2@prog4.test` |
| `9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c03` | Usuario `admin@prog4.test` |
| `b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d04` | Usuario `soporte@prog4.test` |
| `c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e05` | Pasajero recién registrado |
| `d7e8f9a0-b1c2-4d3e-8f4a-5b6c7d8e9f06` | Chofer recién registrado |
| `5d2e8f14-6a3b-4c7d-9e1f-2a3b4c5d6e10` | Viaje de ejemplo |
| `00000000-0000-4000-8000-000000000000` | Identificador que no existe |
| `8d3b6c1e-2f4a-4b5c-9d6e-7f8a9b0c1d2e` | `requestId` (en la realidad, uno distinto por solicitud) |
| `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.…` | JWT (abreviado) |

---

## 2. Códigos de error

### 2.1 Códigos del dominio (`error-mapping.js`)

Esta tabla coincide exactamente con `ESTADOS_HTTP_POR_CODIGO` en `src/infrastructure/adapters/in/http/error-mapping.js`. Con la excepción marcada *(previsto, E3)*, todos los códigos están implementados y pueden ser lanzados por un caso de uso, una entidad o un repositorio.

| Código | HTTP | Cuándo ocurre |
|---|---:|---|
| `DATOS_INVALIDOS` | 400 | El cuerpo no cumple el esquema (campo faltante, tipo incorrecto, campo no declarado), un identificador de ruta no es UUID, o una regla del dominio rechaza el dato (contraseña débil, coordenada fuera de rango, origen igual al destino, rol no autorregistrable). |
| `CREDENCIALES_INVALIDAS` | 401 | Login con email inexistente o contraseña incorrecta (mismo error para ambos, para no revelar qué cuentas existen). |
| `NO_AUTENTICADO` | 401 | Falta la cabecera `Authorization: Bearer`, el token no es válido, venció o no contiene una identidad válida. |
| `NO_AUTORIZADO` | 403 | El rol no está permitido en la ruta (verificación por rol) o el recurso no pertenece al solicitante (verificación por recurso). Ver §6.1. |
| `NO_ENCONTRADO` | 404 | El recurso pedido por identificador no existe (usuario, viaje o perfil de chofer). |
| `EMAIL_YA_REGISTRADO` | 409 | Registro con un email que ya tiene cuenta (sin distinguir mayúsculas). |
| `TRANSICION_INVALIDA` | 409 | El estado actual del viaje no admite la operación (por ejemplo, cancelar un viaje ya cancelado o finalizar uno que no está `ASIGNADO`), o el viaje ya tiene un cobro registrado. |
| `VIAJE_NO_DISPONIBLE` | 409 | Se intenta aceptar un viaje que ya no está `SOLICITADO` (lo tomó otro chofer o se canceló). |
| `OFERTA_NO_PENDIENTE` | 409 | *(previsto, E3)* La oferta ya fue aceptada, rechazada o anulada. |
| `CHOFER_NO_ELEGIBLE` | 409 | El chofer no tiene perfil, no está habilitado, no está disponible o no tiene una ubicación reciente (al listar o aceptar viajes); también al declararse disponible o informar ubicación sin estar habilitado. |
| `CHOFER_OCUPADO` | 409 | El chofer ya tiene un viaje activo. |
| `PATENTE_YA_REGISTRADA` | 409 | La patente ya pertenece al vehículo de otro chofer. |
| `CHOFER_SIN_VEHICULO` | 409 | Se intenta habilitar a un chofer que no registró un vehículo. |
| `COTIZACION_YA_CONFIRMADA` | 409 | La cotización ya generó un viaje con otra clave de idempotencia. |
| `CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO` | 409 | Se reutilizó una `Idempotency-Key` vigente con otro contenido (otra cotización, otro viaje o distinto cuerpo). |
| `CLAVE_DE_IDEMPOTENCIA_REQUERIDA` | 400 | Falta la cabecera `Idempotency-Key` (o está vacía) en una operación que la exige. |
| `OFERTA_VENCIDA` | 410 | *(previsto, E3)* La oferta venció: `ahora` es mayor o igual que `venceEn`. |
| `COTIZACION_VENCIDA` | 410 | La cotización venció antes de confirmarla. |
| `VERSION_YA_PUBLICADA` | 409 | Se intenta editar o volver a publicar una tarifa o regla publicada (I12). |
| `ZONAS_SUPERPUESTAS` | 409 | Una zona activa nueva o modificada se solapa con otra (I16). |
| `NOMBRE_YA_REGISTRADO` | 409 | Ya existe una zona con el mismo nombre, sin distinguir mayúsculas. |
| `CONFIGURACION_INCOMPLETA` | 503 | Falta una tarifa o una regla publicada y vigente para cotizar. |
| `FUERA_DE_COBERTURA` | 422 | El origen de la cotización no pertenece a ninguna zona activa. |

Un `ErrorDeDominio` con un código que **no** está en esta tabla se responde como `500 ERROR_INTERNO`. Por eso cada código nuevo de las próximas tarjetas se registra primero en `error-mapping.js`.

### 2.2 Códigos del adaptador HTTP

No son motivos del dominio: los generan Express, los middlewares o el manejador global.

| Código | HTTP | Origen | Cuándo ocurre |
|---|---:|---|---|
| `CUERPO_INVALIDO` | 400 | `error-mapping.js` (`entity.parse.failed`) | El cuerpo no es JSON válido. |
| `CUERPO_DEMASIADO_GRANDE` | 413 | `error-mapping.js` (`entity.too.large`) | El cuerpo supera `BODY_LIMIT` (100 kB por defecto). |
| `CODIFICACION_NO_SOPORTADA` | 415 | `error-mapping.js` (`encoding.unsupported`, `charset.unsupported`) | `Content-Encoding` o `charset` no soportados. |
| `RECURSO_NO_ENCONTRADO` | 404 | `not-found.js` | La ruta o el método no existen (no hay 405). |
| `DEMASIADAS_SOLICITUDES` | 429 | `rate-limit.js` (límites global, de registro y de viajes) y `login-rate-limit.js` | Se superó alguno de los límites de §7. Incluye `Retry-After`. |
| `SOLICITUD_INVALIDA` | 4xx | `error-handler.js` | Respaldo para un error técnico con estado 4xx sin código conocido. |
| `ERROR_INTERNO` | 500 | `error-handler.js` | Cualquier error no controlado. El detalle queda solo en el log. |

### 2.3 Códigos propuestos para las próximas tarjetas

Todavía **no** están en `error-mapping.js`. La tarjeta que los use debe agregarlos allí.

| Código propuesto | HTTP | Cuándo | Tarjeta |
|---|---:|---|---|
| `UBICACION_NO_DISPONIBLE` | 404 | Se consulta la ubicación de un viaje sin ubicación vigente del chofer. | E4 · tiempo real |
| `SERVICIO_NO_DISPONIBLE` | 503 | El servicio Python no respondió dentro del tiempo máximo (ADR-0007). | E4 · parte Python |

---

## 3. Idempotencia

### 3.1 Comportamiento actual

| Aspecto | Regla |
|---|---|
| **Operaciones que la exigen hoy** | `POST /viajes`, `POST /viajes/{id}/finalizar` y `POST /cotizaciones/{id}/confirmar`. La política detallada está en `docs/politica-de-idempotencia.md`. |
| **Cabecera** | `Idempotency-Key: <texto>`. Obligatoria y no vacía; sin ella se responde `400 CLAVE_DE_IDEMPOTENCIA_REQUERIDA`. Se recomienda un UUID v4 generado por el cliente. Longitud máxima efectiva: 255 caracteres (ver §8, D18). |
| **Alcance** | Usuario más operación: `viaje:crear:<pasajeroId>`, `viaje:finalizar:<choferId>` y `cotizacion:confirmar:<pasajeroId>`. La misma clave usada por dos usuarios distintos son dos claves distintas. |
| **Contenido comparado** | Huella SHA-256 del contenido normalizado, con las claves ordenadas: `origen` y `destino` al crear; `viajeId` al finalizar; `cotizacionId` y `pasajeroId` al confirmar. El orden de las propiedades del JSON no importa. La clave no forma parte de la huella. |
| **Atomicidad** | La clave se registra en la **misma transacción** que el efecto (el viaje creado, el viaje finalizado con su cobro, o la cotización confirmada con el viaje resultante). Dos solicitudes simultáneas con la misma clave producen un solo efecto y reciben la misma respuesta (ADR-0004, C5 y ADR-0005). |
| **Vigencia** | `IDEMPOTENCIA_TTL_MS`: 24 horas por defecto (configurable entre 1 minuto y 7 días). Pasado ese plazo la clave se olvida y una nueva solicitud con la misma clave crea otro viaje. |
| **Misma clave y mismo contenido** | `200 OK` con la cabecera `Idempotency-Replayed: true` y **la respuesta original guardada**, aunque el viaje haya cambiado de estado después. Para el estado actual se usa `GET /viajes/{id}`. |
| **Misma clave y otro contenido** | `409 CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO`. No se crea nada. |
| **Orden de validación** | Autenticación → rol → esquema del cuerpo → cabecera `Idempotency-Key` → reglas del dominio. Un cuerpo inválido sin clave responde `DATOS_INVALIDOS`, no `CLAVE_DE_IDEMPOTENCIA_REQUERIDA`. |

### 3.2 Operaciones con clave y operaciones futuras

| Operación | Exige clave | Estado |
|---|---|---|
| `POST /cotizaciones/{id}/confirmar` | Sí. Alcance `cotizacion:confirmar:<pasajeroId>`, huella de `cotizacionId` + `pasajeroId`. | Implementado — tarjeta E2 · RF-17 + RF-18 + RF-19 |
| Cobro simulado | Ya existe: se ejecuta dentro de `POST /viajes/{id}/finalizar`, protegido por su clave y por `viaje_id` único en `cobros_simulados` (§4.4). | Implementado |
| Aceptar o rechazar oferta, cancelar, avanzar el viaje | No. Son idempotentes por su clave natural: repetirlas no duplica efectos, la segunda recibe `OFERTA_NO_PENDIENTE` o `TRANSICION_INVALIDA` (`docs/modelo.md` Q8). | Propuesto |
| Cotizar | No. Cada cotización es una foto nueva y no tiene efectos sobre otros recursos. | Implementado |

Confirmar no recibe importes del cliente: la huella protege la identidad de la cotización y el pasajero, y la respuesta guardada contiene el viaje con el precio ya fijado. En todas las operaciones con clave se mantienen las mismas reglas de §3.1 (alcance por usuario, huella, misma transacción, `Idempotency-Replayed`).

---

## 4. Endpoints existentes

Montados en `src/infrastructure/adapters/in/http/app.js`. Cada bloque indica los errores que se probaron o que el código puede devolver. Además de los listados, **todo endpoint** puede responder `400 CUERPO_INVALIDO`, `413 CUERPO_DEMASIADO_GRANDE`, `429 DEMASIADAS_SOLICITUDES` y `500 ERROR_INTERNO`; y todo endpoint autenticado puede responder `401 NO_AUTENTICADO`.

### 4.1 Autenticación (`/auth`)

#### `POST /auth/registro`

- **Roles:** público.
- **Descripción:** crea una cuenta de `PASAJERO` o `CHOFER`. Si el rol es `CHOFER`, en la misma transacción se crea el perfil operativo **inhabilitado y no disponible**. Las cuentas de operador y administrador no se crean por esta vía.
- **Cuerpo:**

| Campo | Tipo | Reglas |
|---|---|---|
| `email` | texto | Obligatorio, hasta 254 caracteres, formato de email. Se normaliza a minúsculas. |
| `nombre` | texto | Obligatorio, 1 a 100 caracteres (se recortan espacios). |
| `contrasena` | texto | 8 a 72 caracteres (máximo 72 bytes), al menos una letra y un número. |
| `rol` | texto | `PASAJERO` o `CHOFER`. |

```json
{
  "email": "ana.perez@prog4.test",
  "nombre": "Ana Pérez",
  "contrasena": "Secreta123",
  "rol": "PASAJERO"
}
```

- **Éxito:** `201 Created`

```json
{
  "usuario": {
    "id": "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e05",
    "email": "ana.perez@prog4.test",
    "nombre": "Ana Pérez",
    "rol": "PASAJERO",
    "creadoEn": "2026-11-12T00:18:33.863Z"
  }
}
```

- **Errores:**

| HTTP | Código | Ejemplo de causa |
|---:|---|---|
| 400 | `DATOS_INVALIDOS` | `rol: "ADMINISTRADOR"` → `"Datos inválidos: rol: El rol debe ser PASAJERO o CHOFER."` |
| 400 | `DATOS_INVALIDOS` | Campo extra → `"Datos inválidos: campos no permitidos: admin"` |
| 400 | `DATOS_INVALIDOS` | `contrasena: "corta"` → `"Datos inválidos: contrasena: La contraseña debe tener al menos 8 caracteres.; contrasena: La contraseña debe incluir al menos un número."` |
| 400 | `CUERPO_INVALIDO` | JSON mal formado. |
| 409 | `EMAIL_YA_REGISTRADO` | `"Ya existe una cuenta con ese email."` |

#### `POST /auth/login`

- **Roles:** público, con límite de intentos fallidos (§7.1).
- **Descripción:** verifica las credenciales y devuelve un JWT.
- **Cuerpo:**

```json
{
  "email": "pasajero@prog4.test",
  "contrasena": "Pasajero1234!"
}
```

- **Éxito:** `200 OK`

```json
{
  "tipo": "Bearer",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.…",
  "expiraEn": "2026-11-12T01:18:34.735Z",
  "usuario": {
    "id": "3f1c2a9e-5b7d-4c11-9a2e-0d4b6f8e1a01",
    "email": "pasajero@prog4.test",
    "nombre": "Pasajero de prueba",
    "rol": "PASAJERO",
    "creadoEn": "2026-11-12T00:18:32.837Z"
  }
}
```

- **Errores:**

| HTTP | Código | Ejemplo de causa |
|---:|---|---|
| 400 | `DATOS_INVALIDOS` | Falta `email` o `contrasena`, o hay campos extra. |
| 401 | `CREDENCIALES_INVALIDAS` | `"El email o la contraseña son incorrectos."` |
| 429 | `DEMASIADAS_SOLICITUDES` | `"Demasiados intentos de inicio de sesión. Intentá más tarde."`, con `Retry-After: 897`. |

#### `GET /auth/yo`

- **Roles:** cualquier usuario autenticado.
- **Descripción:** devuelve el perfil del dueño del token.
- **Éxito:** `200 OK`

```json
{
  "usuario": {
    "id": "3f1c2a9e-5b7d-4c11-9a2e-0d4b6f8e1a01",
    "email": "pasajero@prog4.test",
    "nombre": "Pasajero de prueba",
    "rol": "PASAJERO",
    "creadoEn": "2026-11-12T00:18:32.837Z"
  }
}
```

- **Errores:**

| HTTP | Código | Ejemplo de causa |
|---:|---|---|
| 401 | `NO_AUTENTICADO` | Sin cabecera → `"Se requiere un token Bearer."` |
| 401 | `NO_AUTENTICADO` | Token inválido o vencido → `"El token no es válido o expiró."` |

### 4.2 Usuarios (`/usuarios`)

#### `GET /usuarios/{id}`

- **Roles:** autenticado. Por recurso: el **propio** usuario o un `ADMINISTRADOR`.
- **Parámetros:** `id` (UUID del usuario).
- **Éxito:** `200 OK`, con la misma forma que `GET /auth/yo`. Nunca incluye la credencial.
- **Errores:**

| HTTP | Código | Ejemplo de causa |
|---:|---|---|
| 400 | `DATOS_INVALIDOS` | `id` no es UUID → `"El identificador no es válido."` |
| 403 | `NO_AUTORIZADO` | Un chofer o el operador de soporte consulta a otro usuario → `"No tenés permiso para ver este usuario."` |
| 404 | `NO_ENCONTRADO` | `"El usuario no existe."` (se evalúa **antes** que el permiso, ver §8, D16). |

#### `PATCH /usuarios/{id}`

- **Roles:** autenticado. Por recurso: **solo el propio** usuario (el administrador puede ver, pero no editar).
- **Parámetros:** `id` (UUID del usuario).
- **Cuerpo:** solo `nombre` (1 a 100 caracteres). `email` y `rol` no son editables.

```json
{ "nombre": "Pasajero de prueba" }
```

- **Éxito:** `200 OK` con `{ "usuario": { … } }` actualizado.
- **Errores:**

| HTTP | Código | Ejemplo de causa |
|---:|---|---|
| 400 | `DATOS_INVALIDOS` | Se envía `email` → `"Datos inválidos: campos no permitidos: email"` |
| 403 | `NO_AUTORIZADO` | El administrador edita a otro usuario → `"No tenés permiso para editar este usuario."` |
| 404 | `NO_ENCONTRADO` | `"El usuario no existe."` |
| 413 | `CUERPO_DEMASIADO_GRANDE` | Cuerpo de más de 100 kB. |

### 4.3 Choferes (`/choferes`)

El perfil operativo de chofer tiene esta forma en todas las respuestas:

| Campo | Descripción |
|---|---|
| `usuarioId` | Usuario del chofer. |
| `habilitado` | Lo decide el administrador. |
| `disponible` | Lo declara el chofer. Solo puede ser `true` si está habilitado. |
| `viajeActivoId` | Viaje que está atendiendo, o `null` si está libre. |
| `estado` | Derivado: `INHABILITADO`, `NO_DISPONIBLE`, `DISPONIBLE` u `OCUPADO` (`docs/modelo.md` §6.4). |

#### `GET /choferes/yo`

- **Roles:** `CHOFER`.
- **Descripción:** perfil operativo del chofer autenticado.
- **Éxito:** `200 OK`

```json
{
  "chofer": {
    "usuarioId": "7c9e4b21-2d3f-4a8b-b6c5-1e0f9d8a2b02",
    "habilitado": true,
    "disponible": true,
    "viajeActivoId": null,
    "estado": "DISPONIBLE"
  }
}
```

- **Errores:**

| HTTP | Código | Ejemplo de causa |
|---:|---|---|
| 403 | `NO_AUTORIZADO` | Otro rol → `"No tenés permiso para realizar esta operación."` |
| 404 | `NO_ENCONTRADO` | `"El perfil de chofer no existe."` |

#### `PATCH /choferes/yo`

- **Roles:** `CHOFER`. Por recurso: solo el propio perfil.
- **Descripción:** el chofer declara si está disponible. Si está `OCUPADO`, el cambio se registra pero no interrumpe el viaje activo.
- **Cuerpo:**

```json
{ "disponible": false }
```

- **Éxito:** `200 OK`

```json
{
  "chofer": {
    "usuarioId": "4e5f6a7b-8c9d-4e0f-a1b2-c3d4e5f6a7b8",
    "habilitado": true,
    "disponible": false,
    "viajeActivoId": null,
    "estado": "NO_DISPONIBLE"
  }
}
```

- **Errores:**

| HTTP | Código | Ejemplo de causa |
|---:|---|---|
| 400 | `DATOS_INVALIDOS` | `disponible: "si"` → `"Datos inválidos: disponible: La disponibilidad debe ser booleana."` |
| 403 | `NO_AUTORIZADO` | Otro rol. |
| 404 | `NO_ENCONTRADO` | `"El perfil de chofer no existe."` |
| 409 | `CHOFER_NO_ELEGIBLE` | Declararse disponible sin estar habilitado → `"El chofer debe estar habilitado antes de declararse disponible."` |

#### `PATCH /choferes/{usuarioId}/habilitacion`

- **Roles:** `ADMINISTRADOR`.
- **Descripción:** habilita o inhabilita a un chofer. Para habilitar, el chofer tiene que haber registrado un vehículo (Q11); inhabilitar se permite siempre. Al inhabilitar, `disponible` pasa a `false`; si tenía un viaje activo, lo conserva (Q12).
- **Parámetros:** `usuarioId` (UUID del usuario chofer).
- **Cuerpo:**

```json
{ "habilitado": true }
```

- **Éxito:** `200 OK`

```json
{
  "chofer": {
    "usuarioId": "d7e8f9a0-b1c2-4d3e-8f4a-5b6c7d8e9f06",
    "habilitado": true,
    "disponible": false,
    "viajeActivoId": null,
    "estado": "NO_DISPONIBLE"
  }
}
```

- **Errores:**

| HTTP | Código | Ejemplo de causa |
|---:|---|---|
| 400 | `DATOS_INVALIDOS` | `usuarioId` no es UUID, o `habilitado` no es booleano. |
| 403 | `NO_AUTORIZADO` | Otro rol → `"No tenés permiso para realizar esta operación."` |
| 404 | `NO_ENCONTRADO` | El usuario no existe o no es chofer → `"El perfil de chofer no existe."` |
| 409 | `CHOFER_SIN_VEHICULO` | Habilitar sin vehículo → `"El chofer debe registrar un vehículo antes de ser habilitado."` |

#### `PUT /choferes/yo/vehiculo`

- **Roles:** `CHOFER`. Por recurso: solo el propio vehículo.
- **Descripción:** registra el vehículo del chofer o reemplaza sus datos. Un chofer tiene a lo sumo un vehículo y la patente es única en el sistema. La patente se normaliza (sin espacios ni guiones, en mayúsculas) y acepta los formatos `ABC123` y `AB123CD`. El vehículo no se puede borrar, solo editar.
- **Cuerpo:**

| Campo | Tipo | Reglas |
|---|---|---|
| `patente` | texto | Obligatoria. Formato `ABC123` o `AB123CD`. |
| `marca`, `modelo` | texto | Obligatorios, 1 a 50 caracteres. |
| `anio` | entero | Opcional, entre 1950 y 2100. |
| `color` | texto | Opcional, 1 a 50 caracteres. |

```json
{
  "patente": "ab 123 cd",
  "marca": "Toyota",
  "modelo": "Etios",
  "anio": 2021,
  "color": "Gris"
}
```

- **Éxito:** `201 Created` si lo registra, `200 OK` si lo edita (conserva el `id`).

```json
{
  "vehiculo": {
    "id": "e2f3a4b5-c6d7-4e8f-9a0b-1c2d3e4f5a60",
    "choferId": "d7e8f9a0-b1c2-4d3e-8f4a-5b6c7d8e9f06",
    "patente": "AB123CD",
    "marca": "Toyota",
    "modelo": "Etios",
    "anio": 2021,
    "color": "Gris"
  }
}
```

- **Errores:**

| HTTP | Código | Ejemplo de causa |
|---:|---|---|
| 400 | `DATOS_INVALIDOS` | `patente: "XYZ"` → `"La patente debe tener el formato ABC123 o AB123CD."`; `anio` decimal; campo extra. |
| 403 | `NO_AUTORIZADO` | Otro rol. |
| 404 | `NO_ENCONTRADO` | `"El perfil de chofer no existe."` |
| 409 | `PATENTE_YA_REGISTRADA` | `"La patente ya está registrada en otro vehículo."` |

#### `GET /choferes/yo/vehiculo`

- **Roles:** `CHOFER`.
- **Éxito:** `200 OK` con `{ "vehiculo": { … } }`, con la forma de `PUT /choferes/yo/vehiculo`.
- **Errores:** `403 NO_AUTORIZADO` (otro rol), `404 NO_ENCONTRADO` → `"El chofer todavía no registró un vehículo."`

#### `PUT /choferes/yo/ubicacion`

- **Roles:** `CHOFER`, habilitado. Por recurso: solo la propia ubicación.
- **Descripción:** reemplaza la ubicación vigente del chofer (RF-03). `actualizadaEn` es **la hora del servidor** al recibirla; el cliente no puede enviarla. La ubicación se guarda como `geography(Point, 4326)` con índice GiST (ADR-0006). Un envío que llega atrasado no pisa una ubicación más reciente.
- **Para qué sirve:** un chofer necesita una ubicación de menos de `UBICACION_VIGENCIA_MS` (60 segundos por defecto) para listar y aceptar viajes. La app del chofer debe enviarla periódicamente.
- **Cuerpo:**

```json
{ "lat": -34.6037, "lng": -58.3816 }
```

- **Éxito:** `200 OK`

```json
{
  "ubicacion": {
    "choferId": "7c9e4b21-2d3f-4a8b-b6c5-1e0f9d8a2b02",
    "punto": { "lat": -34.6037, "lng": -58.3816 },
    "actualizadaEn": "2026-11-18T23:38:43.838Z"
  }
}
```

- **Errores:**

| HTTP | Código | Ejemplo de causa |
|---:|---|---|
| 400 | `DATOS_INVALIDOS` | `lat: 91` → `"La coordenada latitud no es válida."`; coordenada como texto; campo extra como `actualizadaEn`. |
| 403 | `NO_AUTORIZADO` | Otro rol. |
| 404 | `NO_ENCONTRADO` | `"El perfil de chofer no existe."` |
| 409 | `CHOFER_NO_ELEGIBLE` | Inhabilitado → `"Un chofer inhabilitado no puede informar su ubicación."` |

### 4.4 Viajes (`/viajes`)

`POST /viajes` se conserva como **ruta legacy/provisional**: crea el viaje con la
tarifa anterior, sin cotización ni multiplicador. El flujo nuevo es
`POST /cotizaciones` → `POST /cotizaciones/{id}/confirmar` (§5.3), que fija el
precio que vio el pasajero. Los viajes ya confirmados **no se recalculan**.

Forma del viaje en todas las respuestas:

| Campo | Descripción |
|---|---|
| `id`, `pasajeroId` | Identidad del viaje y de su pasajero. |
| `origen`, `destino` | Coordenadas. |
| `distanciaEstimadaM` | Distancia en línea recta (Haversine), en metros. |
| `precioFijadoCentavos` | Precio fijado al crear el viaje. Al confirmar una cotización se **copia** de ella; `POST /viajes` sigue usando la tarifa provisional por distancia (§8, D1). |
| `cotizacionId`, `multiplicadorFijado` | Cotización de origen y multiplicador copiado al confirmar (ADR-0005). Son `null` y `"1.0000"` en los viajes creados con `POST /viajes`. |
| `choferId` | Chofer asignado o `null`. Se conserva como historial si el viaje se cancela. |
| `estado` | Hoy solo `SOLICITADO`, `ASIGNADO`, `FINALIZADO` o `CANCELADO_POR_PASAJERO` son alcanzables por la API. |
| `solicitadoEn`, `asignadoEn`, `cerradoEn` | Instantes de cada etapa. |
| `canceladoPorId`, `motivoCancelacion` | Autor y motivo de la cancelación. |

#### `POST /viajes`

- **Roles:** `PASAJERO`.
- **Cabeceras:** `Idempotency-Key` obligatoria (§3).
- **Descripción:** crea un viaje `SOLICITADO`. El servidor calcula la distancia y el precio; el cliente nunca envía importes.
- **Cuerpo:**

```json
{
  "origen": { "lat": -34.6037, "lng": -58.3816 },
  "destino": { "lat": -34.5889, "lng": -58.4306 }
}
```

- **Éxito:** `201 Created`

```json
{
  "viaje": {
    "id": "5d2e8f14-6a3b-4c7d-9e1f-2a3b4c5d6e10",
    "pasajeroId": "3f1c2a9e-5b7d-4c11-9a2e-0d4b6f8e1a01",
    "origen": { "lat": -34.6037, "lng": -58.3816 },
    "destino": { "lat": -34.5889, "lng": -58.4306 },
    "distanciaEstimadaM": 4777,
    "precioFijadoCentavos": 338850,
    "cotizacionId": null,
    "multiplicadorFijado": "1.0000",
    "choferId": null,
    "estado": "SOLICITADO",
    "solicitadoEn": "2026-11-12T00:18:36.675Z",
    "asignadoEn": null,
    "cerradoEn": null,
    "canceladoPorId": null,
    "motivoCancelacion": null
  }
}
```

Con la tarifa por defecto: `100000 + round(4,777 km × 50000) = 338850`, acotado entre 150000 y 1000000 centavos.

- **Reintento con la misma clave y el mismo cuerpo:** `200 OK`, cabecera `Idempotency-Replayed: true` y el mismo `viaje` guardado (las propiedades pueden llegar en otro orden, porque la respuesta se guarda como JSONB).
- **Errores:**

| HTTP | Código | Ejemplo de causa |
|---:|---|---|
| 400 | `CLAVE_DE_IDEMPOTENCIA_REQUERIDA` | `"La cabecera Idempotency-Key es obligatoria para crear un viaje."` |
| 400 | `DATOS_INVALIDOS` | Campo `precio` → `"Datos inválidos: campos no permitidos: precio"` |
| 400 | `DATOS_INVALIDOS` | Origen igual al destino → `"El destino debe ser distinto del origen."` |
| 400 | `DATOS_INVALIDOS` | `lat: 100` → `"La coordenada latitud no es válida."` |
| 403 | `NO_AUTORIZADO` | Otro rol. |
| 409 | `CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO` | `"La clave de idempotencia ya fue usada con otro contenido."` |
| 500 | `ERROR_INTERNO` | `Idempotency-Key` de más de 255 caracteres (bug, §8, D18). |

#### `GET /viajes/disponibles`

- **Roles:** `CHOFER`. Además, el chofer debe estar **habilitado, disponible, libre y con una ubicación reciente** (`PUT /choferes/yo/ubicacion` hace menos de `UBICACION_VIGENCIA_MS`).
- **Descripción:** lista hasta 50 viajes `SOLICITADO` cuyo origen está a `BUSQUEDA_RADIO_M` metros o menos (5000 por defecto) de la **ubicación vigente del chofer**, del más cercano al más lejano (RF-06). Cada viaje trae `distanciaM`: la distancia en metros desde el chofer hasta el origen, calculada por PostGIS. La búsqueda usa el índice GiST parcial `viajes_origen_solicitados_idx` (ADR-0006). La lista es orientativa: al aceptar se vuelve a validar todo.
- **Éxito:** `200 OK`. Ejemplo con el chofer en Congreso y el viaje en el Obelisco:

```json
{
  "viajes": [
    {
      "id": "5d2e8f14-6a3b-4c7d-9e1f-2a3b4c5d6e10",
      "pasajeroId": "3f1c2a9e-5b7d-4c11-9a2e-0d4b6f8e1a01",
      "origen": { "lat": -34.6037, "lng": -58.3816 },
      "destino": { "lat": -34.6097, "lng": -58.3925 },
      "distanciaEstimadaM": 1200,
      "precioFijadoCentavos": 160000,
      "cotizacionId": null,
      "multiplicadorFijado": "1.0000",
      "choferId": null,
      "estado": "SOLICITADO",
      "solicitadoEn": "2026-11-23T15:59:04.411Z",
      "asignadoEn": null,
      "cerradoEn": null,
      "canceladoPorId": null,
      "motivoCancelacion": null,
      "distanciaM": 1201
    }
  ]
}
```

Si no hay viajes dentro del radio, responde `{ "viajes": [] }`.

- **Errores:**

| HTTP | Código | Ejemplo de causa |
|---:|---|---|
| 403 | `NO_AUTORIZADO` | Otro rol. |
| 409 | `CHOFER_NO_ELEGIBLE` | No disponible, inhabilitado u ocupado → `"El chofer no está habilitado y disponible para aceptar viajes."` |
| 409 | `CHOFER_NO_ELEGIBLE` | Sin ubicación reciente → `"El chofer no tiene una ubicación reciente. Debe informar su ubicación para recibir viajes."` |

#### `GET /viajes/{id}`

- **Roles:** autenticado. Por recurso: el **pasajero del viaje**, el **chofer asignado**, `OPERADOR_SOPORTE` o `ADMINISTRADOR`.
- **Parámetros:** `id` (UUID del viaje).
- **Éxito:** `200 OK` con `{ "viaje": { … } }`, con la forma de `POST /viajes`.
- **Errores:**

| HTTP | Código | Ejemplo de causa |
|---:|---|---|
| 400 | `DATOS_INVALIDOS` | `id` no es UUID. |
| 403 | `NO_AUTORIZADO` | Un chofer que no es el asignado → `"No tenés permiso para ver este viaje."` |
| 404 | `NO_ENCONTRADO` | `"El viaje no existe."` |

#### `POST /viajes/{id}/aceptar`

- **Roles:** `CHOFER`. Además, el chofer debe estar habilitado, disponible, libre y con una ubicación reciente.
- **Descripción:** asigna el viaje al chofer y lo marca ocupado, en una sola transacción con bloqueo de filas (viaje y después chofer, ADR-0004). Si varios choferes aceptan a la vez, gana exactamente uno.
- **Cuerpo:** ninguno.
- **Éxito:** `200 OK`

```json
{
  "viaje": {
    "id": "5d2e8f14-6a3b-4c7d-9e1f-2a3b4c5d6e10",
    "pasajeroId": "3f1c2a9e-5b7d-4c11-9a2e-0d4b6f8e1a01",
    "origen": { "lat": -34.6037, "lng": -58.3816 },
    "destino": { "lat": -34.5889, "lng": -58.4306 },
    "distanciaEstimadaM": 4777,
    "precioFijadoCentavos": 338850,
    "cotizacionId": null,
    "multiplicadorFijado": "1.0000",
    "choferId": "7c9e4b21-2d3f-4a8b-b6c5-1e0f9d8a2b02",
    "estado": "ASIGNADO",
    "solicitadoEn": "2026-11-12T00:18:36.675Z",
    "asignadoEn": "2026-11-12T00:18:36.937Z",
    "cerradoEn": null,
    "canceladoPorId": null,
    "motivoCancelacion": null
  }
}
```

Después, `GET /choferes/yo` devuelve `"viajeActivoId": "5d2e8f14-…"` y `"estado": "OCUPADO"`.

- **Errores:**

| HTTP | Código | Ejemplo de causa |
|---:|---|---|
| 403 | `NO_AUTORIZADO` | Otro rol. |
| 404 | `NO_ENCONTRADO` | `"El viaje no existe."` |
| 409 | `VIAJE_NO_DISPONIBLE` | Ya asignado o cancelado → `"El viaje ya no está disponible para ser aceptado."` |
| 409 | `CHOFER_OCUPADO` | `"El chofer ya tiene un viaje activo."` |
| 409 | `CHOFER_NO_ELEGIBLE` | Sin perfil, inhabilitado, no disponible o sin ubicación reciente. Se revalida dentro de la transacción. |

#### `POST /viajes/{id}/cancelar`

- **Roles:** `PASAJERO`. Por recurso: solo el **pasajero del viaje**.
- **Descripción:** cancela un viaje `SOLICITADO` o `ASIGNADO`. Si tenía chofer, lo libera en la misma transacción.
- **Cuerpo:**

```json
{ "motivo": "Cambié de planes" }
```

`motivo`: obligatorio, 1 a 500 caracteres.

- **Éxito:** `200 OK`

```json
{
  "viaje": {
    "id": "5d2e8f14-6a3b-4c7d-9e1f-2a3b4c5d6e10",
    "pasajeroId": "3f1c2a9e-5b7d-4c11-9a2e-0d4b6f8e1a01",
    "origen": { "lat": -34.6037, "lng": -58.3816 },
    "destino": { "lat": -34.5889, "lng": -58.4306 },
    "distanciaEstimadaM": 4777,
    "precioFijadoCentavos": 338850,
    "cotizacionId": null,
    "multiplicadorFijado": "1.0000",
    "choferId": "7c9e4b21-2d3f-4a8b-b6c5-1e0f9d8a2b02",
    "estado": "CANCELADO_POR_PASAJERO",
    "solicitadoEn": "2026-11-12T00:18:36.675Z",
    "asignadoEn": "2026-11-12T00:18:36.937Z",
    "cerradoEn": "2026-11-12T00:18:37.309Z",
    "canceladoPorId": "3f1c2a9e-5b7d-4c11-9a2e-0d4b6f8e1a01",
    "motivoCancelacion": "Cambié de planes"
  }
}
```

- **Errores:**

| HTTP | Código | Ejemplo de causa |
|---:|---|---|
| 400 | `DATOS_INVALIDOS` | Sin `motivo` → `"Datos inválidos: motivo: Invalid input: expected string, received undefined"` (mensaje por defecto de Zod, §8, D20). |
| 403 | `NO_AUTORIZADO` | Un chofer → `"No tenés permiso para realizar esta operación."` (por rol). |
| 403 | `NO_AUTORIZADO` | Otro pasajero → `"No tenés permiso para cancelar este viaje."` (por recurso). |
| 404 | `NO_ENCONTRADO` | `"El viaje no existe."` |
| 409 | `TRANSICION_INVALIDA` | Ya cancelado → `"El viaje ya no puede cancelarse en su estado actual."` |

#### `POST /viajes/{id}/finalizar`

- **Roles:** `CHOFER`. Por recurso: solo el **chofer asignado**.
- **Cabeceras:** `Idempotency-Key` obligatoria (§3).
- **Descripción:** finaliza un viaje `ASIGNADO`, libera al chofer y registra y ejecuta el cobro simulado, todo en una sola transacción. El monto es `precioFijadoCentavos`; el cliente no envía importes. El simulador genera una referencia determinista `SIM-<viajeId>`.
- **Cuerpo:** ninguno.
- **Éxito:** `200 OK`

```json
{
  "viaje": {
    "id": "5d2e8f14-6a3b-4c7d-9e1f-2a3b4c5d6e10",
    "pasajeroId": "3f1c2a9e-5b7d-4c11-9a2e-0d4b6f8e1a01",
    "origen": { "lat": -34.6037, "lng": -58.3816 },
    "destino": { "lat": -34.5889, "lng": -58.4306 },
    "distanciaEstimadaM": 4777,
    "precioFijadoCentavos": 338850,
    "cotizacionId": null,
    "multiplicadorFijado": "1.0000",
    "choferId": "7c9e4b21-2d3f-4a8b-b6c5-1e0f9d8a2b02",
    "estado": "FINALIZADO",
    "solicitadoEn": "2026-11-18T22:40:14.779Z",
    "asignadoEn": "2026-11-18T22:40:14.826Z",
    "cerradoEn": "2026-11-18T22:40:14.885Z",
    "canceladoPorId": null,
    "motivoCancelacion": null
  },
  "cobro": {
    "id": "b8c9d0e1-f2a3-4b4c-9d5e-6f7a8b9c0d50",
    "viajeId": "5d2e8f14-6a3b-4c7d-9e1f-2a3b4c5d6e10",
    "montoCentavos": 338850,
    "estado": "COBRADO",
    "creadoEn": "2026-11-18T22:40:14.885Z",
    "cobradoEn": "2026-11-18T22:40:14.888Z",
    "referencia": "SIM-5d2e8f14-6a3b-4c7d-9e1f-2a3b4c5d6e10"
  }
}
```

Después, `GET /choferes/yo` del chofer devuelve `"viajeActivoId": null`.

- **Reintento con la misma clave:** `200 OK`, cabecera `Idempotency-Replayed: true` y la misma respuesta guardada (viaje y cobro).
- **Errores:**

| HTTP | Código | Ejemplo de causa |
|---:|---|---|
| 400 | `CLAVE_DE_IDEMPOTENCIA_REQUERIDA` | `"La cabecera Idempotency-Key es obligatoria para finalizar un viaje y cobrar."` |
| 403 | `NO_AUTORIZADO` | Un pasajero → `"No tenés permiso para realizar esta operación."` (por rol). |
| 403 | `NO_AUTORIZADO` | Otro chofer, o un viaje todavía `SOLICITADO` → `"Solo el chofer asignado puede finalizar este viaje."` (por recurso). |
| 404 | `NO_ENCONTRADO` | `"El viaje no existe."` |
| 409 | `TRANSICION_INVALIDA` | Ya finalizado (con otra clave) → `"Solo un viaje asignado puede finalizarse."` |
| 409 | `CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO` | La clave se usó para finalizar otro viaje. |

#### `GET /viajes/{id}/cobro`

- **Roles:** autenticado. Por recurso: el **pasajero del viaje**, el **chofer asignado**, `OPERADOR_SOPORTE` o `ADMINISTRADOR`.
- **Éxito:** `200 OK` con `{ "cobro": { … } }`, con la forma del cobro de `POST /viajes/{id}/finalizar`.
- **Errores:**

| HTTP | Código | Ejemplo de causa |
|---:|---|---|
| 400 | `DATOS_INVALIDOS` | `id` no es UUID. |
| 403 | `NO_AUTORIZADO` | Un chofer que no es el asignado → `"No tenés permiso para ver este cobro."` |
| 404 | `NO_ENCONTRADO` | `"El viaje no existe."` o, si no está finalizado, `"El viaje todavía no tiene un cobro registrado."` |

### 4.5 Rutas inexistentes

Cualquier método o ruta no declarados responde:

```json
{
  "error": {
    "codigo": "RECURSO_NO_ENCONTRADO",
    "mensaje": "El recurso solicitado no existe."
  },
  "requestId": "8d3b6c1e-2f4a-4b5c-9d6e-7f8a9b0c1d2e"
}
```

### 4.6 Salud (`/health` y `/ready`)

#### `GET /health`

- **Roles:** público. **Liveness:** solo confirma que el proceso responde. Lo usa el healthcheck de Docker.
- **Éxito:** `200 OK`

```json
{
  "estado": "ok",
  "tipo": "liveness",
  "fecha": "2026-11-12T00:18:33.525Z"
}
```

#### `GET /ready`

- **Roles:** público. **Readiness:** ejecuta en paralelo cada chequeo de dependencias, con tiempo máximo `READINESS_TIMEOUT_MS` (3 s por defecto).
- **Éxito:** `200 OK`

```json
{
  "estado": "listo",
  "tipo": "readiness",
  "chequeos": {
    "baseDeDatos": { "ok": true },
    "usuarios": { "ok": true },
    "choferes": { "ok": true },
    "viajes": { "ok": true },
    "cobros": { "ok": true },
    "vehiculos": { "ok": true },
    "ubicaciones": { "ok": true },
    "zonas": { "ok": true },
    "tarifas": { "ok": true },
    "reglas": { "ok": true },
    "cotizaciones": { "ok": true },
    "idempotencia": { "ok": true },
    "reloj": { "ok": true }
  },
  "fecha": "2026-11-12T00:18:33.565Z"
}
```

- **Fallo:** `503 Service Unavailable` con la **misma forma** (no la de error), `"estado": "no_listo"` y `"ok": false` en los chequeos que fallaron.

---

## 5. Endpoints propuestos

Los bloques §5.2 y §5.3 ya están **implementados** en la rama E2; el resto sigue propuesto. Cada tarjeta puede ajustar nombres o campos, pero cualquier cambio se refleja aquí en el mismo PR. Valen las convenciones de §1: esquemas estrictos, sin importes del cliente, montos en centavos, multiplicador como texto, fechas en UTC.

### 5.1 Cuentas del personal

#### `POST /usuarios` — Propuesto — tarjeta E1 · RF-01 y base transversal

- **Roles:** `ADMINISTRADOR`.
- **Descripción:** crea cuentas de `OPERADOR_SOPORTE` o `ADMINISTRADOR`, que no se pueden autorregistrar (ADR-0003, Q7). Hoy solo las crea el seed.
- **Cuerpo:** `{ "email", "nombre", "contrasena", "rol" }`, con `rol` en `OPERADOR_SOPORTE` o `ADMINISTRADOR`.
- **Éxito:** `201 Created` con `{ "usuario": { … } }`.
- **Errores:** `400 DATOS_INVALIDOS`, `403 NO_AUTORIZADO`, `409 EMAIL_YA_REGISTRADO`.

### 5.2 Zonas, tarifas y reglas de multiplicador

**Implementado — tarjeta E2 · RF-23 + RF-16.** Montado en `/admin/configuracion`.
**Solo `ADMINISTRADOR`**, tanto para leer como para escribir: lo comprueba el
middleware de rol y lo vuelve a validar el caso de uso. No hay
`GET /zonas/{id}` ni `GET /zonas/{id}/multiplicador`: la medición de demanda se
guarda como parte de cada cotización (§5.3).

El `criterio` de una zona es `{ "tipo": "POLIGONO", "puntos": [{ "lat", "lng" }, …] }`
(mínimo tres puntos) y se convierte a `geography(Polygon, 4326)` en PostgreSQL,
según ADR-0006. Las zonas no se borran: se desactivan.

#### `GET /admin/configuracion/zonas`

- **Éxito:** `200 OK` con `{ "zonas": [ { "id", "nombre", "criterio", "activa", "creadaEn" } ] }`.
- **Errores:** `401 NO_AUTENTICADO`, `403 NO_AUTORIZADO`.

#### `POST /admin/configuracion/zonas`

- **Cuerpo:** `{ "nombre", "criterio" }`; `activa` es opcional y por defecto `true`.
- **Éxito:** `201 Created` con `{ "zona": { … } }`.
- **Errores:** `400 DATOS_INVALIDOS`, `409 NOMBRE_YA_REGISTRADO`, `409 ZONAS_SUPERPUESTAS`.

#### `PATCH /admin/configuracion/zonas/{id}`

- **Cuerpo:** al menos uno de `{ "nombre"?, "criterio"?, "activa"? }`. Permite
  desactivar (`"activa": false`) y reactivar la zona.
- **Éxito:** `200 OK` con `{ "zona": { … } }`.
- **Errores:** `400 DATOS_INVALIDOS`, `404 NO_ENCONTRADO`, `409 NOMBRE_YA_REGISTRADO`,
  `409 ZONAS_SUPERPUESTAS`.

#### Tarifas: `/admin/configuracion/tarifas`

`GET /tarifas`, `POST /tarifas`, `PATCH /tarifas/{id}` y
`POST /tarifas/{id}/publicar`.

- **Ciclo:** se crea un **borrador**, se edita y se **publica**. La versión la
  asigna la base; `publicar` no acepta `vigenteDesde` del cliente: usa una sola
  marca del reloj del servidor para `vigenteDesde`, `publicadaEn` y `creadaEn`.
  Una versión publicada no cambia nunca (I12); cambiarla es publicar otra.
- **Cuerpo de borrador / edición:**

```json
{
  "baseCentavos": 100000,
  "porKmCentavos": 50000,
  "porMinutoCentavos": 10000,
  "precioMaximoCentavos": 1000000
}
```

- **Éxito:** `201 Created` (borrador) o `200 OK`, con
  `{ "tarifa": { "id", "estado", "version", "baseCentavos", "porKmCentavos", "porMinutoCentavos", "precioMaximoCentavos", "vigenteDesde", "publicadaPorId", "publicadaEn", "creadaEn" } }`.
- **Errores:** `400 DATOS_INVALIDOS` (por ejemplo, `precioMaximoCentavos` menor
  que `baseCentavos`), `404 NO_ENCONTRADO`, `409 VERSION_YA_PUBLICADA`.

#### Reglas: `/admin/configuracion/reglas`

`GET /reglas`, `POST /reglas`, `PATCH /reglas/{id}` y `POST /reglas/{id}/publicar`.

- **Ciclo y roles:** iguales a las tarifas.
- **Cuerpo de borrador / edición:**

```json
{
  "umbralInferior": "0.5",
  "umbralSuperior": "3",
  "multiplicadorMinimo": "1",
  "multiplicadorMaximo": "2",
  "escalaMultiplicador": 2
}
```

Los decimales viajan como texto (0 a 4 lugares). Reglas: `umbralSuperior` mayor
que `umbralInferior`; `multiplicadorMinimo` entre `"1"` y el máximo. La fórmula
es siempre `LINEAL_POR_TRAMOS` y no se envía en el cuerpo.

- **Cuerpo de publicación:** opcional, `{ "motivo": "Hora pico de diciembre" }`.
  `vigenteDesde` y `publicadaEn` los fija el servidor.
- **Éxito:** `201 Created` (borrador) o `200 OK` con `{ "regla": { … } }`.
- **Errores:** los mismos que las tarifas.

### 5.3 Cotización y confirmación

**Implementado — tarjeta E2 · RF-04 + RF-17 + RF-05 + RF-18 + RF-19.**
Implementa ADR-0005. El flujo nuevo es
`POST /cotizaciones` → `POST /cotizaciones/{id}/confirmar`; `POST /viajes`
permanece como ruta legacy/provisional y no se eliminó en esta entrega.

Al cotizar, el servidor estima distancia y tiempo (Haversine), busca la zona
activa del origen, cuenta solicitudes y choferes disponibles, calcula el
multiplicador con aritmética exacta y guarda todo como foto inmutable (I11).
Ningún importe ni multiplicador lo envía el cliente.

- **Solicitudes que cuentan:** viajes con origen en la zona en estado
  `SOLICITADO`, `ASIGNADO`, `CHOFER_EN_CAMINO` o `EN_CURSO`, con
  `solicitadoEn >= ahora - DEMANDA_VENTANA_MS` (300 000 ms por defecto).
- **Choferes que cuentan:** habilitados, disponibles, sin viaje activo y con
  ubicación vigente (`UBICACION_VIGENCIA_MS`) dentro de la zona.
- **Trazabilidad:** la cotización guarda conteos, `reglaId` y `reglaVersion`,
  `tarifaId` y `tarifaVersion`, `multiplicador`, `precioCentavos` y
  `parametrosConteo`. Los id y los parámetros se guardan para auditoría, pero la
  respuesta pública solo expone las versiones y los conteos.

#### `POST /cotizaciones`

- **Roles:** `PASAJERO`.
- **Cuerpo:**

```json
{
  "origen": { "lat": -34.6037, "lng": -58.3816 },
  "destino": { "lat": -34.5889, "lng": -58.4306 }
}
```

- **Éxito:** `201 Created`

```json
{
  "cotizacion": {
    "id": "f3a4b5c6-d7e8-4f9a-8b0c-1d2e3f4a5b30",
    "pasajeroId": "3f1c2a9e-5b7d-4c11-9a2e-0d4b6f8e1a01",
    "origen": { "lat": -34.6037, "lng": -58.3816 },
    "destino": { "lat": -34.5889, "lng": -58.4306 },
    "distanciaEstimadaM": 4777,
    "tiempoEstimadoS": 840,
    "zonaId": "e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a20",
    "solicitudesUsadas": 12,
    "choferesDisponiblesUsados": 8,
    "reglaVersion": 3,
    "tarifaVersion": 2,
    "multiplicador": "1.25",
    "precioCentavos": 458563,
    "calculadaEn": "2026-11-20T18:30:00.000Z",
    "venceEn": "2026-11-20T18:35:00.000Z",
    "estado": "VIGENTE"
  }
}
```

- **Errores:** `400 DATOS_INVALIDOS`, `403 NO_AUTORIZADO`, `422 FUERA_DE_COBERTURA`,
  `503 CONFIGURACION_INCOMPLETA`, `429 DEMASIADAS_SOLICITUDES` (§7.1).

#### `GET /cotizaciones`

- **Roles:** `PASAJERO`.
- **Éxito:** `200 OK` con `{ "cotizaciones": [ … ] }`, solo las propias, con el
  `estado` efectivo calculado según la hora del servidor.

#### `GET /cotizaciones/{id}`

- **Roles:** autenticado. Por recurso: `PASAJERO` (propio), `OPERADOR_SOPORTE` o
  `ADMINISTRADOR`.
- **Éxito:** `200 OK` con `{ "cotizacion": { … } }`. El `estado` es el **efectivo**:
  una cotización vigente con `ahora ≥ venceEn` se devuelve como `VENCIDA`.
- **Errores:** `400 DATOS_INVALIDOS`, `403 NO_AUTORIZADO`, `404 NO_ENCONTRADO`.

#### `POST /cotizaciones/{id}/confirmar`

- **Roles:** `PASAJERO`. Por recurso: solo el **dueño** de la cotización.
- **Cabeceras:** `Idempotency-Key` obligatoria (§3).
- **Descripción:** convierte la cotización vigente en un viaje `SOLICITADO` con
  un `UPDATE` condicional sobre `estado = 'VIGENTE' AND vence_en > ahora`, en una
  sola transacción. `precioFijadoCentavos` y `multiplicadorFijado` se **copian de
  la cotización**: el pasajero paga exactamente el precio que vio, aunque la
  demanda haya cambiado. No dispara ofertas: eso queda para E3.
- **Cuerpo:** vacío. La ruta no valida campos adicionales; el precio nunca se
  toma del cliente.
- **Éxito:** `201 Created`

```json
{
  "viaje": {
    "id": "5d2e8f14-6a3b-4c7d-9e1f-2a3b4c5d6e10",
    "pasajeroId": "3f1c2a9e-5b7d-4c11-9a2e-0d4b6f8e1a01",
    "cotizacionId": "f3a4b5c6-d7e8-4f9a-8b0c-1d2e3f4a5b30",
    "precioFijadoCentavos": 458563,
    "multiplicadorFijado": "1.25",
    "choferId": null,
    "estado": "SOLICITADO",
    "solicitadoEn": "2026-11-20T18:31:10.000Z"
  }
}
```

- **Reintento con la misma clave y la misma cotización:** `200 OK` con
  `Idempotency-Replayed: true` y el viaje original, aunque la demanda cambió.
- **Errores:**

| HTTP | Código | Causa |
|---:|---|---|
| 400 | `CLAVE_DE_IDEMPOTENCIA_REQUERIDA` | Falta la cabecera. |
| 400 | `DATOS_INVALIDOS` | El identificador de la cotización no es UUID. |
| 403 | `NO_AUTORIZADO` | No es el dueño (otro rol o recurso ajeno). |
| 404 | `NO_ENCONTRADO` | La cotización no existe. |
| 409 | `COTIZACION_YA_CONFIRMADA` | Ya generó un viaje (con otra clave). |
| 409 | `CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO` | La clave se usó para confirmar otra cotización. |
| 410 | `COTIZACION_VENCIDA` | `ahora ≥ venceEn`. |

### 5.4 Vehículo y ubicación del chofer

`GET` y `PUT /choferes/yo/vehiculo` y `PUT /choferes/yo/ubicacion` **ya existen** (§4.3). Quedan propuestos:

#### `GET /choferes/{usuarioId}` — Propuesto — tarjeta E5 · historial y soporte

- **Roles:** `OPERADOR_SOPORTE`, `ADMINISTRADOR`.
- **Descripción:** perfil operativo y vehículo de cualquier chofer. Los casos de uso `obtener-perfil-chofer.js` y `obtener-vehiculo.js` ya admiten al administrador y a soporte; falta la ruta.
- **Éxito:** `200 OK` con `{ "chofer": { … }, "vehiculo": { … } | null }`.

#### Recorrido histórico — Propuesto — tarjeta E4 · ubicación, tiempo real y recorrido

Cuando el chofer tenga un viaje activo, `PUT /choferes/yo/ubicacion` también agregará un punto histórico al recorrido (fase `ACERCAMIENTO` o `EN_CURSO`) en una tabla aparte, para no agrandar el índice de la ubicación vigente (RF-20).

### 5.5 Ofertas y asignación

Todas: **Propuesto — tarjeta E3 · ofertas y asignación**. Reemplazan a `GET /viajes/disponibles` y `POST /viajes/{id}/aceptar` (§8, D2).

Los candidatos de cada oferta salen del puerto `BuscadorDeChoferesCercanos`, **ya implementado** con PostGIS (RF-06): devuelve hasta `BUSQUEDA_MAX_CANDIDATOS` (10) choferes elegibles dentro de `BUSQUEDA_RADIO_M` (5000 m), del más cercano al más lejano. Medición en `docs/mediciones.md` §1.

Forma de la oferta:

```json
{
  "id": "a7b8c9d0-e1f2-4a3b-8c4d-5e6f7a8b9c40",
  "viajeId": "5d2e8f14-6a3b-4c7d-9e1f-2a3b4c5d6e10",
  "choferId": "7c9e4b21-2d3f-4a8b-b6c5-1e0f9d8a2b02",
  "orden": 1,
  "estado": "PENDIENTE",
  "creadaEn": "2026-11-20T18:31:11.000Z",
  "venceEn": "2026-11-20T18:31:41.000Z",
  "respondidaEn": null,
  "viaje": {
    "origen": { "lat": -34.6037, "lng": -58.3816 },
    "destino": { "lat": -34.5889, "lng": -58.4306 },
    "distanciaEstimadaM": 4777,
    "precioFijadoCentavos": 458563,
    "multiplicadorFijado": "1.25"
  }
}
```

El resumen `viaje` no incluye datos personales del pasajero.

#### `GET /ofertas`

- **Roles:** `CHOFER` (solo las propias).
- **Parámetros de consulta:** `estado` (por defecto `PENDIENTE`).
- **Éxito:** `200 OK` con `{ "ofertas": [ … ] }`. Las ofertas con `ahora ≥ venceEn` se informan como `VENCIDA` aunque el proceso de vencimiento no haya corrido.

#### `POST /ofertas/{id}/aceptar`

- **Roles:** `CHOFER`. Por recurso: solo el **destinatario** de la oferta.
- **Descripción:** acepta la oferta y asigna el viaje, en una transacción con orden de bloqueo viaje → oferta → chofer (ADR-0004). Las demás ofertas del viaje pasan a `ANULADA`.
- **Cuerpo:** ninguno.
- **Éxito:** `200 OK` con `{ "oferta": { …, "estado": "ACEPTADA" }, "viaje": { …, "estado": "ASIGNADO" } }`.
- **Errores:**

| HTTP | Código | Causa |
|---:|---|---|
| 403 | `NO_AUTORIZADO` | No es el destinatario. |
| 404 | `NO_ENCONTRADO` | La oferta no existe. |
| 409 | `OFERTA_NO_PENDIENTE` | Ya respondida o anulada (también al repetir la aceptación). |
| 409 | `VIAJE_NO_DISPONIBLE` | El viaje ya no está `SOLICITADO`. |
| 409 | `CHOFER_OCUPADO` / `CHOFER_NO_ELEGIBLE` | Se revalida al aceptar. |
| 410 | `OFERTA_VENCIDA` | `ahora ≥ venceEn`. |

#### `POST /ofertas/{id}/rechazar`

- **Roles:** `CHOFER` (destinatario).
- **Éxito:** `200 OK` con `{ "oferta": { …, "estado": "RECHAZADA" } }`. La búsqueda sigue con el próximo candidato.
- **Errores:** `403`, `404`, `409 OFERTA_NO_PENDIENTE`, `410 OFERTA_VENCIDA`.

### 5.6 Transiciones del viaje

Todas las transiciones tienen **cuerpo vacío** (salvo la cancelación, que exige `motivo`), devuelven `200 OK` con `{ "viaje": { … } }` y rechazan con `409 TRANSICION_INVALIDA` si el estado actual no la admite (`docs/modelo.md` §6.1).

| Endpoint | Roles | Estado origen → destino | Tarjeta |
|---|---|---|---|
| `POST /viajes/{id}/en-camino` | `CHOFER` asignado | `ASIGNADO` → `CHOFER_EN_CAMINO` | **Propuesto — tarjeta E3 · ofertas y asignación** |
| `POST /viajes/{id}/iniciar` | `CHOFER` asignado | `CHOFER_EN_CAMINO` → `EN_CURSO` (fija `iniciadoEn`) | **Propuesto — tarjeta E3 · ofertas y asignación** |
| `POST /viajes/{id}/finalizar` (ajuste) | `CHOFER` asignado | `EN_CURSO` → `FINALIZADO` (hoy existe desde `ASIGNADO`, §4.4) | **Propuesto — tarjeta E4 · tarifa y cobro** |
| `POST /viajes/{id}/cancelar` (ampliado) | `PASAJERO` dueño, `CHOFER` asignado, `OPERADOR_SOPORTE` | Según el actor, ver abajo. | **Propuesto — tarjetas E3 (chofer) y E5 (soporte)** |

**Ajuste propuesto de `POST /viajes/{id}/finalizar`.** El endpoint ya existe (§4.4): hoy finaliza desde `ASIGNADO` y cobra `precioFijadoCentavos`. Cuando existan `EN_CURSO` y el recorrido, se propone que finalice desde `EN_CURSO` y que el servidor calcule `distanciaRealM` con los puntos `EN_CURSO`, `tiempoRealS` y `tarifaFinalCentavos` (`docs/modelo.md` §7.3, opción A: nunca supera `precioFijadoCentavos`), y que el cobro use ese monto. Sigue sin recibir distancia, tiempo ni importes, y mantiene la clave de idempotencia.

```json
{
  "viaje": {
    "id": "5d2e8f14-6a3b-4c7d-9e1f-2a3b4c5d6e10",
    "estado": "FINALIZADO",
    "precioFijadoCentavos": 458563,
    "multiplicadorFijado": "1.25",
    "iniciadoEn": "2026-11-20T18:40:00.000Z",
    "cerradoEn": "2026-11-20T18:54:00.000Z",
    "distanciaRealM": 4650,
    "tiempoRealS": 840,
    "tarifaFinalCentavos": 452000
  },
  "cobro": {
    "id": "b8c9d0e1-f2a3-4b4c-9d5e-6f7a8b9c0d50",
    "montoCentavos": 452000,
    "estado": "COBRADO"
  }
}
```

**Cancelación ampliada.** Mantiene la ruta y el cuerpo `{ "motivo" }` actuales; el estado final lo decide el caso de uso según quién cancela:

| Actor | Estados en los que puede cancelar | Estado final |
|---|---|---|
| `PASAJERO` dueño | `SOLICITADO`, `ASIGNADO`, `CHOFER_EN_CAMINO` | `CANCELADO_POR_PASAJERO` |
| `CHOFER` asignado | `ASIGNADO`, `CHOFER_EN_CAMINO` | `CANCELADO_POR_CHOFER` |
| `OPERADOR_SOPORTE` | `SOLICITADO`, `ASIGNADO`, `CHOFER_EN_CAMINO`, `EN_CURSO` | `CANCELADO_POR_SOPORTE` (Q10) |

En todos los casos las ofertas pendientes pasan a `ANULADA` y el chofer se libera en la misma transacción. Errores: `400 DATOS_INVALIDOS`, `403 NO_AUTORIZADO`, `404 NO_ENCONTRADO`, `409 TRANSICION_INVALIDA`.

### 5.7 Ubicación del viaje y tiempo real

Todas: **Propuesto — tarjeta E4 · tiempo real**.

#### `GET /viajes/{id}/ubicacion`

- **Roles:** solo **participantes**: `PASAJERO` dueño y `CHOFER` asignado, y solo mientras el viaje está activo (`ASIGNADO`, `CHOFER_EN_CAMINO` o `EN_CURSO`). Soporte y administrador se rechazan (RF-21, I10).
- **Éxito:** `200 OK` con `{ "ubicacion": { "punto": { "lat", "lng" }, "actualizadaEn" } }`.
- **Errores:** `403 NO_AUTORIZADO` (no participante o viaje no activo), `404 NO_ENCONTRADO`, `404 UBICACION_NO_DISPONIBLE` (propuesto).

#### `GET /viajes/{id}/recorrido`

- **Roles:** participantes (Q14 decide si se suma soporte o administrador).
- **Éxito:** `200 OK` con `{ "puntos": [ { "secuencia", "punto", "registradaEn", "fase" } ] }`.

#### Canal de tiempo real

El transporte (WebSocket o SSE) lo decide el ADR de la tarjeta E4; aquí solo se fijan los **eventos**. Reglas comunes:

- Autenticación con el mismo JWT de usuario.
- Cada evento solo llega a quien tiene permiso de leer el recurso por HTTP (mismas reglas por recurso de §6).
- Los eventos se emiten **después** de confirmar la transacción, nunca con filas bloqueadas (ADR-0004).
- Forma común: `{ "tipo", "ocurridoEn", "datos" }`.

| Evento | Destinatarios | `datos` |
|---|---|---|
| `oferta.creada` | Chofer destinatario | La oferta (§5.5). |
| `oferta.anulada` / `oferta.vencida` | Chofer destinatario | `{ "ofertaId", "viajeId" }` |
| `viaje.estado_cambiado` | Pasajero y chofer asignado | `{ "viajeId", "estadoAnterior", "estado", "choferId" }` |
| `viaje.ubicacion_chofer` | Pasajero y chofer asignado, solo con viaje activo | `{ "viajeId", "punto", "actualizadaEn" }` |
| `viaje.sin_choferes` | Pasajero | `{ "viajeId" }` |
| `cobro.registrado` | Pasajero y chofer del viaje | `{ "viajeId", "cobroId", "montoCentavos", "estado" }` |

### 5.8 Cobro simulado

El cobro simulado **ya existe**: se registra y se ejecuta dentro de `POST /viajes/{id}/finalizar` y se consulta con `GET /viajes/{id}/cobro` (§4.4). No hace falta un endpoint aparte para cobrar. Lo que queda para **E4 · tarifa y cobro** es que el monto pase a ser `tarifaFinalCentavos` en lugar de `precioFijadoCentavos` (§5.6 y §8, D24).

### 5.9 Historial y soporte

Todas: **Propuesto — tarjeta E5 · historial y soporte**.

#### `GET /viajes`

- **Roles:** `PASAJERO` y `CHOFER` (solo los viajes donde participan), `ADMINISTRADOR` (todos, solo lectura).
- **Parámetros de consulta:** `estado` (opcional, repetible), `desde` y `hasta` (ISO-8601), `limite` (1 a 100, por defecto 20), `cursor` (opaco, devuelto por la página anterior).
- **Éxito:** `200 OK` con `{ "viajes": [ … ], "siguienteCursor": "…" | null }`, ordenados por `solicitadoEn` descendente.

#### `GET /viajes/activos`

- **Roles:** `OPERADOR_SOPORTE`, `ADMINISTRADOR`.
- **Descripción:** viajes `SOLICITADO`, `ASIGNADO`, `CHOFER_EN_CAMINO` y `EN_CURSO`, para atender reclamos. Sin ubicaciones (RF-21).
- **Parámetros de consulta:** `limite`, `cursor`.
- **Éxito:** `200 OK` con `{ "viajes": [ … ], "siguienteCursor": … }`.

La cancelación por soporte usa `POST /viajes/{id}/cancelar` ampliado (§5.6).

### 5.10 Integración con Python

Todas: **Propuesto — tarjeta E4 · parte Python**. Implementan ADR-0007 y `docs/python.md` §3.

#### `GET /integracion/zonas/{zonaId}/viajes-finalizados`

- **Roles:** solo el **servicio Python**, con `Authorization: Bearer <REPORTES_SERVICE_TOKEN>`. No acepta JWT de usuarios: un token de usuario recibe `401 NO_AUTENTICADO`. La comparación de la credencial es en tiempo constante.
- **Parámetros de consulta:** `desde` y `hasta` (ISO-8601, obligatorios; `desde` anterior a `hasta`; rango máximo a configurar, propuesta: 31 días).
- **Descripción:** viajes `FINALIZADO` cuyo origen está en la zona, **sin datos personales** (sin nombres, emails ni ubicaciones).
- **Éxito:** `200 OK`

```json
{
  "zonaId": "e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a20",
  "desde": "2026-11-01T00:00:00.000Z",
  "hasta": "2026-11-08T00:00:00.000Z",
  "viajes": [
        {
      "id": "5d2e8f14-6a3b-4c7d-9e1f-2a3b4c5d6e10",
      "zonaId": "e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a20",
      "iniciadoEn": "2026-11-02T13:56:00.000Z",
      "finalizadoEn": "2026-11-02T14:10:00.000Z",
      "duracionS": 840,
      "subtotalCentavos": 238000,
      "tarifaFinalCentavos": 297500,
      "multiplicador": "1.25",
      "solicitudesUsadas": 12,
      "choferesDisponiblesUsados": 6,
      "reglaVersion": 3
    }
  ]
}
```
- **Campos:** los que se suman a la propuesta original los usan la demanda por hora, el simulador y la auditoría de Python; ver `docs/python.md` §9.2.

- **Errores:** `400 DATOS_INVALIDOS` (rango inválido), `401 NO_AUTENTICADO` (sin credencial o credencial incorrecta), `404 NO_ENCONTRADO` (zona inexistente).

#### `GET /reportes/zonas/{zonaId}`

- **Roles:** `ADMINISTRADOR`.
- **Descripción:** Node reenvía la consulta al `GET /reportes/zonas/{zonaId}` de Python con tiempo máximo de espera (propuesta: 3 s) y devuelve el último reporte guardado. Python no vuelve a llamar a Node en esta consulta.
- **Éxito:** `200 OK`

```json
{
  "reporte": {
    "zonaId": "e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a20",
    "desde": "2026-11-01T00:00:00.000Z",
    "hasta": "2026-11-08T00:00:00.000Z",
    "viajesFinalizados": 3,
    "sumaTarifasCentavos": 812000,
    "duracionPromedioS": 905,
    "multiplicadorPromedio": "1.17",
    "porcentajeConMultiplicador": 66.7,
    "calculadoEn": "2026-11-08T10:00:00.000Z"
  }
}
```

- **Errores:** `403 NO_AUTORIZADO`, `404 NO_ENCONTRADO` (zona inexistente o reporte nunca calculado), `503 SERVICIO_NO_DISPONIBLE` (propuesto: Python no respondió a tiempo). Una caída de Python no afecta al resto de la API.

Los endpoints propios de Python (`POST /reportes/zonas/{zonaId}/actualizar` y `GET /health`) los documenta su README; no forman parte de esta API.

---

## 6. Tabla de permisos

**✓** permitido · **✗** rechazado · **propio** solo sobre recursos propios · *cursiva* = endpoint propuesto.

| Endpoint | `PASAJERO` | `CHOFER` | `OPERADOR_SOPORTE` | `ADMINISTRADOR` | Servicio Python |
|---|:-:|:-:|:-:|:-:|:-:|
| `GET /health`, `GET /ready` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /auth/registro` | ✓ | ✓ | ✓ | ✓ | ✗ |
| `POST /auth/login` | ✓ | ✓ | ✓ | ✓ | ✗ |
| `GET /auth/yo` | propio | propio | propio | propio | ✗ |
| `GET /usuarios/{id}` | propio | propio | propio | ✓ | ✗ |
| `PATCH /usuarios/{id}` | propio | propio | propio | propio | ✗ |
| `GET /choferes/yo` | ✗ | propio | ✗ | ✗ | ✗ |
| `PATCH /choferes/yo` | ✗ | propio | ✗ | ✗ | ✗ |
| `PATCH /choferes/{usuarioId}/habilitacion` | ✗ | ✗ | ✗ | ✓ | ✗ |
| `POST /viajes` | ✓ | ✗ | ✗ | ✗ | ✗ |
| `GET /viajes/disponibles` | ✗ | ✓ (elegible) | ✗ | ✗ | ✗ |
| `GET /viajes/{id}` | propio | propio (asignado) | ✓ | ✓ | ✗ |
| `POST /viajes/{id}/aceptar` | ✗ | ✓ (elegible) | ✗ | ✗ | ✗ |
| `POST /viajes/{id}/cancelar` (hoy) | propio | ✗ | ✗ | ✗ | ✗ |
| `POST /viajes/{id}/finalizar` | ✗ | propio (asignado) | ✗ | ✗ | ✗ |
| `GET /viajes/{id}/cobro` | propio | propio (asignado) | ✓ | ✓ | ✗ |
| *`POST /usuarios`* | ✗ | ✗ | ✗ | ✓ | ✗ |
| `GET`, `POST /admin/configuracion/zonas` y `PATCH /admin/configuracion/zonas/{id}` | ✗ | ✗ | ✗ | ✓ | ✗ |
| `GET`, `POST /admin/configuracion/tarifas`, `PATCH /…/{id}` y `POST /…/{id}/publicar` | ✗ | ✗ | ✗ | ✓ | ✗ |
| `GET`, `POST /admin/configuracion/reglas`, `PATCH /…/{id}` y `POST /…/{id}/publicar` | ✗ | ✗ | ✗ | ✓ | ✗ |
| `POST /cotizaciones`, `GET /cotizaciones` | ✓ | ✗ | ✗ | ✗ | ✗ |
| `GET /cotizaciones/{id}` | propio | ✗ | ✓ | ✓ | ✗ |
| `POST /cotizaciones/{id}/confirmar` | propio | ✗ | ✗ | ✗ | ✗ |
| `GET`, `PUT /choferes/yo/vehiculo` | ✗ | propio | ✗ | ✗ | ✗ |
| *`GET /choferes/{usuarioId}`* | ✗ | ✗ | ✓ | ✓ | ✗ |
| `PUT /choferes/yo/ubicacion` | ✗ | propio (habilitado) | ✗ | ✗ | ✗ |
| *`GET /ofertas`* | ✗ | propio | ✗ | ✗ | ✗ |
| *`POST /ofertas/{id}/aceptar`, `…/rechazar`* | ✗ | propio (destinatario) | ✗ | ✗ | ✗ |
| *`POST /viajes/{id}/en-camino`, `…/iniciar`* | ✗ | propio (asignado) | ✗ | ✗ | ✗ |
| *`POST /viajes/{id}/cancelar` (ampliado)* | propio | propio (asignado) | ✓ | ✗ | ✗ |
| *`GET /viajes/{id}/ubicacion`, `…/recorrido`* | propio (activo) | propio (asignado, activo) | ✗ | ✗ | ✗ |
| *Canal de tiempo real* | propio | propio | ✗ | ✗ | ✗ |
| *`GET /viajes` (historial)* | propio | propio | ✗ | ✓ | ✗ |
| *`GET /viajes/activos`* | ✗ | ✗ | ✓ | ✓ | ✗ |
| *`GET /integracion/zonas/{zonaId}/viajes-finalizados`* | ✗ | ✗ | ✗ | ✗ | ✓ |
| *`GET /reportes/zonas/{zonaId}`* | ✗ | ✗ | ✗ | ✓ | ✗ |

Notas sobre la tabla:

- Salud, registro y login son **públicos**: no exigen token. El registro siempre crea una cuenta nueva de `PASAJERO` o `CHOFER`, sin importar quién lo llame.
- En la columna «Servicio Python», ✗ significa que la credencial de servicio no es un JWT de usuario: en los endpoints autenticados se rechaza con `401 NO_AUTENTICADO`, y en registro y login no corresponde porque el servicio no tiene cuenta de usuario.
- «propio» en `PATCH /usuarios/{id}` incluye al administrador: puede ver cualquier cuenta, pero solo editar la suya.
- La configuración administrativa (§5.2) es de **lectura y escritura exclusiva** del `ADMINISTRADOR`; `OPERADOR_SOPORTE` no puede consultarla. Los datos necesarios para explicar un precio están en la cotización (§5.3).

### 6.1 Verificación por rol y verificación por recurso

Los permisos se controlan en **dos niveles**, como fija ADR-0003:

1. **Por rol, en la capa HTTP.** El middleware `crearAutorizacionPorRol(...)` se monta en la ruta, después de la autenticación, y rechaza con **`403 NO_AUTORIZADO`** y el mensaje genérico `"No tenés permiso para realizar esta operación."` a quien no tiene un rol permitido. No consulta la base: el rol viaja firmado en el JWT. Responde antes de validar el cuerpo y antes de buscar el recurso. Ejemplo: un chofer que llama a `POST /viajes/{id}/cancelar`.
2. **Por recurso, en el caso de uso** (`src/application/use-cases/`). El caso de uso recibe al solicitante (`usuarioId` y `rol`) y comprueba que el recurso le pertenezca o que su rol pueda verlo. También responde **`403 NO_AUTORIZADO`**, pero con un mensaje específico (por ejemplo, `"No tenés permiso para cancelar este viaje."`). Ejemplo: otro pasajero que intenta cancelar un viaje ajeno.

La regla por recurso vive en la aplicación y no en Express para que valga igual desde HTTP, desde el canal de tiempo real o desde un test. Las rutas sin control por rol (`/usuarios/{id}`, `GET /viajes/{id}`) delegan **todo** el permiso al caso de uso. Cada endpoint nuevo declara sus roles en la ruta y, si toca un recurso con dueño, verifica la propiedad en su caso de uso.

Hoy los casos de uso buscan el recurso **antes** de verificar el permiso: un identificador inexistente responde `404` aunque el solicitante no tuviera permiso sobre él (§8, D16).

---

## 7. Límites

### 7.1 Límites de solicitudes vigentes

| Límite | Alcance | Valor por defecto | Configuración | Respuesta al superarlo |
|---|---|---|---|---|
| **Global** | Todas las rutas, incluidas `/health` y `/ready`, por IP. | 300 solicitudes por minuto. | `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS` | `429 DEMASIADAS_SOLICITUDES` (`"Se superó el límite de solicitudes. Intente más tarde."`). |
| **Login** | `POST /auth/login`, por IP. Solo cuentan los intentos **fallidos** (respuesta 4xx o 5xx). | 5 fallos cada 15 minutos. | `LOGIN_RATE_LIMIT_MAX`, `LOGIN_RATE_LIMIT_WINDOW_MS` | `429 DEMASIADAS_SOLICITUDES` (`"Demasiados intentos de inicio de sesión. Intentá más tarde."`). |
| **Registro** | `POST /auth/registro`, por IP. | 10 solicitudes por minuto. | `REGISTRO_RATE_LIMIT_MAX`, `REGISTRO_RATE_LIMIT_WINDOW_MS` | `429 DEMASIADAS_SOLICITUDES` (`"Se superó el límite de registros. Intente más tarde."`). |
| **Viajes** | `POST /viajes`, `/aceptar`, `/finalizar`, `/cancelar`, `POST /cotizaciones`, `POST /cotizaciones/{id}/confirmar` y las escrituras de `/admin/configuracion`, por IP, con un contador **compartido** entre todas esas rutas. | 30 solicitudes por minuto. | `VIAJES_RATE_LIMIT_MAX`, `VIAJES_RATE_LIMIT_WINDOW_MS` | `429 DEMASIADAS_SOLICITUDES` (`"Se superó el límite de operaciones sobre viajes. Intente más tarde."`). |

- Todos devuelven las cabeceras `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` y `RateLimit-Policy` (borrador 6 del IETF), por ejemplo `RateLimit-Limit: 30`, `RateLimit-Remaining: 29`, `RateLimit-Reset: 60`, `RateLimit-Policy: 30;w=60`, y `Retry-After` en el 429. En las rutas con un límite propio, las cabeceras muestran ese límite y no el global.
- Los límites de registro y de viajes se suman al global: una solicitud cuenta para los dos.
- El contador del login es **por IP, no por email**: los fallos con distintos emails desde la misma IP se suman, y al superarlo también se rechaza un login correcto desde esa IP hasta que vence la ventana.
- Los contadores viven **en memoria del proceso**: con varias instancias cada una cuenta por separado (ADR-0003).
- `trust proxy` está en `1`: detrás de un proxy, la IP es la del primer salto de `X-Forwarded-For`.
- `PUT /choferes/yo/ubicacion` no tiene un límite propio todavía: ver §7.2.
- El contador «de viajes» cubre también cotizar, confirmar y las escrituras de configuración; el mensaje de error conserva el texto histórico («operaciones sobre viajes»).

### 7.2 Límites propuestos para endpoints costosos

| Endpoint | Motivo | Propuesta | Tarjeta |
|---|---|---|---|
| `PUT /choferes/yo/ubicacion` | Alta frecuencia por diseño. Hoy solo la cubre el límite global por IP (300 por minuto): 500 choferes simulados desde una sola máquina cada 2 segundos (unos 15 000 por minuto) quedarían bloqueados. | Límite por chofer (clave `usuarioId`), por ejemplo 1 por segundo, en lugar del global por IP. | E4 · simulador, carga y mediciones |
| `GET /reportes/zonas/{zonaId}` | Llama a otro servicio. | Límite por usuario, por ejemplo 10 por minuto. | E4 · parte Python |

Los límites por usuario usan el `usuarioId` del token como clave, no la IP. Si se pasa a varias instancias, los contadores se mueven a un almacén compartido.

### 7.3 Tamaño del cuerpo

- `BODY_LIMIT`: **100 kB** por defecto (formato `100kb` o `1mb`). Se aplica a JSON y a `application/x-www-form-urlencoded`.
- Al superarlo: `413 CUERPO_DEMASIADO_GRANDE`.
- Además, cada campo de texto tiene su propio máximo en el esquema (nombre 100, motivo 500, email 254, contraseña 72).

### 7.4 CORS y cabeceras de seguridad

- `CORS_ORIGIN`: `*` por defecto. Acepta una lista separada por comas (`https://a.ejemplo,https://b.ejemplo`). No se habilitan credenciales con cookies: la autenticación es por cabecera `Authorization`.
- Helmet agrega las cabeceras de seguridad estándar y se desactiva `X-Powered-By`.
- Para la entrega y el ataque cruzado se recomienda fijar `CORS_ORIGIN` a los orígenes reales en lugar de `*`.

---

## 8. Diferencias con el modelo

Cada fila es algo que el código de `main` hace distinto de `docs/modelo.md` o de los ADR, o una inconsistencia encontrada al probar la API. **Esta tarjeta no cambia código**: cada punto queda para la tarjeta indicada, que decide si se corrige el código o el documento.

| # | Diferencia | Modelo o ADR | Código hoy | Tarjeta que la resuelve |
|---|---|---|---|---|
| D1 | ~~El viaje se crea directo, sin cotización.~~ **Resuelto; queda una ruta legacy.** | El viaje nace al **confirmar una cotización** y guarda `cotizacionId` y `multiplicadorFijado` (§4.10, §6.1; ADR-0005). | Ya existe el flujo `POST /cotizaciones` → `POST /cotizaciones/{id}/confirmar`, que fija precio y multiplicador y guarda la trazabilidad. `POST /viajes` se conserva como ruta provisional con tarifa por distancia; los viajes confirmados no se recalculan. | Resuelto en E2 · RF-17 + RF-18 + RF-19; queda decidir cuándo retirar `POST /viajes` |
| D2 | No hay ofertas. | El viaje se **ofrece** a choferes elegibles y se acepta una oferta con vencimiento (§4.11, §6.2). | Cualquier chofer elegible ve los viajes `SOLICITADO` cercanos en `GET /viajes/disponibles` y acepta el viaje directamente. | E3 · ofertas y asignación |
| D3 | ~~La elegibilidad no mira la ubicación.~~ **Resuelta.** | Chofer elegible = habilitado, disponible, libre **y con ubicación vigente reciente** (§2, I5). | Listar y aceptar viajes exigen una ubicación de menos de `UBICACION_VIGENCIA_MS` (60 s por defecto). | Resuelta en E2 · RF-02 + RF-03 |
| D4 | ~~Habilitar no exige vehículo.~~ **Resuelta.** | Habilitar exige un vehículo registrado (§6.4, Q11, propuesta). | Habilitar sin vehículo responde `409 CHOFER_SIN_VEHICULO`; el vehículo no se puede borrar. | Resuelta en E2 · RF-02 + RF-03 |
| D5 | Faltan estados del viaje. | `CHOFER_EN_CAMINO`, `EN_CURSO`, `FINALIZADO`, `CANCELADO_POR_CHOFER`, `CANCELADO_POR_SOPORTE` y `SIN_CHOFERES_DISPONIBLES` con sus transiciones (§6.1). | La entidad `Viaje` del dominio no tiene `CHOFER_EN_CAMINO` ni `EN_CURSO` (la migración `002_viajes.sql` sí los admite), y solo hay transiciones `SOLICITADO → ASIGNADO` y cancelación por pasajero. | E3 · ofertas y asignación, E4 · tarifa y cobro |
| D6 | El pasajero no puede cancelar con el chofer en camino. | El pasajero cancela en `SOLICITADO`, `ASIGNADO` y `CHOFER_EN_CAMINO` (§6.1). | `cancelarPorPasajero` solo admite `SOLICITADO` y `ASIGNADO` (consecuencia de D5). | E3 · ofertas y asignación |
| D7 | Faltan atributos del viaje. | `iniciadoEn`, `distanciaRealM`, `tiempoRealS`, `tarifaFinal` (§4.10). | No existen. `POST /viajes/{id}/finalizar` solo fija `cerradoEn`. | E4 · tarifa y cobro |
| D8 | Nombre del precio. | `precioFijado` (§4.10). | `precioFijadoCentavos`. Se propone adoptar el sufijo `Centavos` en todos los montos de la API (§1) y alinear el modelo. | E2 · cotizar y confirmar |
| D9 | ~~Tarifa provisional distinta de la del modelo.~~ **Resuelta para el flujo nuevo.** | `Tarifa` versionada con `base`, `porKm`, `porMinuto` y `precioMaximo`; sin mínimo (§4.7, §7.2). | La cotización usa la tarifa publicada en la base, con componente por minuto y sin mínimo. `POST /viajes` sigue usando las variables `TARIFA_*` y el mínimo histórico hasta que se retire. | Resuelta en E2 · RF-23 + RF-16 |
| D10 | Soporte no ve usuarios. | El operador ve los datos básicos de los participantes de los viajes que atiende (§3). | `GET /usuarios/{id}` solo admite al propio usuario y al administrador; soporte recibe 403. | E5 · historial y soporte |
| D11 | Soporte y administrador no ven el perfil de chofer. | Ambos pueden ver el chofer y su vehículo (§3). | Solo existen `GET /choferes/yo` y `GET /choferes/yo/vehiculo`, limitados a `CHOFER`, aunque los casos de uso ya admiten al administrador y a soporte. Se propone `GET /choferes/{usuarioId}` (§5.4). | E5 · historial y soporte |
| D12 | El chofer ve todos los viajes solicitados. | El chofer ve solo los viajes que se le **ofrecieron** o asignaron (§3). | **En parte resuelta:** `GET /viajes/disponibles` ya muestra solo los viajes dentro de `BUSQUEDA_RADIO_M` de la ubicación del chofer (RF-06), pero todavía sin ofertas y con el `pasajeroId`. El buscador de choferes cercanos para las ofertas ya está implementado y medido. Se completa con las ofertas (D2). | E3 · ofertas y asignación |
| D13 | El administrador no crea cuentas del personal. | El administrador crea operadores y administradores (§3, Q7, propuesta). | Solo el seed las crea (ADR-0003 lo admite como estado actual). Se propone `POST /usuarios` (§5.1). | E1 · RF-01 y base transversal |
| D14 | Un único código para dos tipos de 403. | `TRANSICION_INVALIDA` cubre también «el actor no puede ejecutarlo» (§9.1). | El código usa `403 NO_AUTORIZADO` tanto para el rol como para el recurso. Se propone mantener `NO_AUTORIZADO` para permisos y reservar `TRANSICION_INVALIDA` para el estado, y actualizar §9.1 del modelo. | E1 · RF-01 y base transversal |
| D15 | Dos códigos para 404. | — | Recurso inexistente → `NO_ENCONTRADO`; ruta inexistente → `RECURSO_NO_ENCONTRADO`. Es intencional, pero el cliente debe conocer ambos. | E1 · RF-01 y base transversal (decidir si se unifican) |
| D16 | Existencia antes que permiso. | La autorización por recurso protege los datos ajenos (I10). | `obtener-viaje`, `cancelar-viaje` y `obtener-perfil-usuario` responden `404` antes de verificar el permiso, así que un tercero puede saber si un UUID existe. El riesgo es bajo (UUID aleatorios), pero conviene decidirlo antes del ataque cruzado. | E1 · RF-01 y base transversal |
| D17 | La respuesta repetida no refleja el estado actual. | La respuesta guardada se devuelve tal cual (§4.13). | Coincide con el modelo, pero el viaje repetido puede mostrar `SOLICITADO` aunque ya esté cancelado, y con las propiedades en otro orden (JSONB). Se documenta en §3.1; no requiere cambio. | — (documentado) |
| D18 | **Bug:** clave de idempotencia larga provoca 500. | Los errores técnicos no llegan al cliente; una entrada inválida es `400` (§9.1). | `claves_idempotencia.clave` es `VARCHAR(255)` y el caso de uso no valida la longitud: una `Idempotency-Key` de 300 caracteres responde `500 ERROR_INTERNO` (probado). Se propone validar longitud y caracteres y responder `400 DATOS_INVALIDOS`. | E1 · RF-01 y base transversal |
| D19 | El límite de login es por IP. | ADR-0003: «5 intentos cada 15 minutos». | Cuenta fallos por IP, no por cuenta. Desde una misma IP (por ejemplo, un laboratorio o el script de carga) unos pocos fallos bloquean el login de todos. Decidir si se agrega un contador por email. | E1 · RF-01 y base transversal |
| D20 | Mensaje de validación en inglés. | Mensajes en español. | Sin `motivo`, la cancelación responde `"Datos inválidos: motivo: Invalid input: expected string, received undefined"` (mensaje por defecto de Zod). Pasa con cualquier campo obligatorio sin mensaje propio. | E1 · RF-01 y base transversal |
| D21 | Errores del parser fuera del límite global. | — | `express.json()` se ejecuta antes del rate limit global: un JSON mal formado o demasiado grande se rechaza sin contar para el límite y sin cabeceras `RateLimit`. | E1 · RF-01 y base transversal |
| D22 | El límite global incluye `/health` y `/ready`. | — | El healthcheck de Docker y un monitor externo consumen cuota de la misma IP. Evaluar excluirlos del límite. | E1 · RF-01 y base transversal |
| D23 | `GET /viajes/disponibles` sin paginación. | — | Devuelve hasta 50 viajes fijos; el caso de uso admite `limite`, pero la ruta no lo expone. Se resuelve con `GET /ofertas` (D2). | E3 · ofertas y asignación |
| D24 | Se finaliza sin pasar por `EN_CURSO` y se cobra el precio fijado. | `EN_CURSO` → `FINALIZADO`, con tarifa final calculada sobre el recorrido real; el cobro nace `PENDIENTE` y se ejecuta después (§4.12, §6.1, §7.3). | `POST /viajes/{id}/finalizar` pasa de `ASIGNADO` a `FINALIZADO` y cobra `precioFijadoCentavos` en la misma transacción; el cobro queda `COBRADO` directamente. Es razonable mientras no existan `EN_CURSO` ni el recorrido. | E3 · ofertas y asignación (estados), E4 · tarifa y cobro (monto) |
| D25 | Finalizar exige clave de idempotencia. | Q8 proponía que avanzar el viaje fuera idempotente solo por su clave natural. | Finalizar exige `Idempotency-Key`, porque además cobra. Se propone adoptarlo en el modelo y en la política de idempotencia (ya está en `docs/politica-de-idempotencia.md`). | E1 · RF-01 y base transversal |
| D26 | El límite de viajes se evalúa antes que el rol. | — | En `/viajes`, el limitador corre antes de `crearAutorizacionPorRol`: un pasajero que llama a `/aceptar` o `/finalizar` recibe 403, pero consume cupo del límite de viajes de su IP. | E1 · RF-01 y base transversal |
| D27 | `finalizar` sobre un viaje `SOLICITADO` responde 403. | Un estado que no admite la operación es `TRANSICION_INVALIDA` (§9.1). | Como el viaje no tiene chofer, el caso de uso responde `403 NO_AUTORIZADO` (`"Solo el chofer asignado puede finalizar este viaje."`) en lugar de `409`. | E3 · ofertas y asignación |
