# TP Programación IV — Plataforma de viajes

Trabajo práctico final de **Programación IV** de la **Universidad Tecnológica Nacional (UTN)**.

## De qué se trata

Backend de una plataforma de viajes estilo transporte urbano, desarrollado en **Node.js con Express**. Corresponde a la sección 6 del enunciado, con la variante de **precio dinámico**: el precio de cada viaje se ajusta con un multiplicador según la demanda de la zona.

La plataforma permite:

- Registro e inicio de sesión de pasajeros, choferes, administradores y operadores de soporte, con permisos por rol.
- Multiplicador por demanda en cada zona, calculado en el servidor con una regla configurable y auditable.
- Estimación de precio y tiempo antes de confirmar; el pasajero paga exactamente el precio que vio, aunque la demanda cambie después.
- Solicitud de viajes y búsqueda de choferes cercanos.
- Ofertas con vencimiento, aceptación exclusiva y cancelaciones resueltas correctamente aunque ocurran al mismo tiempo.
- Seguimiento del viaje en tiempo real, tarifa final y cobro simulado.
- Historial de viajes y operador de soporte.

## Organización

Todas las tareas, ordenadas por etapa y con sus dependencias, están en el tablero de Trello:

https://trello.com/b/88WLBizE/prog4-tp-puljizzz

## Integrantes — Grupo 7

- Lucas Gimenez
- Guido Ayala
- Enzo Vernet

## Stack

- Node.js 22 LTS con ESM estricto (`import` / `export`, sin CommonJS).
- Express 5.
- PostgreSQL 15.
- pnpm.
- Arquitectura hexagonal (dominio, aplicación con puertos y adaptadores, infraestructura).

## Estructura

```text
src/
├── domain/                 # Entidades, objetos de valor, reglas puras y errores
├── application/
│   ├── use-cases/          # Casos de uso
│   └── ports/
│       ├── in/             # Contratos de entrada
│       └── out/            # Contratos de salida (reloj, repositorios, mapas, pagos…)
├── infrastructure/
│   ├── adapters/
│   │   ├── in/http/        # Adaptador de entrada Express
│   │   └── out/            # Adaptadores reales y falsos (PostgreSQL, reloj…)
│   ├── config/             # Validación de variables de entorno
│   ├── health/             # Readiness con timeout por dependencia
│   ├── lifecycle/          # Arranque HTTP y cierre ordenado
│   └── logging/            # Logger estructurado
├── composition-root.js     # Único punto que crea e inyecta adaptadores
└── main.js                 # Punto de entrada del proceso
```

El dominio no importa Express, el driver de PostgreSQL ni ninguna librería de
infraestructura. Esa regla se verifica en `tests/architecture/boundaries.test.js`.
Cada dependencia externa entra por un puerto con un adaptador real y uno falso o
en memoria. El adaptador se elige con `ADAPTERS_MODE` (`real` o `fake`) y el
único archivo que lo decide es `src/composition-root.js`.

El arranque valida el entorno con Zod antes de crear adaptadores. El apagado
escucha `SIGTERM` y `SIGINT`, deja de aceptar conexiones, espera las solicitudes
en curso y cierra la pool de PostgreSQL. Si el cierre supera
`SHUTDOWN_TIMEOUT_MS`, el proceso termina con código 1.

## Puesta en marcha

Requisitos: Node.js 22 LTS, pnpm y Docker.

```bash
cp .env.example .env
pnpm install
pnpm db:up
pnpm db:migrate
pnpm dev
```

El servidor queda disponible en `http://localhost:3000`.

- `GET /health`: liveness. No consulta dependencias externas.
- `GET /ready`: readiness. Comprueba PostgreSQL y el reloj con timeout.

Para ejecutar sin base de datos, usar `ADAPTERS_MODE=fake` en `.env`.

## Errores y correlación

Todas las respuestas de error tienen la misma forma:

```json
{
  "error": { "codigo": "OFERTA_VENCIDA", "mensaje": "La oferta ya venció." },
  "requestId": "8f14e45f-ea3c-4b1d-9c2a-1b2c3d4e5f60"
}
```

- Los `ErrorDeDominio` se traducen a HTTP en
  `src/infrastructure/adapters/in/http/error-mapping.js` (400, 403, 404, 409,
  410 y 422). Un código sin mapeo se trata como error interno.
- Los errores 500 nunca exponen mensaje, stack ni detalles internos.
- Los errores técnicos conocidos (JSON inválido, cuerpo demasiado grande,
  codificación no soportada) tienen mensajes seguros y códigos propios.
- `x-request-id` o `x-correlation-id` se aceptan como ID de correlación. Si
  faltan o son inválidos, se genera un UUID. El ID se devuelve en el header
  `x-request-id`, en el cuerpo del error y en todos los logs de la solicitud.
- `AsyncLocalStorage` propaga el ID sin pasarlo como parámetro por cada capa.
- El cuerpo crudo de una solicitud nunca se escribe en los logs.

## Autenticación y seguridad

