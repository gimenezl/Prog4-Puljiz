# TP Programación IV — Plataforma de viajes

Trabajo práctico final de **Programación IV** de la **Universidad Tecnológica Nacional (UTN)**.

## De qué se trata

Backend de una plataforma de viajes estilo transporte urbano, desarrollado en **Node.js con Express**. Corresponde a la sección 6 del enunciado, con la variante de **precio dinámico**: el precio de cada viaje se ajusta con un multiplicador según la demanda de la zona.

La plataforma permite:

- Registro e inicio de sesión de pasajeros, choferes, administradores y operadores de soporte, con permisos por rol.
- Multiplicador por demanda en cada zona, calculado en el servidor con una regla configurable y auditable.
- Estimación de precio y tiempo antes de confirmar; el pasajero paga exactamente el precio que vio, aunque la demanda cambie después.
- Solicitud de viajes y búsqueda de choferes cercanos.
- Aceptación exclusiva, transiciones `ASIGNADO → CHOFER_EN_CAMINO → EN_CURSO → FINALIZADO` y cancelación actor-aware (pasajero dueño o chofer asignado), resueltas correctamente aunque ocurran al mismo tiempo.
- Ofertas con vencimiento, seguimiento en tiempo real y tarifa final: pendientes (RF-07, RF-22 y E4). El cobro simulado sobre `precioFijadoCentavos` sí está implementado.
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

## Documentación

- `docs/implementacion-completa.md`: resumen consolidado de los bloques 1 a 6.
- `docs/implementacion-bloque-1-y-3.md`: Docker, arranque y ciclo de vida.
- `docs/implementacion-bloque-5.md`: viajes, concurrencia e idempotencia.
- `docs/implementacion-bloque-6.md`: PostgreSQL real para tests.
- `docs/migraciones-configuracion-administrativa.md`: esquema de zonas de
  demanda, tarifas y reglas de multiplicador (RF-23 y RF-16).
- `docs/rf23-rf16-requerimientos-y-cambios.md`: requerimientos, decisiones,
  cambios y verificaciones de la configuración administrativa versionada.
- `docs/rf09-rf07-rf22-rf08-rf10-requerimientos-y-cambios.md`: estados del
  viaje, cancelación actor-aware y ejecución manual (RF-07/RF-22 pendientes).
- `docs/modelo.md`: modelo de dominio y diagramas.
- `docs/api.md`: contrato de la API HTTP, códigos de error, rate limits y tabla de permisos.
- `docs/mediciones.md`: mediciones con entorno, comandos y resultados (RF-06:
  búsqueda de choferes cercanos, PostGIS contra JavaScript).
- `docs/politica-de-idempotencia.md`: alcance, reintentos, conflictos y cobros.
- `docs/auditoria-dependencias.md`: resultados y justificación de la auditoría.
- `docs/guia-de-prueba-y-rutas.md`: recorrido manual con `curl`.
- `docs/prueba-manual-requerimientos.md`: verificación manual paso a paso de
  cobros idempotentes, autorización, rate limits, hardening y ciclo de vida.
- `docs/verificacion-local-automatica.md`: verificador automático por HTTP
  (`pnpm verificar`), sus modos, reporte y diagnóstico.

## Puesta en marcha

Requisitos: Docker y Docker Compose. Para ejecutar sin contenedores, además
Node.js 22 LTS y pnpm.

### Con Docker (recomendado)

```bash
cp .env.example .env   # opcional: Compose trae valores de desarrollo
docker compose up --build
```

Ese comando construye la imagen de la aplicación, levanta PostgreSQL, espera el
healthcheck de la base, aplica las migraciones y arranca Express en
`http://localhost:3000`. El contenedor de la aplicación vuelve a aplicar las
migraciones en cada arranque; son idempotentes.

