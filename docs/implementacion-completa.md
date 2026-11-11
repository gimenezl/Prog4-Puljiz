# Implementación completa del backend — Bloques 1 a 6

Este documento consolida todo lo implementado en el backend de la plataforma de
viajes hasta el **11 de noviembre de 2026**, en la rama
`preparacion-de-entorno`.

El detalle específico de cada etapa también está disponible en:

- `docs/implementacion-bloque-1-y-3.md`: Docker, arranque y ciclo de vida.
- `docs/implementacion-bloque-5.md`: viajes, concurrencia e idempotencia.
- `docs/implementacion-bloque-6.md`: PostgreSQL real para tests.
- `docs/modelo.md`: modelo de dominio y diagramas.

---

## 1. Estado general

El proyecto es un backend de viajes estilo transporte urbano, desarrollado con:

- **Node.js 22 LTS** y **ESM estricto**.
- **Express 5**.
- **PostgreSQL 15**.
- **pnpm**.
- **Arquitectura hexagonal**.

Capacidades implementadas:

- Registro e inicio de sesión con JWT.
- Autorización por rol y por recurso, sin IDOR.
- Rate limit específico para login.
- Perfil operativo de chofer con habilitación y disponibilidad.
- Creación idempotente de viajes.
- Cálculo de precio en el servidor.
- Aceptación atómica de viajes.
- Cancelación con liberación del chofer.
- Concurrencia segura sobre PostgreSQL mediante `SELECT ... FOR UPDATE`.
- Suite de tests unitarios, de arquitectura, de integración con adaptadores en
  memoria y de integración contra PostgreSQL real.
- Base PostgreSQL efímera y aislada para tests.
- Documentación de endpoints, configuración, decisiones y comandos.

Commits principales de la rama:

```text
83eb30b chore: preparar estructura hexagonal y entorno del backend
5ac837c feat: implementar backend de viajes con auth, persistencia y concurrencia
```

El Bloque 6 se incorpora en el commit siguiente a `5ac837c`.

---

## 2. Arquitectura

### 2.1 Capas

```text
src/
├── domain/                 # Entidades, value objects, reglas puras y errores
├── application/
│   ├── use-cases/          # Casos de uso
│   ├── services/           # Servicios de aplicación (idempotencia)
│   └── ports/
│       ├── in/             # Contratos de entrada
│       └── out/            # Contratos de salida
├── infrastructure/
│   ├── adapters/
│   │   ├── in/http/        # Adaptador de entrada Express
│   │   └── out/            # Adaptadores reales y falsos
│   ├── config/             # Validación de entorno con Zod
│   ├── context/            # AsyncLocalStorage y correlation ID
│   ├── health/             # Readiness con timeout por dependencia
│   ├── lifecycle/          # Arranque HTTP y cierre ordenado
│   └── logging/            # Logger JSON y serialización de errores
├── composition-root.js     # Único punto que crea e inyecta adaptadores
└── main.js                 # Punto de entrada del proceso
```

### 2.2 Reglas de dependencia

- El dominio no importa Express, PostgreSQL, Pino, dotenv ni ninguna capa
  externa.
- La aplicación no importa frameworks, drivers ni adaptadores concretos.
- Solo `src/composition-root.js` importa adaptadores de salida.
- Esas reglas se verifican automáticamente en
  `tests/architecture/boundaries.test.js`.

### 2.3 Selección de adaptadores

`ADAPTERS_MODE` decide el juego de adaptadores:

- `real`: PostgreSQL, bcrypt, JWT, reloj del sistema y UUID.
- `fake`: repositorios en memoria, hasher en memoria, tokens en memoria, reloj
  fijo y generador de IDs incremental.

El composition root es el único lugar que lee esa variable.

### 2.4 Entorno

`src/infrastructure/config/env.js` valida las variables con Zod antes de crear
adaptadores. Si falta una variable obligatoria, el proceso no arranca.

En modo real son obligatorias:

- `DATABASE_URL`.
- `JWT_SECRET` con al menos 32 caracteres.

También se validan:

- Puerto, timeouts y tamaño del body.
- Costo de bcrypt.
- Tarifas y TTL de idempotencia.
- Orígenes CORS.
- Límites de rate limit.
- Coherencia entre tarifa mínima y máxima.

### 2.5 Ciclo de vida

- `GET /health`: liveness. No consulta dependencias externas.
- `GET /ready`: readiness. Comprueba PostgreSQL, usuarios, choferes, viajes,
  idempotencia y reloj, con timeout por chequeo.
- `SIGTERM` y `SIGINT`: el servidor deja de aceptar conexiones, espera las
  solicitudes en curso y cierra la pool de PostgreSQL.
- Si el cierre supera `SHUTDOWN_TIMEOUT_MS`, el proceso termina con código 1.

### 2.6 Logs y correlación

- Logs estructurados en JSON con Pino.
- `AsyncLocalStorage` propaga el correlation ID sin pasarlo por parámetro.
- Se aceptan `x-request-id` o `x-correlation-id`; si faltan o son inválidos, se
  genera un UUID.
- El ID se devuelve en `x-request-id`, en el cuerpo de los errores y en los logs.
- El cuerpo crudo de las solicitudes no se registra.

### 2.7 Manejo de errores

- `ErrorDeDominio` tiene un código lógico y un mensaje seguro.
- `src/infrastructure/adapters/in/http/error-mapping.js` traduce el código a
  HTTP (400, 403, 404, 409, 410, 422).
- Un código desconocido se trata como error interno.
- Los errores 500 nunca exponen mensaje, stack ni detalles internos.
- JSON inválido, cuerpo demasiado grande y codificación no soportada tienen
  respuestas seguras y códigos propios.

---

## 3. Seguridad y cuentas

### 3.1 Registro

- Solo permite auto-registro como `PASAJERO` o `CHOFER`.
- Normaliza el email.
- Valida la política de contraseñas antes de persistir.
- Hashea la contraseña con bcrypt; nunca guarda texto plano.
- Si el rol es `CHOFER`, crea el perfil operativo en la misma transacción.
- El perfil nace `habilitado=false`, `disponible=false` y `viajeActivoId=null`.

### 3.2 Login

- Compara la contraseña con el hash bcrypt.
- Emite un JWT HS256 con `usuarioId` y `rol`.
- Email inexistente y contraseña incorrecta devuelven el mismo `401`.
- Tiene un rate limit independiente del límite global.
- Los logins exitosos no consumen cuota.

### 3.3 Autorización

- La autorización por recurso vive en los casos de uso.
- Un usuario autenticado no puede leer ni editar cuentas ajenas.
- Un administrador puede leer cuentas ajenas, pero no editarlas.
- Un viaje solo lo pueden ver el pasajero, el chofer asignado, un administrador
  o un operador de soporte.
- Solo el pasajero dueño puede cancelar.
- Solo el propio chofer puede cambiar su disponibilidad.
- Solo un administrador puede habilitar o inhabilitar choferes.

### 3.4 Validación HTTP

Los esquemas Zod son estrictos:

- Rechazan campos no declarados.
- Rechazan roles privilegiados en el auto-registro.
- Rechazan importes enviados por el cliente.
- Validan coordenadas y motivos de cancelación.

---

## 4. Dominio

### 4.1 `Usuario`

Archivo: `src/domain/entities/usuario.js`

- ID, email, nombre, credencial y rol.
- La credencial es siempre un hash.
- Normaliza email y nombre.
- `aVistaPublica()` nunca incluye la credencial.
- `conNombre()` devuelve una copia sin mutar la instancia.

Roles:

- `PASAJERO`
- `CHOFER`
- `OPERADOR_SOPORTE`
- `ADMINISTRADOR`

### 4.2 `Chofer`

Archivo: `src/domain/entities/chofer.js`

Perfil operativo de un usuario con rol `CHOFER`.

Atributos:

- `usuarioId`: clave primaria y referencia al usuario.
- `habilitado`: lo decide un administrador.
- `disponible`: lo declara el chofer.
- `viajeActivoId`: única fuente de verdad sobre si está ocupado.

Estados derivados:

- `INHABILITADO`.
- `NO_DISPONIBLE`.
- `DISPONIBLE`.
- `OCUPADO`.

Reglas:

- Un chofer no habilitado no puede declararse disponible.
- `estaElegible()` exige habilitado, disponible y libre.
- `ocupar(viajeId)` falla con `CHOFER_OCUPADO` si ya tiene un viaje activo.
- `liberar(viajeId)` solo libera el viaje correcto.
- `conHabilitacion(false)` fuerza `disponible=false` y conserva el viaje activo.

### 4.3 `Viaje`

Archivo: `src/domain/entities/viaje.js`

Entidad inmutable: cada transición devuelve una copia.

Estados:

- `SOLICITADO`
- `ASIGNADO`
- `CHOFER_EN_CAMINO`
- `EN_CURSO`
- `FINALIZADO`
- `CANCELADO_POR_PASAJERO`
- `CANCELADO_POR_CHOFER`
- `CANCELADO_POR_SOPORTE`
- `SIN_CHOFERES_DISPONIBLES`

Reglas:

- `SOLICITADO` no tiene chofer.
- `ASIGNADO` sí tiene chofer.
- `asignar()` solo funciona desde `SOLICITADO`.
- `cancelarPorPasajero()` exige motivo y no reabre un viaje terminal.
- `esParticipante()` autoriza al pasajero y al chofer asignado.
- `aVistaPublica()` devuelve fechas ISO y puntos serializables.

### 4.4 `PuntoGeografico`

Archivo: `src/domain/value-objects/punto-geografico.js`

- Valida latitud entre `-90` y `90`.
- Valida longitud entre `-180` y `180`.
- Solo acepta números finitos.
- Calcula distancias en metros con Haversine.
- `aJSON()` devuelve `{ lat, lng }`.

### 4.5 Precio base

Archivo: `src/domain/services/precio-base.js`

```text
precio = base + (distanciaKm × precioPorKm)
```

Luego aplica mínimo y máximo. Siempre devuelve un entero no negativo. El cliente
nunca envía importes.

---

## 5. Aplicación

### 5.1 Idempotencia

Archivo: `src/application/services/idempotencia.js`

- `canonicalizar(valor)` ordena claves recursivamente.
- `huellaContenido(valor)` calcula SHA-256 del JSON canónico.

Dos cuerpos equivalentes producen la misma huella aunque cambie el orden de las
propiedades.

### 5.2 Crear viaje

Archivo: `src/application/use-cases/viajes/crear-viaje.js`

Alcance de la clave:

```text
viaje:crear:<pasajeroId>
```

Flujo:

1. Exige `Idempotency-Key` no vacía.
2. Valida origen y destino.
3. Calcula distancia y precio en el servidor.
4. Dentro de una transacción:
   - Busca la clave.
   - Si existe y no venció, compara la huella.
   - Misma huella: devuelve la respuesta original.
   - Otra huella: `CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO`.
   - Clave vencida: la elimina y continúa.
   - Crea el viaje y registra la clave.
   - Si otra transacción ganó la carrera, revierte y devuelve la respuesta
     ganadora.

Resultados HTTP:

| Caso | HTTP | Resultado |
|---|---:|---|
| Primera creación | `201` | Viaje creado. |
| Mismo cuerpo y misma clave | `200` | Viaje original + `Idempotency-Replayed: true`. |
| Misma clave con otro cuerpo | `409` | `CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO`. |
| Falta la cabecera | `400` | `CLAVE_DE_IDEMPOTENCIA_REQUERIDA`. |
| Clave vencida | `201` | Viaje nuevo. |

### 5.3 Aceptar viaje

Archivo: `src/application/use-cases/viajes/aceptar-viaje.js`

Orden global de bloqueo: **Viaje → Chofer**.

Dentro de una transacción:

1. Bloquea el viaje.
2. Verifica que siga `SOLICITADO`.
3. Bloquea al chofer.
4. Verifica que esté habilitado, disponible y libre.
5. Asigna el viaje.
6. Marca al chofer como ocupado.
7. Persiste ambas entidades.

Errores:

- `VIAJE_NO_DISPONIBLE`.
- `CHOFER_NO_ELEGIBLE`.
- `CHOFER_OCUPADO`.

### 5.4 Cancelar viaje

Archivo: `src/application/use-cases/viajes/cancelar-viaje.js`

Dentro de una transacción:

1. Bloquea el viaje.
2. Verifica que exista.
3. Verifica que el solicitante sea el pasajero dueño.
4. Cancela el viaje.
5. Si había chofer, bloquea su perfil y lo libera.
6. Persiste ambos cambios.

Si compite con una aceptación, el viaje termina cancelado y ningún chofer queda
ocupado.

### 5.5 Otros casos de uso

- `obtener-viaje.js`.
- `listar-viajes-disponibles.js`.
- `obtener-perfil-chofer.js`.
- `actualizar-disponibilidad-chofer.js`.
- `habilitar-chofer.js`.
- `registrar-usuario.js`.
- `iniciar-sesion.js`.
- `obtener-perfil-usuario.js`.
- `actualizar-perfil-usuario.js`.

---

## 6. Persistencia y transacciones

### 6.1 Puertos

- `repositorio-usuarios.js`.
- `repositorio-choferes.js`.
- `repositorio-viajes.js`.
- `repositorio-claves-idempotencia.js`.
- `unidad-de-trabajo.js`.
- `base-de-datos.js`.
- `generador-de-ids.js`.
- `servicio-de-hash.js`.
- `servicio-de-tokens.js`.

Los métodos de escritura y lectura transaccional aceptan un `ejecutor` opcional:
un contexto opaco que la unidad de trabajo pasa a los repositorios para que
participen de la misma transacción.

### 6.2 PostgreSQL

Adaptadores:

- `postgres-user-repository.js`.
- `postgres-chofer-repository.js`.
- `postgres-viaje-repository.js`.
- `postgres-idempotency-repository.js`.
- `postgres-unit-of-work.js`.

Puntos clave:

- `buscarPorIdParaActualizar` y `buscarPorUsuarioIdParaActualizar` usan
  `SELECT ... FOR UPDATE`.
- `PostgresDatabase.transaccion()` ejecuta `BEGIN`, `COMMIT` y `ROLLBACK`.
- Libera siempre la conexión.
- Reintenta errores de serialización (`40001`) e interbloqueo (`40P01`) hasta
  dos veces.
- `PostgresIdempotencyRepository.crear` usa `ON CONFLICT DO NOTHING` para no
  abortar la transacción.

### 6.3 Memoria

Adaptadores:

- `in-memory-user-repository.js`.
- `in-memory-chofer-repository.js`.
- `in-memory-viaje-repository.js`.
- `in-memory-idempotency-repository.js`.
- `in-memory-unit-of-work.js`.

`InMemoryUnitOfWork`:

- Serializa operaciones con una cola.
- Toma una instantánea de los repositorios participantes.
- Restaura la instantánea completa si la operación falla.

Así los tests de concurrencia reproducen atomicidad sin PostgreSQL.

### 6.4 Migraciones

Archivo `db/migrations/001_usuarios.sql`:

- Tabla `usuarios`.
- Unicidad de email sin distinguir mayúsculas.

Archivo `db/migrations/002_viajes.sql`:

- Tabla `viajes` con checks de coordenadas, distancia, precio, estado y
  coherencia entre estado y chofer.
- Índice único parcial `viajes_chofer_activo_idx` para impedir dos viajes
  activos por chofer.
- Tabla `choferes` con `habilitado`, `disponible`, `viaje_activo_id` y check
  `NOT disponible OR habilitado`.
- Tabla `claves_idempotencia` con clave primaria compuesta
  `(alcance, clave)`.
- Índice de vencimiento de claves.

Las migraciones son idempotentes y se aplican en orden alfabético mediante
`aplicarMigraciones` de `scripts/migrate.js`.

---

## 7. API HTTP