Endpoints:

| Método | Ruta | Acceso |
|---|---|---|
| `POST` | `/auth/registro` | Público. Solo roles `PASAJERO` y `CHOFER` |
| `POST` | `/auth/login` | Público, con rate limit específico |
| `GET` | `/auth/yo` | Token Bearer |
| `GET` | `/usuarios/:id` | Propietario o `ADMINISTRADOR` |
| `PATCH` | `/usuarios/:id` | Solo propietario; únicamente `nombre` |
| `POST` | `/viajes` | `PASAJERO`, con `Idempotency-Key` |
| `GET` | `/viajes/disponibles` | `CHOFER` habilitado y disponible |
| `GET` | `/viajes/:id` | Participantes, `ADMINISTRADOR` u `OPERADOR_SOPORTE` |
| `POST` | `/viajes/:id/aceptar` | `CHOFER` habilitado y disponible |
| `POST` | `/viajes/:id/cancelar` | `PASAJERO` dueño del viaje |
| `GET` | `/choferes/yo` | `CHOFER` |
| `PATCH` | `/choferes/yo` | `CHOFER`; únicamente `disponible` |
| `PATCH` | `/choferes/:usuarioId/habilitacion` | `ADMINISTRADOR` |

- Las contraseñas se almacenan con **bcrypt** (`PASSWORD_HASH_COST`, por defecto
  12). Nunca se guardan, devuelven ni registran en texto plano.
- El login usa JWT firmado con HS256 (`JWT_SECRET`, `JWT_EXPIRES_IN_MINUTES`) y
  se envía como `Authorization: Bearer <token>`.
- Email inexistente y contraseña incorrecta devuelven el mismo `401` para no
  revelar qué cuentas existen.
- Los cuerpos se validan con Zod en modo estricto: cualquier campo no declarado
  se rechaza con `400 DATOS_INVALIDOS`. Esto impide enviar `rol`, `credencial`,
  `id` o `creadoEn` para escalar privilegios.
- La autorización por recurso vive en los casos de uso, no en el controlador.
  Un usuario autenticado que intenta leer o editar una cuenta ajena recibe
  `403`; un recurso inexistente recibe `404`.
- El login tiene un límite independiente (`LOGIN_RATE_LIMIT_MAX` intentos
  fallidos por `LOGIN_RATE_LIMIT_WINDOW_MS`). Los logins exitosos no consumen
  cuota.
- Las migraciones SQL están en `db/migrations` y se aplican con `pnpm db:migrate`.

## Viajes, concurrencia e idempotencia

- Al registrarse un `CHOFER` se crea su perfil operativo en la **misma
  transacción** que el usuario. Nace `habilitado=false` y `disponible=false`;
  un administrador lo habilita y después el chofer declara disponibilidad.
- `POST /viajes` exige la cabecera `Idempotency-Key`. La clave se guarda junto
  con el viaje, el hash SHA-256 del cuerpo canónico y la respuesta original.
  - Misma clave y mismo cuerpo: devuelve el viaje original (`200`, cabecera
    `Idempotency-Replayed: true`).
  - Misma clave y otro cuerpo: `409 CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO`.
  - La clave se aísla por pasajero y vence según `IDEMPOTENCIA_TTL_MS`.
- El precio se calcula siempre en el servidor con `TARIFA_*`; los importes
  enviados por el cliente se rechazan por el esquema estricto.
- La aceptación de un viaje es una única operación atómica: bloquea el viaje,
  valida que siga `SOLICITADO`, bloquea al chofer y verifica que esté
  habilitado, disponible y libre. Si dos choferes aceptan a la vez, exactamente
  uno gana; el otro recibe `VIAJE_NO_DISPONIBLE`. Si un chofer intenta aceptar
  dos viajes a la vez, recibe `CHOFER_OCUPADO` y el viaje perdedor sigue
  `SOLICITADO`.
- El orden global de bloqueo es **Viaje → Chofer**, igual para aceptar,
  cancelar y cambiar disponibilidad. En PostgreSQL se usa
  `SELECT ... FOR UPDATE`; los errores de serialización o interbloqueo se
  reintentan un número limitado de veces.
- Cancelar un viaje asignado libera al chofer en la misma transacción. Si la
  cancelación compite con una aceptación, el viaje termina cancelado y ningún
  chofer queda ocupado.
- `GET /ready` comprueba también las tablas de choferes, viajes y claves de
  idempotencia.

## Comandos

```bash
pnpm dev             # Servidor con recarga automática
pnpm start           # Servidor en modo normal
pnpm test            # Tests de arquitectura, integración y configuración
pnpm test:unit       # Solo tests unitarios (sin Express ni base de datos)
pnpm test:integration # Tests de integración y límites de arquitectura
pnpm lint            # Análisis estático
pnpm format          # Formateo con Prettier
pnpm db:up           # Levanta PostgreSQL con Docker Compose
pnpm db:migrate      # Aplica las migraciones SQL
pnpm db:down         # Detiene PostgreSQL
```