```bash
docker compose ps                 # estado y healthchecks
docker compose exec app pnpm db:seed
curl http://localhost:3000/health
curl http://localhost:3000/ready
docker compose stop app           # envía SIGTERM y ejecuta el cierre ordenado
docker compose down               # baja todo; con -v borra también el volumen
```

Los datos de prueba quedan disponibles con estas cuentas:

| Rol | Email | Contraseña |
|---|---|---|
| `ADMINISTRADOR` | `admin@prog4.test` | `Admin1234!` |
| `OPERADOR_SOPORTE` | `soporte@prog4.test` | `Soporte1234!` |
| `PASAJERO` | `pasajero@prog4.test` | `Pasajero1234!` |
| `CHOFER` | `chofer1@prog4.test` | `Chofer1234!` |
| `CHOFER` | `chofer2@prog4.test` | `Chofer1234!` |

El seed es idempotente: si una cuenta ya existe con el mismo rol, no la
duplica ni pisa sus datos. Los dos choferes nacen habilitados y con vehículo
(`AA100AA` y `AA200AA`), pero **antes de listar o aceptar viajes tienen que
informar su ubicación**, y repetirla al menos una vez por minuto:

```bash
curl -X PUT http://localhost:3000/choferes/yo/ubicacion \
  -H "Authorization: Bearer <token-del-chofer>" \
  -H "Content-Type: application/json" \
  -d '{"lat": -34.6037, "lng": -58.3816}'
```

Para probar a mano con más margen, subir `UBICACION_VIGENCIA_MS` en `.env`
(por ejemplo, `600000` para 10 minutos).

### Sin Docker

```bash
cp .env.example .env
pnpm install
pnpm db:prepare
pnpm db:seed
pnpm dev
```

El servidor queda disponible en `http://localhost:3000`.

- `GET /health`: liveness. No consulta dependencias externas.
- `GET /ready`: readiness. Comprueba PostgreSQL, las tablas creadas por las
  migraciones (incluidos los cobros), la idempotencia y el reloj, con timeout
  por dependencia.

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
| `GET` | `/viajes/disponibles` | `CHOFER` habilitado, disponible y con ubicación reciente; solo viajes cercanos |
| `GET` | `/viajes/:id` | Participantes, `ADMINISTRADOR` u `OPERADOR_SOPORTE` |
| `POST` | `/viajes/:id/aceptar` | `CHOFER` habilitado, disponible y con ubicación reciente |
| `POST` | `/viajes/:id/en-camino` | Chofer asignado; `ASIGNADO → CHOFER_EN_CAMINO` |
| `POST` | `/viajes/:id/iniciar` | Chofer asignado; `CHOFER_EN_CAMINO → EN_CURSO` (fija `iniciadoEn`) |
| `POST` | `/viajes/:id/finalizar` | Chofer asignado; solo desde `EN_CURSO`, con `Idempotency-Key` |
| `GET` | `/viajes/:id/cobro` | Participantes, `ADMINISTRADOR` u `OPERADOR_SOPORTE` |
| `POST` | `/viajes/:id/cancelar` | Pasajero dueño (`SOLICITADO`/`ASIGNADO`/`CHOFER_EN_CAMINO`), chofer asignado (`ASIGNADO`/`CHOFER_EN_CAMINO`) u operador de soporte (también `EN_CURSO`), con `{ "motivo" }` |
| `GET` | `/viajes` | Historial propio de `PASAJERO` o `CHOFER`, paginado por cursor (`?limite`, `?cursor`, `?estado`) |
| `GET` | `/viajes/activos` | `OPERADOR_SOPORTE` o `ADMINISTRADOR`: viajes activos de todo el sistema, paginados por cursor |
| `GET` | `/choferes/yo` | `CHOFER` |
| `PATCH` | `/choferes/yo` | `CHOFER`; únicamente `disponible` |
| `GET` | `/choferes/yo/vehiculo` | `CHOFER` |
| `PUT` | `/choferes/yo/vehiculo` | `CHOFER`; crea o edita su vehículo |
| `PUT` | `/choferes/yo/ubicacion` | `CHOFER` habilitado |
| `PATCH` | `/choferes/:usuarioId/habilitacion` | `ADMINISTRADOR`; exige vehículo para habilitar |

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
- El registro y las operaciones costosas de viajes tienen límites propios
  (`REGISTRO_RATE_LIMIT_*` y `VIAJES_RATE_LIMIT_*`). Todas las respuestas
  publican `RateLimit-Limit`, `RateLimit-Remaining` y `RateLimit-Reset`; un
  `429` agrega `Retry-After`.
