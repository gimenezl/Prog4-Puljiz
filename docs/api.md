# Contrato de API y permisos

> **Grupo 7 · Programación IV (UTN)** · Tarjeta «E0 · Contrato de API y permisos»
>
> **Estado:** propuesta en revisión. Los endpoints **existentes** están documentados tal como funcionan hoy en `main` y sus ejemplos son respuestas reales de la aplicación levantada con Docker (`docker compose up --build` y `pnpm db:seed`). Los endpoints **propuestos** todavía no existen: están marcados «Propuesto — tarjeta X» y son el acuerdo previo para programarlos.
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
| **Multiplicador** | Texto decimal de escala fija (por ejemplo, `"1.25"`), para no perder precisión. Todavía no existe en el código. |
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

Esta tabla coincide exactamente con `ESTADOS_HTTP_POR_CODIGO` en `src/infrastructure/adapters/in/http/error-mapping.js`. Los marcados *(previsto)* ya tienen su estado HTTP reservado pero ningún caso de uso los lanza todavía.

| Código | HTTP | Cuándo ocurre |
|---|---:|---|
| `DATOS_INVALIDOS` | 400 | El cuerpo no cumple el esquema (campo faltante, tipo incorrecto, campo no declarado), un identificador de ruta no es UUID, o una regla del dominio rechaza el dato (contraseña débil, coordenada fuera de rango, origen igual al destino, rol no autorregistrable). |
| `CREDENCIALES_INVALIDAS` | 401 | Login con email inexistente o contraseña incorrecta (mismo error para ambos, para no revelar qué cuentas existen). |
| `NO_AUTENTICADO` | 401 | Falta la cabecera `Authorization: Bearer`, el token no es válido, venció o no contiene una identidad válida. |
| `NO_AUTORIZADO` | 403 | El rol no está permitido en la ruta (verificación por rol) o el recurso no pertenece al solicitante (verificación por recurso). Ver §6.1. |
| `NO_ENCONTRADO` | 404 | El recurso pedido por identificador no existe (usuario, viaje o perfil de chofer). |
| `EMAIL_YA_REGISTRADO` | 409 | Registro con un email que ya tiene cuenta (sin distinguir mayúsculas). |
| `TRANSICION_INVALIDA` | 409 | El estado actual del viaje no admite la operación (por ejemplo, cancelar un viaje ya cancelado). |
| `VIAJE_NO_DISPONIBLE` | 409 | Se intenta aceptar un viaje que ya no está `SOLICITADO` (lo tomó otro chofer o se canceló). |
| `OFERTA_NO_PENDIENTE` | 409 | *(previsto, E3)* La oferta ya fue aceptada, rechazada o anulada. |
| `CHOFER_NO_ELEGIBLE` | 409 | El chofer no tiene perfil, no está habilitado o no está disponible (al listar o aceptar viajes, o al declararse disponible sin estar habilitado). |
| `CHOFER_OCUPADO` | 409 | El chofer ya tiene un viaje activo. |
| `COTIZACION_YA_CONFIRMADA` | 409 | *(previsto, E2)* La cotización ya generó un viaje. |
| `CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO` | 409 | Se reutilizó una `Idempotency-Key` vigente con un cuerpo distinto (§3). |
| `CLAVE_DE_IDEMPOTENCIA_REQUERIDA` | 400 | Falta la cabecera `Idempotency-Key` (o está vacía) en una operación que la exige. |
| `OFERTA_VENCIDA` | 410 | *(previsto, E3)* La oferta venció: `ahora` es mayor o igual que `venceEn`. |
| `COTIZACION_VENCIDA` | 410 | *(previsto, E2)* La cotización venció antes de confirmarla. |
| `FUERA_DE_COBERTURA` | 422 | *(previsto, E2)* El origen de la cotización no pertenece a ninguna zona activa. |

Un `ErrorDeDominio` con un código que **no** está en esta tabla se responde como `500 ERROR_INTERNO`. Por eso cada código nuevo de las próximas tarjetas se registra primero en `error-mapping.js`.

### 2.2 Códigos del adaptador HTTP

No son motivos del dominio: los generan Express, los middlewares o el manejador global.

