# Implementación de los Bloques 1 y 3 — Docker, arranque y ciclo de vida

Este documento describe el cierre de los Bloques 1 y 3 del Trabajo Final:
proyecto, dependencias, arranque con Docker, configuración por variables de
entorno, endpoints de salud y apagado ordenado.

- **Rama:** `preparacion-de-entorno`
- **Commit base:** `75afdb1`
- **Fecha de verificación:** 11 de noviembre de 2026
- **Runtime:** Node.js 22 LTS
- **Módulos:** ESM estricto
- **Base de datos:** PostgreSQL 15
- **Orquestación:** Docker Compose

---

## 1. Objetivo

Cumplir estrictamente con:

### Bloque 1

- Que todo el proyecto levante con `docker compose up`.
- Tener un archivo de bloqueo de dependencias.
- Contar con scripts para desarrollo, producción, preparación de la base,
  carga de datos de prueba, tests y lint.

### Bloque 3

- Configuración exclusiva por variables de entorno.
- Validación del esquema de entorno al arrancar.
- Error exacto y exit code distinto de cero si falta una variable.
- `/health` para liveness y `/ready` para readiness.
- `/ready` debe comprobar la base y las migraciones.
- Graceful shutdown con `SIGTERM`.

---

## 2. Estado inicial

Antes de esta iteración ya existían:

- Arquitectura hexagonal completa.
- Dominio aislado de Express, PostgreSQL y librerías externas.
- Puertos con adaptadores reales y falsos.
- Composition root único en `src/composition-root.js`.
- Validación de entorno con Zod en `src/infrastructure/config/env.js`.
- `/health` y `/ready`.
- Cierre ordenado con `SIGTERM` y `SIGINT`.
- `pnpm-lock.yaml`.
- Scripts de desarrollo, producción, tests, lint y migraciones.

Lo que faltaba para el Bloque 1 era:

- Dockerizar la aplicación.
- Agregar el servicio `app` a `compose.yaml`.
- Ejecutar migraciones automáticamente al arrancar el contenedor.
- Crear un script de carga de datos de prueba.
- Documentar el arranque completo con Docker.

El Bloque 3 ya estaba funcionalmente cumplido. No se modificaron sus archivos
principales: `env.js`, `main.js`, `shutdown.js`, `health.routes.js` ni
`readiness-check.js`.

---

## 3. Bloque 1 — Proyecto, dependencias y arranque

### 3.1 Dockerfile

Archivo nuevo: `Dockerfile`

Se usa una construcción multi-stage:

```text
base
├── node:22-alpine
├── pnpm@12.16.1 instalado globalmente
└── WORKDIR /app

dependencies
├── package.json
├── pnpm-lock.yaml
└── pnpm install --frozen-lockfile --prod

runtime
├── node_modules de producción
├── src/
├── db/
├── scripts/
└── ejecución como usuario node
```

Puntos importantes:

- La imagen base es **Node.js 22 Alpine**, alineada con `.nvmrc` y con
  `engines.node`.
- Se instala exactamente **pnpm 12.16.1**, la misma versión fijada en
  `packageManager` y en `pnpm-lock.yaml`.
- Se usa `--frozen-lockfile` para que la imagen falle si el lockfile no
  coincide con `package.json`.
- Solo se instalan dependencias de producción.
- El proceso corre como usuario `node` (UID 1000), no como root.
- `STOPSIGNAL SIGTERM` explicita la señal de parada.
- El comando de arranque es:

```sh
node scripts/migrate.js && exec node src/main.js
```

`exec` reemplaza el shell por Node, de modo que Node queda como PID 1 y recibe
`SIGTERM` directamente. Las migraciones se aplican antes de aceptar tráfico y
son idempotentes, por lo que un reinicio del contenedor no rompe la base.

### 3.2 `.dockerignore`

Archivo nuevo: `.dockerignore`

Excluye del contexto de build:

- `node_modules`
- `.git`
- `.env` y variantes locales
- `coverage`
- `dist`
- logs
- `docs`
- `tests`

El `.env` nunca se copia a la imagen. Las variables se inyectan en runtime.

### 3.3 `compose.yaml`

El archivo ahora define dos servicios:

- `db`: PostgreSQL 15 con volumen persistente y healthcheck.
- `app`: imagen construida desde el Dockerfile.

Características:

- `app` depende de `db` con `condition: service_healthy`.
- La base se espera antes de ejecutar migraciones.
- `DATABASE_URL` apunta al servicio `db`, no a `localhost`.
- `env_file` carga `.env` de forma opcional.
- Las variables propias del contenedor se declaran en `environment` y tienen
  prioridad sobre `.env`.