### 7.1 Endpoints

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `POST` | `/auth/registro` | Público | Registrar `PASAJERO` o `CHOFER`. |
| `POST` | `/auth/login` | Público con rate limit | Iniciar sesión. |
| `GET` | `/auth/yo` | Token Bearer | Ver el perfil propio. |
| `GET` | `/usuarios/:id` | Propietario o administrador | Ver una cuenta. |
| `PATCH` | `/usuarios/:id` | Solo propietario | Actualizar el nombre. |
| `POST` | `/viajes` | `PASAJERO` + `Idempotency-Key` | Crear un viaje. |
| `GET` | `/viajes/disponibles` | `CHOFER` elegible | Listar viajes solicitados. |
| `GET` | `/viajes/:id` | Participantes, admin u operador | Consultar un viaje. |
| `POST` | `/viajes/:id/aceptar` | `CHOFER` elegible | Aceptar un viaje. |
| `POST` | `/viajes/:id/cancelar` | `PASAJERO` dueño | Cancelar un viaje. |
| `GET` | `/choferes/yo` | `CHOFER` | Ver el perfil operativo. |
| `PATCH` | `/choferes/yo` | `CHOFER` | Cambiar disponibilidad. |
| `PATCH` | `/choferes/:usuarioId/habilitacion` | `ADMINISTRADOR` | Habilitar o inhabilitar. |
| `GET` | `/health` | Público | Liveness. |
| `GET` | `/ready` | Público | Readiness. |

### 7.2 Errores principales

| Código | HTTP | Situación |
|---|---:|---|
| `DATOS_INVALIDOS` | `400` | Validación de entrada. |
| `CLAVE_DE_IDEMPOTENCIA_REQUERIDA` | `400` | Falta la cabecera. |
| `NO_AUTENTICADO` | `401` | Token ausente o inválido. |
| `NO_AUTORIZADO` | `403` | Sin permiso sobre el recurso. |
| `NO_ENCONTRADO` | `404` | Recurso inexistente. |
| `EMAIL_YA_REGISTRADO` | `409` | Email duplicado. |
| `CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO` | `409` | Misma clave, otro cuerpo. |
| `VIAJE_NO_DISPONIBLE` | `409` | Viaje ya aceptado o cancelado. |
| `CHOFER_NO_ELEGIBLE` | `409` | Chofer inexistente, inhabilitado o no disponible. |
| `CHOFER_OCUPADO` | `409` | Chofer con otro viaje activo. |
| `TRANSICION_INVALIDA` | `409` | Transición de estado no permitida. |

---

## 8. Configuración

Variables principales:

| Variable | Default | Descripción |
|---|---:|---|
| `NODE_ENV` | `development` | Entorno. |
| `HOST` | `0.0.0.0` | Host HTTP. |
| `PORT` | `3000` | Puerto HTTP. |
| `ADAPTERS_MODE` | `real` | `real` o `fake`. |
| `DATABASE_URL` | — | Obligatoria en modo real. |
| `DATABASE_SSL` | `false` | SSL de PostgreSQL. |
| `DATABASE_POOL_MAX` | `10` | Tamaño de la pool. |
| `JWT_SECRET` | — | Obligatorio en modo real, mínimo 32 caracteres. |
| `JWT_EXPIRES_IN_MINUTES` | `60` | Vida del token. |
| `PASSWORD_HASH_COST` | `12` | Costo de bcrypt. |
| `LOGIN_RATE_LIMIT_WINDOW_MS` | `900000` | Ventana del rate limit de login. |
| `LOGIN_RATE_LIMIT_MAX` | `5` | Intentos fallidos permitidos. |
| `TARIFA_BASE_CENTAVOS` | `100000` | Base del precio. |
| `TARIFA_POR_KM_CENTAVOS` | `50000` | Precio por kilómetro. |
| `TARIFA_MINIMO_CENTAVOS` | `150000` | Precio mínimo. |
| `TARIFA_MAXIMO_CENTAVOS` | `1000000` | Precio máximo. |
| `IDEMPOTENCIA_TTL_MS` | `86400000` | Vigencia de claves (24 h). |
| `READINESS_TIMEOUT_MS` | `3000` | Timeout por chequeo de readiness. |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Timeout de cierre ordenado. |
| `CORS_ORIGIN` | `*` | Orígenes permitidos. |
| `BODY_LIMIT` | `100kb` | Tamaño máximo del body. |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Ventana del límite global. |
| `RATE_LIMIT_MAX` | `300` | Solicitudes por ventana. |
| `POSTGRES_TEST_PORT` | `5433` | Puerto de la base de test. |
| `TEST_DATABASE_URL` | — | Base externa opcional para tests. |