| Código | HTTP | Origen | Cuándo ocurre |
|---|---:|---|---|
| `CUERPO_INVALIDO` | 400 | `error-mapping.js` (`entity.parse.failed`) | El cuerpo no es JSON válido. |
| `CUERPO_DEMASIADO_GRANDE` | 413 | `error-mapping.js` (`entity.too.large`) | El cuerpo supera `BODY_LIMIT` (100 kB por defecto). |
| `CODIFICACION_NO_SOPORTADA` | 415 | `error-mapping.js` (`encoding.unsupported`, `charset.unsupported`) | `Content-Encoding` o `charset` no soportados. |
| `RECURSO_NO_ENCONTRADO` | 404 | `not-found.js` | La ruta o el método no existen (no hay 405). |
| `DEMASIADAS_SOLICITUDES` | 429 | `app.js` y `login-rate-limit.js` | Se superó el límite global o el de login (§7). Incluye `Retry-After`. |
| `SOLICITUD_INVALIDA` | 4xx | `error-handler.js` | Respaldo para un error técnico con estado 4xx sin código conocido. |
| `ERROR_INTERNO` | 500 | `error-handler.js` | Cualquier error no controlado. El detalle queda solo en el log. |

### 2.3 Códigos propuestos para las próximas tarjetas

Todavía **no** están en `error-mapping.js`. La tarjeta que los use debe agregarlos allí.

| Código propuesto | HTTP | Cuándo | Tarjeta |
|---|---:|---|---|
| `CONFIGURACION_INCOMPLETA` | 503 | No hay regla de multiplicador o tarifa vigente para cotizar (`docs/modelo.md` §4.6). | E2 · RF-23 + RF-16 |
| `VERSION_YA_PUBLICADA` | 409 | Se intenta editar o volver a publicar una regla o tarifa ya publicada (I12). | E2 · RF-23 + RF-16 |
| `ZONAS_SUPERPUESTAS` | 409 | Una zona activa nueva o modificada se solapa con otra (I16). | E2 · RF-23 + RF-16 |
| `PATENTE_YA_REGISTRADA` | 409 | La patente ya pertenece a otro vehículo. | E2 · RF-02 + RF-03 |
| `UBICACION_NO_DISPONIBLE` | 404 | Se consulta la ubicación de un viaje sin ubicación vigente del chofer. | E4 · tiempo real |
| `SERVICIO_NO_DISPONIBLE` | 503 | El servicio Python no respondió dentro del tiempo máximo (ADR-0007). | E4 · parte Python |

---

## 3. Idempotencia

### 3.1 Comportamiento actual

| Aspecto | Regla |
|---|---|
| **Operaciones que la exigen hoy** | Solo `POST /viajes`. |
| **Cabecera** | `Idempotency-Key: <texto>`. Obligatoria y no vacía; sin ella se responde `400 CLAVE_DE_IDEMPOTENCIA_REQUERIDA`. Se recomienda un UUID v4 generado por el cliente. Longitud máxima efectiva: 255 caracteres (ver §8, D18). |
| **Alcance** | Usuario más operación: `viaje:crear:<pasajeroId>`. La misma clave usada por dos pasajeros distintos son dos claves distintas. |
| **Contenido comparado** | Huella SHA-256 del cuerpo normalizado (`origen` y `destino`, con las claves ordenadas). El orden de las propiedades del JSON no importa. La clave no forma parte de la huella. |
| **Atomicidad** | La clave se registra en la **misma transacción** que el viaje. Dos solicitudes simultáneas con la misma clave crean un solo viaje y reciben la misma respuesta (ADR-0004, C5). |
| **Vigencia** | `IDEMPOTENCIA_TTL_MS`: 24 horas por defecto (configurable entre 1 minuto y 7 días). Pasado ese plazo la clave se olvida y una nueva solicitud con la misma clave crea otro viaje. |
| **Misma clave y mismo contenido** | `200 OK` con la cabecera `Idempotency-Replayed: true` y **la respuesta original guardada**, aunque el viaje haya cambiado de estado después. Para el estado actual se usa `GET /viajes/{id}`. |
| **Misma clave y otro contenido** | `409 CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO`. No se crea nada. |
| **Orden de validación** | Autenticación → rol → esquema del cuerpo → cabecera `Idempotency-Key` → reglas del dominio. Un cuerpo inválido sin clave responde `DATOS_INVALIDOS`, no `CLAVE_DE_IDEMPOTENCIA_REQUERIDA`. |

### 3.2 Operaciones futuras