- `app` publica `${APP_PORT:-3000}:3000`.
- El healthcheck de `app` consulta `/health` con `fetch` de Node.
- `db` publica `${POSTGRES_PORT:-5432}:5432`.

Valores de desarrollo por defecto:

```text
POSTGRES_USER=admin
POSTGRES_PASSWORD=password
POSTGRES_DB=proy_db
JWT_SECRET=cambiar-este-secreto-de-desarrollo-de-al-menos-32-caracteres
```

El `JWT_SECRET` por defecto es **solo para desarrollo local**. En un entorno
real debe definirse uno propio en `.env` o en el gestor de secretos.

### 3.4 Scripts de `package.json`

| Script | Función |
|---|---|
| `dev` | Arranca con recarga automática. |
| `start` | Arranca en modo producción. |
| `test` | Ejecuta toda la suite. |
| `test:unit` | Solo tests unitarios. |
| `test:integration` | Tests de integración y arquitectura. |
| `test:integration:db` | PostgreSQL real efímero. |
| `lint` | ESLint. |
| `format` | Prettier. |
| `format:check` | Verifica formato. |
| `db:prepare` | Levanta PostgreSQL y aplica migraciones. |
| `db:migrate` | Aplica las migraciones. |
| `db:seed` | Carga datos de prueba. |
| `db:up` | Levanta PostgreSQL y espera su healthcheck. |
| `db:down` | Baja los contenedores. |
| `docker:up` | Construye y levanta app + PostgreSQL. |
| `docker:down` | Baja los contenedores. |
| `docker:logs` | Sigue los logs de la aplicación. |

`db:up` usa `docker compose up -d --wait db`, por lo que espera el healthcheck
antes de devolver el control.

### 3.5 Datos de prueba

Archivo nuevo: `scripts/seed.js`

El seed:

- Usa `composeApplication`, el mismo composition root de la aplicación.
- No crea un segundo grafo de adaptadores.
- Valida la contraseña con la política del dominio.
- Crea usuarios con entidades `Usuario`.
- Crea perfiles de chofer con la entidad `Chofer`.
- Usa una transacción para crear usuario y perfil de chofer juntos.
- Es idempotente: si el email ya existe con el mismo rol, no lo duplica.
- Si un chofer existe pero no tiene perfil, lo crea.
- No pisa contraseñas ni datos de cuentas existentes.

Cuentas creadas:

| Rol | Email | Contraseña |
|---|---|---|
| `ADMINISTRADOR` | `admin@prog4.test` | `Admin1234!` |
| `OPERADOR_SOPORTE` | `soporte@prog4.test` | `Soporte1234!` |
| `PASAJERO` | `pasajero@prog4.test` | `Pasajero1234!` |
| `CHOFER` | `chofer1@prog4.test` | `Chofer1234!` |
| `CHOFER` | `chofer2@prog4.test` | `Chofer1234!` |

Los choferes de prueba quedan habilitados y disponibles.

Para que el seed pueda generar identificadores, `src/composition-root.js`
expone `generadorIds` en su objeto de retorno. Es el mismo generador que ya se
usaba internamente; no se agregó una nueva composición ni se filtró
infraestructura al dominio.

### 3.6 Lockfile y ESM

- `pnpm-lock.yaml` está versionado.
- `lockfileVersion: '9.0'`.
- `packageManager: pnpm@12.16.1`.
- `"type": "module"` en `package.json`.
- El código fuente usa `import` / `export`.

---

## 4. Bloque 3 — Configuración y ciclo de vida

### 4.1 Validación del entorno

Archivo: `src/infrastructure/config/env.js`

El esquema Zod valida, entre otras variables:

- `NODE_ENV`
- `HOST`
- `PORT`
- `LOG_LEVEL`
- `ADAPTERS_MODE`
- `DATABASE_URL`
- `DATABASE_SSL`
- `DATABASE_POOL_MAX`
- `JWT_SECRET`
- `JWT_EXPIRES_IN_MINUTES`
- `PASSWORD_HASH_COST`
- `TARIFA_*`
- `IDEMPOTENCIA_TTL_MS`
- `READINESS_TIMEOUT_MS`
- `SHUTDOWN_TIMEOUT_MS`
- `CORS_ORIGIN`
- `BODY_LIMIT`
- `RATE_LIMIT_*`