- Las migraciones SQL están en `db/migrations` y se aplican con `pnpm db:migrate`.

## Viajes, concurrencia e idempotencia

- Al registrarse un `CHOFER` se crea su perfil operativo en la **misma
  transacción** que el usuario. Nace `habilitado=false` y `disponible=false`.
  El chofer registra su vehículo (`PUT /choferes/yo/vehiculo`, patente única),
  un administrador lo habilita (sin vehículo responde
  `409 CHOFER_SIN_VEHICULO`) y después el chofer declara disponibilidad.
- Para listar y aceptar viajes, el chofer necesita una **ubicación reciente**:
  `PUT /choferes/yo/ubicacion` hace menos de `UBICACION_VIGENCIA_MS` (60 s por
  defecto). La hora la pone el servidor. La ubicación se guarda con PostGIS
  (`geography(Point, 4326)` con índice GiST, ADR-0006), por eso la base usa la
  imagen `postgis/postgis`.
- `GET /viajes/disponibles` muestra solo los viajes cuyo origen está a
  `BUSQUEDA_RADIO_M` metros o menos (5000 por defecto) del chofer, del más
  cercano al más lejano y con `distanciaM`. La búsqueda la resuelve PostGIS con
  índices GiST, nunca recorriendo los datos en JavaScript (RF-06). El buscador
  de choferes cercanos para las ofertas devuelve hasta `BUSQUEDA_MAX_CANDIDATOS`
  (10). La comparación de rendimiento se repite con `pnpm medir:busqueda` (ver
  `docs/mediciones.md`).
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
  cancelar, finalizar y cambiar disponibilidad. En PostgreSQL se usa
  `SELECT ... FOR UPDATE` seguido de validación de dominio antes del `UPDATE`
  (no `UPDATE ... WHERE estado = origen`); los errores de serialización o
  interbloqueo se reintentan un número limitado de veces.
- Las transiciones son `aceptar` → `en-camino` → `iniciar` → `finalizar`.
  `iniciar` fija `iniciadoEn` (migración 013) y `finalizar` exige `EN_CURSO`.
  Solo el chofer asignado puede ejecutarlas; un chofer ajeno recibe `403`.
- `/cancelar` es **actor-aware**: decide por el vínculo con el viaje, no por el
  rol. El pasajero dueño cancela desde `SOLICITADO`, `ASIGNADO` o
  `CHOFER_EN_CAMINO`; el chofer asignado desde `ASIGNADO` o
  `CHOFER_EN_CAMINO`. Si había chofer, se lo libera en la misma transacción;
  nunca queda un viaje cancelado con chofer ocupado. No hay cancelación por
  soporte (D8).
- `marcarEnCamino` contra una cancelación del pasajero no es «un solo ganador»:
  si el chofer marca primero, la cancelación también puede completarse después.
  El invariante es de coherencia: `CHOFER_EN_CAMINO` con chofer ocupado o
  `CANCELADO_POR_PASAJERO` con chofer libre. En cambio, `finalizar` gana siempre
  contra una cancelación del chofer, porque R10-04 prohíbe cancelar desde
  `EN_CURSO`.