| Operación | Exige clave | Estado |
|---|---|---|
| `POST /cotizaciones/{id}/confirmar` | Sí. Alcance `cotizacion:confirmar:<pasajeroId>`. | **Propuesto — tarjeta E2 · RF-04 + RF-17 + RF-05 + RF-18 + RF-19** |
| `POST /viajes/{id}/cobro` | Sí. Alcance `cobro:ejecutar:<usuarioId>`. | **Propuesto — tarjeta E4 · tarifa y cobro** |
| Aceptar o rechazar oferta, cancelar, avanzar el viaje | No. Son idempotentes por su clave natural: repetirlas no duplica efectos, la segunda recibe `OFERTA_NO_PENDIENTE` o `TRANSICION_INVALIDA` (`docs/modelo.md` Q8). | Propuesto |
| Cotizar | No. Cada cotización es una foto nueva y no tiene efectos sobre otros recursos. | Propuesto |

En todas las operaciones con clave se mantienen las mismas reglas de §3.1 (alcance por usuario, huella del cuerpo, misma transacción, `Idempotency-Replayed`).

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
- **Descripción:** habilita o inhabilita a un chofer. Al inhabilitar, `disponible` pasa a `false`; si tenía un viaje activo, lo conserva (Q12).
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

### 4.4 Viajes (`/viajes`)

Forma del viaje en todas las respuestas:

| Campo | Descripción |
|---|---|
| `id`, `pasajeroId` | Identidad del viaje y de su pasajero. |
| `origen`, `destino` | Coordenadas. |
| `distanciaEstimadaM` | Distancia en línea recta (Haversine), en metros. |
| `precioFijadoCentavos` | Precio fijado al crear el viaje. Hoy es la **tarifa provisional por distancia**, sin multiplicador (§8, D1). |
| `choferId` | Chofer asignado o `null`. Se conserva como historial si el viaje se cancela. |
| `estado` | Hoy solo `SOLICITADO`, `ASIGNADO` o `CANCELADO_POR_PASAJERO` son alcanzables por la API. |
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

- **Roles:** `CHOFER`. Además, el chofer debe estar **habilitado, disponible y libre**.
- **Descripción:** lista hasta 50 viajes `SOLICITADO` (no hay parámetros de paginación ni filtro geográfico). La lista es orientativa: al aceptar se vuelve a validar todo.
- **Éxito:** `200 OK`

```json
{
  "viajes": [
    {
      "id": "5d2e8f14-6a3b-4c7d-9e1f-2a3b4c5d6e10",
      "pasajeroId": "3f1c2a9e-5b7d-4c11-9a2e-0d4b6f8e1a01",
      "origen": { "lat": -34.6037, "lng": -58.3816 },
      "destino": { "lat": -34.5889, "lng": -58.4306 },
      "distanciaEstimadaM": 4777,
      "precioFijadoCentavos": 338850,
      "choferId": null,
      "estado": "SOLICITADO",
      "solicitadoEn": "2026-11-12T00:18:36.675Z",
      "asignadoEn": null,
      "cerradoEn": null,
      "canceladoPorId": null,
      "motivoCancelacion": null
    }
  ]
}
```

- **Errores:**

| HTTP | Código | Ejemplo de causa |
|---:|---|---|
| 403 | `NO_AUTORIZADO` | Otro rol. |
| 409 | `CHOFER_NO_ELEGIBLE` | No disponible, inhabilitado u ocupado → `"El chofer no está habilitado y disponible para aceptar viajes."` |

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