En `ADAPTERS_MODE=real` son obligatorias `DATABASE_URL` y `JWT_SECRET`.
`JWT_SECRET` debe tener al menos 32 caracteres.

Si la validación falla, `loadEnv` lanza un error con el detalle exacto:

```text
Configuración de entorno inválida: DATABASE_URL: Es obligatoria cuando ADAPTERS_MODE=real; JWT_SECRET: Es obligatorio cuando ADAPTERS_MODE=real
```

`src/main.js` captura ese error, lo registra y ejecuta `process.exit(1)`.

Verificación real desde un directorio sin `.env`:

```text
exit_code=1
{"level":60,...,"msg":"No se pudo iniciar la aplicación"}
```

### 4.2 `/health` y `/ready`

Archivo: `src/infrastructure/adapters/in/http/routes/health.routes.js`

- `GET /health` es liveness. Responde `200` sin consultar la base.
- `GET /ready` es readiness. Ejecuta los chequeos en paralelo y responde `200`
  o `503`.

Chequeos de readiness:

```text
baseDeDatos  → SELECT 1
usuarios     → SELECT 1 FROM usuarios LIMIT 1
choferes     → SELECT 1 FROM choferes LIMIT 1
viajes       → SELECT 1 FROM viajes LIMIT 1
idempotencia → SELECT 1 FROM claves_idempotencia LIMIT 1
reloj        → reloj.ahora() es Date
```

Las cuatro tablas son creadas por las migraciones. Si las migraciones no se
aplicaron, las consultas fallan y `/ready` responde `503`. Por eso la
verificación de migraciones está cubierta sin agregar un chequeo duplicado.

Respuesta real verificada:

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
  "fecha": "2026-11-11T14:47:28.681Z"
}
```

### 4.3 Graceful shutdown

Archivos:

- `src/main.js`
- `src/infrastructure/lifecycle/shutdown.js`
- `src/infrastructure/lifecycle/http-server.js`

Comportamiento:

1. Se captura `SIGTERM` o `SIGINT`.
2. Se deja de aceptar conexiones nuevas.
3. Se cierran las conexiones inactivas.
4. Se esperan las solicitudes en curso.
5. Se cierra la pool de PostgreSQL.
6. Si el cierre supera `SHUTDOWN_TIMEOUT_MS`, el proceso termina con código 1.

Verificación real:

```text
{"level":30,"senal":"SIGTERM","msg":"Cierre ordenado iniciado"}
{"level":30,"senal":"SIGTERM","msg":"Cierre ordenado completado"}
```

Los logs reales son JSON y usan el campo `msg`, tal como se muestra en la
sección de verificaciones.

---

## 5. Archivos creados y modificados

### Creados

- `Dockerfile`
- `.dockerignore`
- `scripts/seed.js`
- `docs/implementacion-bloque-1-y-3.md`

### Modificados

- `compose.yaml`
- `package.json`
- `.env.example`
- `README.md`
- `src/composition-root.js` (solo expone `generadorIds` al seed)
- `docs/implementacion-completa.md`

### No modificados

- Dominio.
- Casos de uso.
- Puertos.
- Adaptadores.
- Validación de entorno.
- Endpoints de salud.
- Lógica de shutdown.
- Tests existentes.

---

## 6. Verificaciones realizadas

### 6.1 Build de la imagen

```text
docker compose build
Successfully built ...
Successfully tagged prog4-puljiz-app:latest
```

Dentro del contenedor:

```text
Node.js v22.23.4
pnpm 12.16.1
uid=1000(node) gid=1000(node)
```

### 6.2 Arranque completo

```text
docker compose up -d
Container prog4-puljiz-db Healthy
Container prog4-puljiz-app Started
```

Estado final:

```text
prog4-puljiz-app   Up (healthy)   0.0.0.0:3000->3000/tcp
prog4-puljiz-db    Up (healthy)   0.0.0.0:5432->5432/tcp
```

Logs de arranque:

```text
{"migracion":"001_usuarios.sql","msg":"Migración aplicada"}
{"migracion":"002_viajes.sql","msg":"Migración aplicada"}
{"host":"0.0.0.0","puerto":3000,"msg":"Servidor HTTP escuchando"}
```

También se probó un arranque desde una base completamente vacía, en un
proyecto Compose aislado (`prog4-puljiz-clean`, puertos 3100 y 5434). El
contenedor aplicó las migraciones y `/ready` respondió `200` con todas las
tablas:

```text
choferes
claves_idempotencia
usuarios
viajes
```

Ese proyecto se eliminó con `docker compose down -v` al terminar la prueba,
sin tocar la base de desarrollo.

### 6.3 Endpoints

```text
GET /health → 200
GET /ready  → 200
```

`/ready` devolvió todos los chequeos en `true`, incluidos `usuarios`,
`choferes`, `viajes`, `idempotencia` y `reloj`.

### 6.4 Seed

Primera ejecución:

```text
[seed] admin@prog4.test creado (ADMINISTRADOR).
[seed] soporte@prog4.test creado (OPERADOR_SOPORTE).
[seed] pasajero@prog4.test creado (PASAJERO).
[seed] chofer1@prog4.test creado (CHOFER).
[seed] chofer2@prog4.test creado (CHOFER).
```

Segunda ejecución:

```text
[seed] admin@prog4.test ya existía (ADMINISTRADOR); no se modificó.
[seed] soporte@prog4.test ya existía (OPERADOR_SOPORTE); no se modificó.
[seed] pasajero@prog4.test ya existía (PASAJERO); no se modificó.
[seed] chofer1@prog4.test ya existía (CHOFER); no se modificó.
[seed] chofer2@prog4.test ya existía (CHOFER); no se modificó.
```

### 6.5 Login y perfiles

```text
POST /auth/login pasajero@prog4.test → 200
GET  /auth/yo                        → PASAJERO
POST /auth/login chofer1@prog4.test  → 200
GET  /choferes/yo                    → habilitado=true, disponible=true, estado=DISPONIBLE
POST /auth/login admin@prog4.test    → 200
GET  /auth/yo                        → ADMINISTRADOR
```

### 6.6 Idempotencia de viajes

Se creó un viaje con `Idempotency-Key` y se repitió la misma petición:

```text
Intento 1 → HTTP 201, viaje creado
Intento 2 → HTTP 200, mismo viaje, cabecera Idempotency-Replayed: true
```

### 6.7 Cierre ordenado

```text
docker compose stop app
Container prog4-puljiz-app Stopped
```

Logs:

```text
{"senal":"SIGTERM","msg":"Cierre ordenado iniciado"}
{"senal":"SIGTERM","msg":"Cierre ordenado completado"}
```

### 6.8 Scripts locales

```text
pnpm db:prepare
pnpm db:migrate
pnpm db:seed
```

Los tres comandos funcionaron contra PostgreSQL en Docker.

### 6.9 Suite de tests

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

### 6.10 Lint y formato

```text
pnpm lint          → OK
pnpm format:check  → OK
```

---

## 7. Comandos de operación

### Levantar todo

```bash
cp .env.example .env   # opcional
docker compose up --build
```

### Ver estado

```bash
docker compose ps
```

### Cargar datos de prueba

```bash
docker compose exec app pnpm db:seed
```

### Ver salud

```bash
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