El archivo `.env.example` contiene todos los valores de ejemplo.

---

## 9. Pruebas

### 9.1 Tests unitarios y de arquitectura

- Dominio: usuario, chofer, viaje, precio, punto geográfico, contraseña y email.
- Aplicación: autenticación, autorización por perfil, choferes, idempotencia,
  crear, aceptar y cancelar viajes.
- Infraestructura: entorno, request ID, readiness, mapeo de errores, logs,
  repositorios en memoria, bcrypt y JWT.
- Arquitectura: reglas de dependencia entre capas y ESM estricto.

### 9.2 Tests de integración con adaptadores falsos

- Autenticación completa por HTTP.
- Composition root con `ADAPTERS_MODE=fake`.
- Manejo de errores y JSON inválido.
- `/health` y `/ready`.
- Cierre ordenado con `SIGTERM`.
- Flujo completo de viajes.
- Dos choferes aceptando a la vez.
- Dos creaciones simultáneas con la misma clave.

### 9.3 Tests contra PostgreSQL real

El Bloque 6 agrega:

- `compose.test.yaml`: PostgreSQL 15 efímero en `127.0.0.1:5433`, con `tmpfs`.
- `scripts/test-database.js`: levanta, espera, migra, ejecuta y baja la base.
- `tests/helpers/postgres-kit.js`: grafo real de adaptadores y datos de prueba.
- `tests/integration/postgres/postgres.test.js`: 10 tests contra el motor real.

Casos:

- Migraciones idempotentes y esquema esperado.
- Round-trip de usuarios, choferes, viajes y claves.
- Restricciones `CHECK`, claves foráneas, índice único parcial y email
  duplicado.
- Bloqueo real con `SELECT ... FOR UPDATE`.
- Rollback real de la unidad de trabajo.
- 20 aceptaciones concurrentes: exactamente un ganador.
- Un chofer aceptando dos viajes: uno recibe `CHOFER_OCUPADO`.
- Idempotencia concurrente, conflicto de contenido y vencimiento.
- Aceptación y cancelación simultáneas.
- Flujo HTTP completo sobre PostgreSQL, incluido `/ready`.

### 9.4 Resultados verificados

```text
pnpm test
132 tests
132 pass
0 fail
```

```text
pnpm test:integration:db
10 tests
10 pass
0 fail
```

```text
pnpm test:db:up
TEST_DATABASE_URL=postgresql://admin:password@127.0.0.1:5433/proy_db_test \
  pnpm test:integration
pnpm test:db:down

39 tests
39 pass
0 fail
```

También pasan:

```text
pnpm lint
pnpm format
pnpm format:check
```

### 9.5 Verificación manual contra PostgreSQL real

Además de la suite automatizada, se verificó el flujo completo contra el
contenedor `prog4-puljiz-db`:

1. `/ready` con todos los chequeos en verde.
2. Registro y login de pasajero, dos choferes y administrador.
3. Perfil de chofer, habilitación y disponibilidad.
4. Creación idempotente, replay y conflicto de contenido.
5. Dos creaciones simultáneas con la misma clave → un solo viaje.
6. Dos aceptaciones simultáneas → exactamente un ganador.
7. Un chofer aceptando dos viajes a la vez → uno rechazado.
8. Cancelación liberando al chofer.
9. Cierre ordenado con `SIGTERM`.

---

## 10. Comandos