- **Roles:** `CHOFER`. Además, el chofer debe estar habilitado, disponible y libre.
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
| 409 | `CHOFER_NO_ELEGIBLE` | Sin perfil, inhabilitado o no disponible. |

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
    "idempotencia": { "ok": true },
    "reloj": { "ok": true }
  },
  "fecha": "2026-11-12T00:18:33.565Z"
}
```

- **Fallo:** `503 Service Unavailable` con la **misma forma** (no la de error), `"estado": "no_listo"` y `"ok": false` en los chequeos que fallaron.

---

## 5. Endpoints propuestos

Ninguno de estos endpoints existe todavía. Cada tarjeta puede ajustar nombres o campos, pero cualquier cambio se refleja aquí en el mismo PR. Valen las convenciones de §1: esquemas estrictos, sin importes del cliente, montos en centavos, multiplicador como texto, fechas en UTC.

### 5.1 Cuentas del personal

#### `POST /usuarios` — Propuesto — tarjeta E1 · RF-01 y base transversal

- **Roles:** `ADMINISTRADOR`.
- **Descripción:** crea cuentas de `OPERADOR_SOPORTE` o `ADMINISTRADOR`, que no se pueden autorregistrar (ADR-0003, Q7). Hoy solo las crea el seed.
- **Cuerpo:** `{ "email", "nombre", "contrasena", "rol" }`, con `rol` en `OPERADOR_SOPORTE` o `ADMINISTRADOR`.
- **Éxito:** `201 Created` con `{ "usuario": { … } }`.
- **Errores:** `400 DATOS_INVALIDOS`, `403 NO_AUTORIZADO`, `409 EMAIL_YA_REGISTRADO`.

### 5.2 Zonas, tarifas y reglas de multiplicador

Todas: **Propuesto — tarjeta E2 · RF-23 + RF-16**. Escribe solo el `ADMINISTRADOR`; el `OPERADOR_SOPORTE` puede leer para explicar un precio (`docs/modelo.md` §3).

#### `GET /zonas` y `GET /zonas/{id}`

- **Roles:** `OPERADOR_SOPORTE`, `ADMINISTRADOR`.
- **Parámetros de consulta:** `activa` (`true` o `false`, opcional).
- **Éxito:** `200 OK`

```json
{
  "zonas": [
    {
      "id": "e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a20",
      "nombre": "Microcentro",
      "criterio": { "tipo": "POLIGONO", "puntos": [{ "lat": -34.60, "lng": -58.38 }, "…"] },
      "activa": true,
      "creadaEn": "2026-11-15T12:00:00.000Z"
    }
  ]
}
```

El formato de `criterio` lo fija el ADR de búsqueda geográfica (ADR-0006).

#### `POST /zonas` y `PATCH /zonas/{id}`

- **Roles:** `ADMINISTRADOR`.
- **Cuerpo:** `{ "nombre", "criterio" }` al crear; `{ "nombre"?, "criterio"?, "activa"? }` al modificar. Las zonas no se borran: se desactivan.
- **Éxito:** `201 Created` o `200 OK` con `{ "zona": { … } }`.
- **Errores:** `400 DATOS_INVALIDOS`, `403 NO_AUTORIZADO`, `404 NO_ENCONTRADO`, `409 ZONAS_SUPERPUESTAS` (propuesto).

#### `GET /zonas/{id}/multiplicador`

- **Roles:** `OPERADOR_SOPORTE`, `ADMINISTRADOR`.
- **Descripción:** última medición de demanda de la zona y su multiplicador (`MultiplicadorDeZona`). Si el multiplicador se calcula al cotizar (ADR-0005, A1), devuelve el de la última cotización de la zona.
- **Éxito:** `200 OK`

```json
{
  "medicion": {
    "zonaId": "e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a20",
    "reglaVersion": 3,
    "solicitudes": 12,
    "choferesDisponibles": 8,
    "multiplicador": "1.25",
    "calculadoEn": "2026-11-20T18:30:00.000Z"
  }
}
```

#### Tarifas: `GET /tarifas`, `POST /tarifas`, `PATCH /tarifas/{id}`, `POST /tarifas/{id}/publicar`

- **Roles:** lectura `OPERADOR_SOPORTE` y `ADMINISTRADOR`; escritura `ADMINISTRADOR`.
- **Ciclo:** se crea un **borrador**, se edita y se **publica**. Una versión publicada no cambia nunca (I12); cambiarla es publicar otra.
- **Cuerpo de borrador:**

```json
{
  "baseCentavos": 100000,
  "porKmCentavos": 50000,
  "porMinutoCentavos": 2000,
  "precioMaximoCentavos": 1000000
}
```

- **Cuerpo de publicación:** `{ "vigenteDesde": "2026-12-01T00:00:00.000Z" }` (no puede ser anterior a `ahora`).
- **Éxito:** `201 Created` (borrador) o `200 OK`, con `{ "tarifa": { "id", "estado", "version", …, "vigenteDesde", "publicadaPorId", "publicadaEn", "creadaEn" } }`.
- **Errores:** `400 DATOS_INVALIDOS` (por ejemplo, `precioMaximoCentavos` menor que `baseCentavos`), `403 NO_AUTORIZADO`, `404 NO_ENCONTRADO`, `409 VERSION_YA_PUBLICADA` (propuesto).

#### Reglas: `GET /reglas-multiplicador`, `POST /reglas-multiplicador`, `PATCH /reglas-multiplicador/{id}`, `POST /reglas-multiplicador/{id}/publicar`

- **Roles y ciclo:** iguales a las tarifas.
- **Cuerpo de borrador:**

```json
{
  "formula": "LINEAL_POR_TRAMOS",
  "umbralInferior": "1.00",
  "umbralSuperior": "3.00",
  "multiplicadorMinimo": "1.00",
  "multiplicadorMaximo": "2.50",
  "escalaMultiplicador": 2
}
```

Los decimales viajan como texto. Reglas: `umbralSuperior` mayor que `umbralInferior`; `multiplicadorMinimo` mayor o igual que `"1.00"` y menor o igual que el máximo.

- **Cuerpo de publicación:** `{ "vigenteDesde": "…", "motivo": "Hora pico de diciembre" }`.
- **Errores:** los mismos que las tarifas.

### 5.3 Cotización y confirmación

Todas: **Propuesto — tarjeta E2 · RF-04 + RF-17 + RF-05 + RF-18 + RF-19**. Implementan ADR-0005.

#### `POST /cotizaciones`

- **Roles:** `PASAJERO`.
- **Descripción:** estima el viaje con el multiplicador de la zona del origen. El servidor calcula distancia, tiempo, zona, conteos, multiplicador y precio; el cuerpo **no acepta importes ni multiplicadores**. La cotización es inmutable (I11).
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

- **Errores:** `400 DATOS_INVALIDOS`, `403 NO_AUTORIZADO`, `422 FUERA_DE_COBERTURA`, `503 CONFIGURACION_INCOMPLETA` (propuesto), `429 DEMASIADAS_SOLICITUDES` (límite propio, §7.2).

#### `GET /cotizaciones/{id}`

- **Roles:** `PASAJERO` (propio), `OPERADOR_SOPORTE`, `ADMINISTRADOR`.
- **Éxito:** `200 OK` con `{ "cotizacion": { … } }`. El `estado` es el **efectivo**: una cotización vigente con `ahora ≥ venceEn` se devuelve como `VENCIDA`.
- **Errores:** `400`, `403 NO_AUTORIZADO`, `404 NO_ENCONTRADO`.

#### `POST /cotizaciones/{id}/confirmar`

- **Roles:** `PASAJERO`. Por recurso: solo el **dueño** de la cotización.
- **Cabeceras:** `Idempotency-Key` obligatoria (§3.2).
- **Descripción:** convierte la cotización vigente en un viaje `SOLICITADO`, en una sola transacción con escritura condicional (ADR-0005). `precioFijadoCentavos` y `multiplicadorFijado` se **copian de la cotización**: el pasajero paga exactamente el precio que vio, aunque la demanda haya cambiado. Dispara la búsqueda de choferes y las ofertas (E3).
- **Cuerpo:** vacío (`{}`). Cualquier campo, incluido `precio`, se rechaza.
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

- **Reintento con la misma clave y la misma cotización:** `200 OK` con `Idempotency-Replayed: true`.
- **Errores:**

| HTTP | Código | Causa |
|---:|---|---|
| 400 | `CLAVE_DE_IDEMPOTENCIA_REQUERIDA` | Falta la cabecera. |
| 400 | `DATOS_INVALIDOS` | Cuerpo con campos. |
| 403 | `NO_AUTORIZADO` | No es el dueño. |
| 404 | `NO_ENCONTRADO` | La cotización no existe. |
| 409 | `COTIZACION_YA_CONFIRMADA` | Ya generó un viaje (con otra clave). |
| 409 | `CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO` | La clave se usó para confirmar otra cotización. |
| 410 | `COTIZACION_VENCIDA` | `ahora ≥ venceEn`. |

Cuando exista, **reemplaza a `POST /viajes`** (§8, D1).

### 5.4 Vehículo y ubicación del chofer

Todas: **Propuesto — tarjeta E2 · RF-02 + RF-03**.

#### `GET /choferes/yo/vehiculo` y `PUT /choferes/yo/vehiculo`

- **Roles:** `CHOFER` (propio).
- **Cuerpo de `PUT`:**

```json
{
  "patente": "AB123CD",
  "marca": "Toyota",
  "modelo": "Etios",
  "anio": 2021,
  "color": "Gris"
}
```

`anio` y `color` son opcionales. La patente se normaliza a mayúsculas y es única.

- **Éxito:** `200 OK` con `{ "vehiculo": { "id", "choferId", "patente", "marca", "modelo", "anio", "color" } }`. `GET` sin vehículo responde `404 NO_ENCONTRADO`.
- **Errores:** `400 DATOS_INVALIDOS`, `403 NO_AUTORIZADO`, `409 PATENTE_YA_REGISTRADA` (propuesto).

#### `GET /choferes/{usuarioId}`

- **Roles:** `OPERADOR_SOPORTE`, `ADMINISTRADOR`.
- **Descripción:** perfil operativo y vehículo de cualquier chofer. El caso de uso `obtener-perfil-chofer.js` ya admite al administrador; falta la ruta.
- **Éxito:** `200 OK` con `{ "chofer": { … }, "vehiculo": { … } | null }`.

#### `PUT /choferes/yo/ubicacion`

- **Roles:** `CHOFER` (propio).
- **Descripción:** reemplaza la ubicación vigente. `actualizadaEn` la fija el servidor al recibirla. Si el chofer tiene un viaje activo, también agrega un punto histórico al recorrido (fase `ACERCAMIENTO` o `EN_CURSO`).
- **Cuerpo:** `{ "lat": -34.6037, "lng": -58.3816 }`.
- **Éxito:** `200 OK`

```json
{
  "ubicacion": {
    "punto": { "lat": -34.6037, "lng": -58.3816 },
    "actualizadaEn": "2026-11-20T18:32:05.000Z"
  }
}
```

- **Errores:** `400 DATOS_INVALIDOS`, `403 NO_AUTORIZADO`, `429 DEMASIADAS_SOLICITUDES` (límite propio, §7.2).

### 5.5 Ofertas y asignación

Todas: **Propuesto — tarjeta E3 · ofertas y asignación**. Reemplazan a `GET /viajes/disponibles` y `POST /viajes/{id}/aceptar` (§8, D2).

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
| `POST /viajes/{id}/finalizar` | `CHOFER` asignado | `EN_CURSO` → `FINALIZADO` | **Propuesto — tarjeta E4 · tarifa y cobro** |
| `POST /viajes/{id}/cancelar` (ampliado) | `PASAJERO` dueño, `CHOFER` asignado, `OPERADOR_SOPORTE` | Según el actor, ver abajo. | **Propuesto — tarjetas E3 (chofer) y E5 (soporte)** |

**`POST /viajes/{id}/finalizar`.** No recibe distancia, tiempo ni importes: el servidor calcula `distanciaRealM` con los puntos `EN_CURSO`, `tiempoRealS` y `tarifaFinalCentavos` (`docs/modelo.md` §7.3, opción A: nunca supera `precioFijadoCentavos`). En la misma transacción libera al chofer y crea el cobro en `PENDIENTE`.

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
    "estado": "PENDIENTE"
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

Todas: **Propuesto — tarjeta E4 · tarifa y cobro**.

#### `POST /viajes/{id}/cobro`

- **Roles:** `PASAJERO` dueño del viaje.
- **Cabeceras:** `Idempotency-Key` obligatoria.
- **Descripción:** ejecuta la simulación del cobro `PENDIENTE` creado al finalizar. No recibe importes: el monto es `tarifaFinalCentavos`. Reintentar no lo duplica ni lo ejecuta dos veces (I8).
- **Cuerpo:** vacío.
- **Éxito:** `200 OK`

```json
{
  "cobro": {
    "id": "b8c9d0e1-f2a3-4b4c-9d5e-6f7a8b9c0d50",
    "viajeId": "5d2e8f14-6a3b-4c7d-9e1f-2a3b4c5d6e10",
    "montoCentavos": 452000,
    "estado": "COBRADO",
    "creadoEn": "2026-11-20T18:54:00.000Z",
    "cobradoEn": "2026-11-20T18:54:30.000Z",
    "referencia": "SIM-000123"
  }
}
```

Si el cobro ya estaba `COBRADO`, devuelve el mismo cobro con `200 OK` (y `Idempotency-Replayed: true` si la clave es la misma).

- **Errores:** `400 CLAVE_DE_IDEMPOTENCIA_REQUERIDA`, `403 NO_AUTORIZADO`, `404 NO_ENCONTRADO` (viaje sin cobro), `409 TRANSICION_INVALIDA` (viaje no finalizado), `409 CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO`.

#### `GET /viajes/{id}/cobro`

- **Roles:** `PASAJERO` y `CHOFER` del viaje, `OPERADOR_SOPORTE`, `ADMINISTRADOR`.
- **Éxito:** `200 OK` con `{ "cobro": { … } }`.

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
      "finalizadoEn": "2026-11-02T14:10:00.000Z",
      "duracionS": 840,
      "tarifaFinalCentavos": 297500,
      "multiplicador": "1.25"
    }
  ]
}
```

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
| *`POST /usuarios`* | ✗ | ✗ | ✗ | ✓ | ✗ |
| *`GET /zonas`, `GET /zonas/{id}`, `GET /zonas/{id}/multiplicador`* | ✗ | ✗ | ✓ | ✓ | ✗ |
| *`POST /zonas`, `PATCH /zonas/{id}`* | ✗ | ✗ | ✗ | ✓ | ✗ |
| *`GET /tarifas`, `GET /reglas-multiplicador`* | ✗ | ✗ | ✓ | ✓ | ✗ |
| *`POST`, `PATCH` y `…/publicar` de tarifas y reglas* | ✗ | ✗ | ✗ | ✓ | ✗ |
| *`POST /cotizaciones`* | ✓ | ✗ | ✗ | ✗ | ✗ |
| *`GET /cotizaciones/{id}`* | propio | ✗ | ✓ | ✓ | ✗ |
| *`POST /cotizaciones/{id}/confirmar`* | propio | ✗ | ✗ | ✗ | ✗ |
| *`GET`, `PUT /choferes/yo/vehiculo`* | ✗ | propio | ✗ | ✗ | ✗ |
| *`GET /choferes/{usuarioId}`* | ✗ | ✗ | ✓ | ✓ | ✗ |
| *`PUT /choferes/yo/ubicacion`* | ✗ | propio | ✗ | ✗ | ✗ |
| *`GET /ofertas`* | ✗ | propio | ✗ | ✗ | ✗ |
| *`POST /ofertas/{id}/aceptar`, `…/rechazar`* | ✗ | propio (destinatario) | ✗ | ✗ | ✗ |
| *`POST /viajes/{id}/en-camino`, `…/iniciar`, `…/finalizar`* | ✗ | propio (asignado) | ✗ | ✗ | ✗ |
| *`POST /viajes/{id}/cancelar` (ampliado)* | propio | propio (asignado) | ✓ | ✗ | ✗ |
| *`GET /viajes/{id}/ubicacion`, `…/recorrido`* | propio (activo) | propio (asignado, activo) | ✗ | ✗ | ✗ |
| *Canal de tiempo real* | propio | propio | ✗ | ✗ | ✗ |
| *`POST /viajes/{id}/cobro`* | propio | ✗ | ✗ | ✗ | ✗ |
| *`GET /viajes/{id}/cobro`* | propio | propio | ✓ | ✓ | ✗ |
| *`GET /viajes` (historial)* | propio | propio | ✗ | ✓ | ✗ |
| *`GET /viajes/activos`* | ✗ | ✗ | ✓ | ✓ | ✗ |
| *`GET /integracion/zonas/{zonaId}/viajes-finalizados`* | ✗ | ✗ | ✗ | ✗ | ✓ |
| *`GET /reportes/zonas/{zonaId}`* | ✗ | ✗ | ✗ | ✓ | ✗ |