### Ver logs

```bash
docker compose logs -f app
```

### Detener con cierre ordenado

```bash
docker compose stop app
```

### Bajar todo

```bash
docker compose down
```

Para borrar también el volumen de PostgreSQL:

```bash
docker compose down -v
```

### Desarrollo sin contenedor de aplicación

```bash
cp .env.example .env
pnpm install
pnpm db:prepare
pnpm db:seed
pnpm dev
```

---

## 8. Decisiones de diseño

- **Migraciones al arrancar:** el contenedor aplica las migraciones antes de
  iniciar HTTP. Si la base no está lista, Compose espera su healthcheck.
- **Migraciones idempotentes:** se pueden ejecutar en cada reinicio sin
  duplicar tablas ni índices.
- **Seed idempotente:** no duplica cuentas y no pisa datos existentes.
- **Composition root único:** el seed reutiliza `composeApplication`; no crea
  adaptadores por su cuenta.
- **Usuario no root:** la aplicación corre como `node`.
- **Variables sensibles fuera de la imagen:** `.env` se excluye del contexto de
  build y se inyecta en runtime.
- **`/ready` cubre migraciones:** las consultas a las cuatro tablas fallan si el
  esquema no está aplicado.
- **Sin cambios innecesarios en Bloque 3:** la validación, los endpoints y el
  shutdown ya cumplían los requisitos.

---

## 9. Pendientes para las próximas etapas

- Bloque 7: identificar una tarea pesada y resolverla con chunking, streams,
  workers o colas.
- Completar la documentación específica del Bloque 8 si se agregan más casos
  de integración.
- Evaluar un runner de migraciones con tabla de versiones si el proyecto crece
  más allá de las migraciones idempotentes actuales.