```bash
pnpm dev                 # Servidor con recarga automática
pnpm start               # Servidor en modo normal
pnpm test                # Tests de arquitectura, integración y configuración
pnpm test:unit           # Solo tests unitarios
pnpm test:integration    # Integración y límites de arquitectura
pnpm test:integration:db # PostgreSQL real efímero: levanta, migra, prueba y baja
pnpm test:db:up          # Prepara la base de test
pnpm test:db:down        # Baja y borra la base de test
pnpm lint                # Análisis estático
pnpm format              # Formateo con Prettier
pnpm format:check        # Verifica el formato
pnpm db:prepare          # Levanta PostgreSQL y aplica migraciones
pnpm db:seed             # Carga usuarios y choferes de prueba
pnpm db:up               # Levanta PostgreSQL y espera su healthcheck
pnpm db:migrate          # Aplica migraciones
pnpm db:down             # Detiene los contenedores
pnpm docker:up           # Construye y levanta app + PostgreSQL
pnpm docker:down         # Baja los contenedores
pnpm docker:logs         # Sigue los logs de la aplicación
```

---

## 11. Archivos principales

### Dominio

- `src/domain/entities/usuario.js`
- `src/domain/entities/chofer.js`
- `src/domain/entities/viaje.js`
- `src/domain/value-objects/punto-geografico.js`
- `src/domain/value-objects/contrasena.js`
- `src/domain/value-objects/email.js`
- `src/domain/services/precio-base.js`
- `src/domain/errors/error-de-dominio.js`

### Aplicación

- `src/application/services/idempotencia.js`
- `src/application/use-cases/auth/`
- `src/application/use-cases/choferes/`
- `src/application/use-cases/viajes/`
- `src/application/ports/out/`

### Infraestructura

- `src/infrastructure/adapters/in/http/`
- `src/infrastructure/adapters/out/persistence/`
- `src/infrastructure/adapters/out/security/`
- `src/infrastructure/adapters/out/clock/`
- `src/infrastructure/adapters/out/ids/`
- `src/infrastructure/config/env.js`
- `src/infrastructure/context/`
- `src/infrastructure/health/`
- `src/infrastructure/lifecycle/`
- `src/infrastructure/logging/`
- `src/composition-root.js`
- `src/main.js`

### Base de datos y scripts

- `db/migrations/001_usuarios.sql`
- `db/migrations/002_viajes.sql`
- `scripts/migrate.js`
- `scripts/seed.js`
- `scripts/test-database.js`
- `Dockerfile`
- `.dockerignore`
- `compose.yaml`
- `compose.test.yaml`

### Tests

- `tests/unit/`
- `tests/integration/`
- `tests/integration/postgres/`
- `tests/architecture/`
- `tests/helpers/`

### Documentación

- `README.md`
- `db/README.md`
- `docs/modelo.md`
- `docs/implementacion-bloque-1-y-3.md`
- `docs/implementacion-bloque-5.md`
- `docs/implementacion-bloque-6.md`
- `docs/implementacion-completa.md`

---

## 12. Decisiones de diseño destacadas

- **Dominio puro:** no conoce HTTP, PostgreSQL ni librerías externas.
- **Puertos y adaptadores:** cada dependencia externa tiene implementación real
  y falsa o en memoria.
- **Composition root único:** centraliza la selección de adaptadores.
- **Precio en el servidor:** el cliente nunca puede fijar importes.
- **Idempotencia transaccional:** el viaje y la clave se guardan juntos.
- **Bloqueo ordenado:** siempre Viaje → Chofer para aceptar y cancelar.
- **Doble defensa de concurrencia:** locks en aplicación y restricciones en la
  base, incluido el índice único parcial de viaje activo.
- **Reintentos acotados:** solo para errores de serialización e interbloqueo.
- **Base de test aislada:** proyecto Compose, contenedor y puerto propios.
- **Datos efímeros:** `tmpfs` para no dejar residuos.
- **Tests reales:** la suite contra PostgreSQL usa los mismos adaptadores que
  producción.

---

## 13. Trabajo pendiente

- Flujo de ofertas con vencimiento y aceptación exclusiva.
- Tarifa dinámica por demanda y cotizaciones.
- Seguimiento del viaje en tiempo real.
- Finalización del viaje y cobro simulado.
- Historial de viajes y herramientas de soporte.
- Pruebas de carga y mediciones de latencia.
- Integración continua con el `compose.test.yaml`.