Notas sobre la tabla:

- Salud, registro y login son **públicos**: no exigen token. El registro siempre crea una cuenta nueva de `PASAJERO` o `CHOFER`, sin importar quién lo llame.
- En la columna «Servicio Python», ✗ significa que la credencial de servicio no es un JWT de usuario: en los endpoints autenticados se rechaza con `401 NO_AUTENTICADO`, y en registro y login no corresponde porque el servicio no tiene cuenta de usuario.
- «propio» en `PATCH /usuarios/{id}` incluye al administrador: puede ver cualquier cuenta, pero solo editar la suya.

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

- Ambos devuelven las cabeceras estándar `RateLimit` y `RateLimit-Policy` (borrador 7 del IETF), por ejemplo `RateLimit: limit=5, remaining=0, reset=897`, y `Retry-After` en el 429.
- El contador del login es **por IP, no por email**: los fallos con distintos emails desde la misma IP se suman, y al superarlo también se rechaza un login correcto desde esa IP hasta que vence la ventana.
- Los contadores viven **en memoria del proceso**: con varias instancias cada una cuenta por separado (ADR-0003).
- `trust proxy` está en `1`: detrás de un proxy, la IP es la del primer salto de `X-Forwarded-For`.

### 7.2 Límites propuestos para endpoints costosos