- `POST /viajes/:id/finalizar` exige `Idempotency-Key`, finaliza el viaje desde
  `EN_CURSO`, libera al chofer y registra un cobro simulado en una sola
  transacción. La clave se aísla por chofer y el cobro tiene `viaje_id` UNIQUE:
  un viaje no puede cobrarse dos veces. El replay devuelve `200` con
  `Idempotency-Replayed: true`. Desde `ASIGNADO` responde `409 TRANSICION_INVALIDA`
  con `"Solo un viaje en curso puede finalizarse."`
- `GET /viajes/:id/cobro` permite consultar el cobro al pasajero, al chofer
  asignado, a un administrador o a un operador de soporte.
- `GET /ready` comprueba también las tablas de choferes, viajes, cobros,
  vehículos, ubicaciones y claves de idempotencia.
- La política completa de idempotencia y cobros está en
  `docs/politica-de-idempotencia.md`.

## Pruebas de integración con PostgreSQL real

Además de los tests con adaptadores en memoria, el proyecto incluye una suite
que se ejecuta contra una instancia real y descartable de PostgreSQL. Esa suite
valida las migraciones, las restricciones SQL, los bloqueos `SELECT ... FOR
UPDATE` y la concurrencia real de aceptar, cancelar y crear viajes.

```bash
pnpm test:integration:db
```

El comando:

1. Levanta `compose.test.yaml` (`prog4-puljiz-db-test`) en el puerto `5433`.
2. Espera a que PostgreSQL acepte conexiones.
3. Recrea el esquema `public` y aplica `db/migrations`.
4. Ejecuta `tests/integration/postgres/`.
5. Baja el contenedor y descarta los datos, salvo que se use `KEEP_TEST_DB=1`.

La base de test usa `tmpfs`, no comparte volumen con la base de desarrollo y se
publica solo en `127.0.0.1`. El puerto se puede cambiar con
`POSTGRES_TEST_PORT`. Si `TEST_DATABASE_URL` está definida, el runner usa esa
base externa y no levanta ni baja el contenedor.

En `pnpm test` esas 4 suites se omiten; la ejecución verificada usó el runner
efímero, sin depender de `TEST_DATABASE_URL`:

```bash
pnpm test:db:up
pnpm test:integration:db   # 48 tests PostgreSQL reales: 48 pass, 0 fail, 0 skipped
pnpm test:db:down
```

También se verificó la HTTP contra PostgreSQL real con
`pnpm test:db:up` → `pnpm verificar:postgres` → `pnpm test:db:down`
(16 OK, 0 fail, 2 omitidos). `test:db:up` deja el esquema migrado y listo para
usar; para apuntar a una base externa con `pnpm test:integration` sí podés
definir `TEST_DATABASE_URL`.

## Comandos

```bash
pnpm dev                 # Servidor con recarga automática
pnpm start               # Servidor en modo normal
pnpm test                # Tests de arquitectura, integración y configuración
pnpm test:unit           # Solo tests unitarios (sin Express ni base de datos)
pnpm test:integration    # Tests de integración y límites de arquitectura
pnpm test:integration:db # PostgreSQL real efímero: levanta, migra, prueba y baja
pnpm test:db:up          # Prepara la base de test y deja el contenedor
pnpm test:db:down        # Baja y borra la base de test
pnpm verificar           # Verificación HTTP integral con adaptadores fake
pnpm verificar:postgres  # Verificación HTTP integral contra PostgreSQL real
pnpm lint                # Análisis estático
pnpm format              # Formateo con Prettier
pnpm format:check        # Verifica el formato
pnpm audit:prod          # Audita dependencias de producción
pnpm audit:all           # Audita también las devDependencies
pnpm db:prepare          # Levanta PostgreSQL y aplica migraciones
pnpm db:seed             # Carga usuarios y choferes de prueba
pnpm db:up               # Levanta PostgreSQL y espera su healthcheck
pnpm db:migrate          # Aplica las migraciones SQL
pnpm db:down             # Detiene los contenedores
pnpm docker:up           # Construye y levanta app + PostgreSQL
pnpm docker:down         # Baja los contenedores
pnpm docker:logs         # Sigue los logs de la aplicación
```