| Endpoint | Motivo | Propuesta | Tarjeta |
|---|---|---|---|
| `POST /auth/registro` | bcrypt con costo 12 es caro y permite crear cuentas en masa. | Límite por IP, por ejemplo 10 por hora. | E1 · RF-01 y base transversal |
| `POST /cotizaciones` | Cuenta solicitudes y choferes de la zona en cada llamada (ADR-0005, A1). | Límite por usuario, por ejemplo 30 por minuto. | E2 · cotizar y confirmar |
| `PUT /choferes/yo/ubicacion` | Alta frecuencia por diseño. | Límite por chofer, por ejemplo 1 por segundo, independiente del global. | E2 · RF-02 + RF-03 |
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
| D1 | El viaje se crea directo, sin cotización. | El viaje nace al **confirmar una cotización** y guarda `cotizacionId` y `multiplicadorFijado` (§4.10, §6.1; ADR-0005). | `POST /viajes` crea el viaje con una tarifa provisional por distancia, sin multiplicador, sin zona y sin tiempo estimado. No existen `cotizacionId` ni `multiplicadorFijado`. | E2 · RF-04 + RF-17 + RF-05 + RF-18 + RF-19 |
| D2 | No hay ofertas. | El viaje se **ofrece** a choferes elegibles y se acepta una oferta con vencimiento (§4.11, §6.2). | Cualquier chofer elegible ve todos los viajes `SOLICITADO` en `GET /viajes/disponibles` y acepta el viaje directamente. | E3 · ofertas y asignación |
| D3 | La elegibilidad no mira la ubicación. | Chofer elegible = habilitado, disponible, libre **y con ubicación vigente reciente** (§2, I5). | Solo verifica habilitado, disponible y libre; no existe la ubicación. | E2 · RF-02 + RF-03 |
| D4 | Habilitar no exige vehículo. | Habilitar exige un vehículo registrado (§6.4, Q11, propuesta). | `PATCH /choferes/{id}/habilitacion` habilita sin condición; no existe el vehículo. | E2 · RF-02 + RF-03 |
| D5 | Faltan estados del viaje. | `CHOFER_EN_CAMINO`, `EN_CURSO`, `FINALIZADO`, `CANCELADO_POR_CHOFER`, `CANCELADO_POR_SOPORTE` y `SIN_CHOFERES_DISPONIBLES` con sus transiciones (§6.1). | La entidad `Viaje` del dominio no tiene `CHOFER_EN_CAMINO` ni `EN_CURSO` (la migración `002_viajes.sql` sí los admite), y solo hay transiciones `SOLICITADO → ASIGNADO` y cancelación por pasajero. | E3 · ofertas y asignación, E4 · tarifa y cobro |
| D6 | El pasajero no puede cancelar con el chofer en camino. | El pasajero cancela en `SOLICITADO`, `ASIGNADO` y `CHOFER_EN_CAMINO` (§6.1). | `cancelarPorPasajero` solo admite `SOLICITADO` y `ASIGNADO` (consecuencia de D5). | E3 · ofertas y asignación |
| D7 | Faltan atributos del viaje. | `iniciadoEn`, `distanciaRealM`, `tiempoRealS`, `tarifaFinal` (§4.10). | No existen. | E4 · tarifa y cobro |
| D8 | Nombre del precio. | `precioFijado` (§4.10). | `precioFijadoCentavos`. Se propone adoptar el sufijo `Centavos` en todos los montos de la API (§1) y alinear el modelo. | E2 · cotizar y confirmar |
| D9 | Tarifa provisional distinta de la del modelo. | `Tarifa` versionada con `base`, `porKm`, `porMinuto` y `precioMaximo`; sin mínimo (§4.7, §7.2). | Variables de entorno `TARIFA_BASE_CENTAVOS`, `TARIFA_POR_KM_CENTAVOS`, `TARIFA_MINIMO_CENTAVOS` y `TARIFA_MAXIMO_CENTAVOS`; sin componente por minuto; con mínimo. | E2 · RF-23 + RF-16 |
| D10 | Soporte no ve usuarios. | El operador ve los datos básicos de los participantes de los viajes que atiende (§3). | `GET /usuarios/{id}` solo admite al propio usuario y al administrador; soporte recibe 403. | E5 · historial y soporte |
| D11 | Soporte y administrador no ven el perfil de chofer. | Ambos pueden ver el chofer y su vehículo (§3). | Solo existe `GET /choferes/yo`, limitado a `CHOFER`, aunque el caso de uso ya admite al administrador. Se propone `GET /choferes/{usuarioId}` (§5.4). | E2 · RF-02 + RF-03 |
| D12 | El chofer ve todos los viajes solicitados. | El chofer ve solo los viajes que se le **ofrecieron** o asignaron (§3). | `GET /viajes/disponibles` muestra cualquier viaje `SOLICITADO`, con el `pasajeroId`. Se resuelve con las ofertas (D2). | E3 · ofertas y asignación |
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
