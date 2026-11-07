# Implementación del Bloque 6 — PostgreSQL real para tests

Este bloque agrega una base de datos PostgreSQL dedicada y descartable para
probar el backend contra el motor real. Hasta el Bloque 5 la concurrencia se
verificaba con adaptadores en memoria; ahora también se ejecutan las consultas
SQL, los bloqueos `SELECT ... FOR UPDATE`, las restricciones y los índices
parciales sobre PostgreSQL 15.

El trabajo se mantiene dentro de la arquitectura hexagonal: la suite usa los
mismos adaptadores y casos de uso que el composition root, sin agregar atajos
ni lógica de negocio en los tests.

---

## 1. Objetivo

- Tener una base de pruebas aislada de la base de desarrollo.
- Poder recrearla desde cero en cada ejecución.
- Reutilizar el runner de migraciones en lugar de duplicar SQL en los tests.
- Verificar garantías que los adaptadores en memoria no pueden demostrar:
  - `SELECT ... FOR UPDATE`.
  - Restricciones `CHECK`.
  - Claves foráneas.
  - Índice único parcial de viaje activo por chofer.
  - Clave primaria compuesta de idempotencia.
  - Comportamiento de `ON CONFLICT DO NOTHING`.
  - Reversión real de transacciones.
- Mantener `pnpm test` rápido y sin dependencias externas.

---

## 2. Archivos

### Nuevos

| Archivo | Función |
|---|---|
| `compose.test.yaml` | PostgreSQL efímero exclusivo para tests. |
| `scripts/test-database.js` | Levanta, espera, migra, ejecuta y baja la base de test. |
| `tests/helpers/postgres-kit.js` | Grafo de adaptadores reales y datos de prueba. |
| `tests/integration/postgres/postgres.test.js` | Suite de integración contra PostgreSQL real. |

### Modificados

| Archivo | Cambio |
|---|---|
| `scripts/migrate.js` | Exporta `aplicarMigraciones` para reutilizarlo desde tests y scripts. |
| `package.json` | Nuevos comandos `test:integration:db`, `test:db:up` y `test:db:down`. |
| `.env.example` | Documenta `POSTGRES_TEST_PORT` y `TEST_DATABASE_URL`. |
| `README.md` | Sección de pruebas de integración real y comandos nuevos. |
| `db/README.md` | Base de pruebas, migraciones reutilizables y uso manual. |

No se modificó código de producción del dominio, la aplicación ni los
adaptadores HTTP. El único cambio fuera de tests y documentación es la
exportación de `aplicarMigraciones`.

---

## 3. Base efímera: `compose.test.yaml`

```yaml
name: prog4-puljiz-test

services:
  db-test:
    image: postgres:15-alpine
    container_name: prog4-puljiz-db-test
    restart: 'no'
    environment:
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: password
      POSTGRES_DB: proy_db_test
    ports:
      - '127.0.0.1:${POSTGRES_TEST_PORT:-5433}:5432'
    tmpfs:
      - /var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U admin -d proy_db_test']
      interval: 2s
      timeout: 3s
      retries: 30
```

Decisiones:

- **Proyecto separado** (`prog4-puljiz-test`): `docker compose down` del test no
  toca la base de desarrollo.
- **Contenedor separado** (`prog4-puljiz-db-test`): se puede inspeccionar sin
  confundirlo con `prog4-puljiz-db`.
- **Puerto 5433** por defecto: no compite con el 5432 de desarrollo.
- **Solo `127.0.0.1`**: la base de test no queda publicada en la red.
- **`tmpfs`**: los datos viven en memoria y desaparecen al bajar el contenedor.
  No hay volumen compartido ni riesgo de reutilizar datos viejos.
- **Healthcheck**: permite verificar el estado del contenedor con
  `docker compose -f compose.test.yaml ps`.

El puerto se puede cambiar con `POSTGRES_TEST_PORT`. Si se cambia, el runner
calcula la URL de conexión con ese mismo valor.

---

## 4. Runner: `scripts/test-database.js`

Comandos:

```bash
pnpm test:integration:db   # ciclo completo: levanta, migra, prueba y baja
pnpm test:db:up            # prepara la base y deja el contenedor
pnpm test:db:down          # baja y borra la base de test
```

### Ciclo de `test:integration:db`

1. Levanta el servicio `db-test` con `docker compose -f compose.test.yaml up -d`.
2. Espera a que PostgreSQL acepte conexiones. No depende de `--wait` de Compose:
   hace polling con `pg.Client` y un tiempo máximo configurable con
   `TEST_DATABASE_TIMEOUT_MS` (30 s por defecto).
3. Ejecuta `DROP SCHEMA IF EXISTS public CASCADE` y `CREATE SCHEMA public` para
   partir siempre de un esquema limpio.
4. Aplica `db/migrations` con `aplicarMigraciones`.
5. Ejecuta:

   ```bash
   node --test --test-concurrency=1 tests/integration/postgres/
   ```

   con `TEST_DATABASE_URL`, `DATABASE_URL`, `NODE_ENV=test`, `LOG_LEVEL=silent`,
   `ADAPTERS_MODE=real`, `JWT_SECRET` de prueba y `PASSWORD_HASH_COST=4`.
6. Baja el contenedor con `down --volumes --remove-orphans`, incluso si los
   tests fallan.

Si los tests fallan, el código de salida del runner conserva el código de
`node --test`. Si el cierre del contenedor también falla, se informa y el
proceso termina con error.

### Conservar la base

```bash
KEEP_TEST_DB=1 pnpm test:integration:db
```

El contenedor queda levantado para inspeccionarlo con `psql` o para volver a
correr la suite. Después se baja con `pnpm test:db:down`.

### Base externa

Si `TEST_DATABASE_URL` está definida, el runner **no** levanta ni baja el
contenedor. Solo espera la conexión y ejecuta los tests. En ese caso no recrea
el esquema automáticamente: la suite aplica las migraciones faltantes, pero no
borra datos de una base que no administra.

Esto permite apuntar a un PostgreSQL de CI o a un contenedor propio:

```bash
TEST_DATABASE_URL=postgresql://usuario:clave@host:puerto/base \
  pnpm test:integration:db
```

---

## 5. Migraciones reutilizables

`scripts/migrate.js` ahora expone:

```js
export async function aplicarMigraciones(
  baseDeDatos,
  { logger, directorio = DIRECTORIO_MIGRACIONES } = {},
) {
  const archivos = (await readdir(directorio))
    .filter((archivo) => archivo.endsWith('.sql'))
    .sort();

  for (const archivo of archivos) {
    const sql = await readFile(path.join(directorio, archivo), 'utf8');
    await baseDeDatos.query(sql);
    logger?.info({ migracion: archivo }, 'Migración aplicada');
  }
}
```

- Se mantiene el orden alfabético.
- Se reutiliza desde el CLI y desde el runner de tests.
- Las migraciones actuales son idempotentes, por lo que aplicarlas dos veces no
  rompe el esquema. La suite lo verifica explícitamente.
- El CLI `pnpm db:migrate` sigue funcionando igual.

La detección de ejecución directa usa `pathToFileURL` para que importar
`aplicarMigraciones` no dispare el proceso de migración.

---

## 6. Kit de integración: `tests/helpers/postgres-kit.js`

`crearKitPostgres()` arma el mismo grafo que el composition root, pero con
accesos directos para preparar datos:

- `PostgresDatabase` con pool de hasta 20 conexiones.
- `PostgresUserRepository`, `PostgresChoferRepository`,
  `PostgresViajeRepository` y `PostgresIdempotencyRepository`.
- `PostgresUnitOfWork`.
- `SystemClock` y `CryptoIdGenerator`.
- Casos de uso `crearViaje`, `aceptarViaje` y `cancelarViaje`.
- `crearUsuario`, `crearChofer` y `crearViajeDePrueba`.
- `limpiar()`: `TRUNCATE` de las cuatro tablas con `CASCADE`.
- `cerrar()`: cierra la pool.

El kit exige `TEST_DATABASE_URL`. No se crea si la variable no está definida,
porque la suite completa se saltea en ese caso.

Cada test llama a `limpiar()` desde `beforeEach`. Así los casos no dependen del
orden ni de datos dejados por otro test.

---

## 7. Suite real

Archivo: `tests/integration/postgres/postgres.test.js`

Se ejecuta solo si `TEST_DATABASE_URL` está definida. En `pnpm test` aparece
como suite salteada y no agrega dependencias externas.

Casos cubiertos:

| Caso | Qué valida |
|---|---|
| Migraciones idempotentes | Tablas e índices esperados; aplicar dos veces no falla. |
| Repositorios | Round-trip de usuario, chofer, viaje y clave de idempotencia; email sin distinguir mayúsculas; `ON CONFLICT` de la clave. |
| Restricciones | `CHECK` de disponibilidad, estado y coherencia; clave foránea; índice único parcial; email duplicado. |
| `SELECT ... FOR UPDATE` | Una segunda transacción queda bloqueada hasta el commit de la primera. |
| Rollback | Un error dentro de la unidad de trabajo revierte el cambio. |
| 20 aceptaciones concurrentes | Exactamente un chofer gana; 19 reciben `VIAJE_NO_DISPONIBLE`; solo el ganador queda ocupado. |
| Chofer con dos viajes | Una aceptación gana y la otra recibe `CHOFER_OCUPADO`; el viaje perdedor sigue `SOLICITADO`. |
| Idempotencia concurrente | Ocho solicitudes con la misma clave generan un solo viaje y un solo registro; conflicto de contenido y vencimiento. |
| Aceptar vs. cancelar | El viaje termina cancelado y el chofer queda libre. |
| HTTP real | Registro, login, habilitación, disponibilidad, creación idempotente, replay, aceptación, cancelación y `/ready` sobre PostgreSQL. |

### Detalle del bloqueo

El test abre una transacción A, bloquea el viaje y avisa que tomó el lock.
Después inicia una transacción B que intenta el mismo `SELECT ... FOR UPDATE`.
Tras 200 ms, B todavía no resolvió. Cuando A hace commit, B continúa y devuelve
la fila. Esto demuestra que el bloqueo no es una simulación en memoria.

### Detalle de las aceptaciones concurrentes

Se crean 20 choferes habilitados y disponibles y un viaje. Las 20 aceptaciones
salen en paralelo sobre el mismo viaje. El resultado esperado es:

```text
1 aceptación exitosa
19 rechazos VIAJE_NO_DISPONIBLE
1 fila en viajes con estado ASIGNADO
1 chofer con viaje_activo_id
```

La base se consulta después de las carreras para verificar que no quedaron
estados parciales.

---

## 8. Ejecución

### Suite completa sin base externa

```bash
pnpm test
```

Resultado verificado:

```text
132 tests
132 pass
0 fail
```

La suite de PostgreSQL figura como salteada.

### Suite real

```bash
pnpm test:integration:db
```

Resultado verificado:

```text
10 tests
10 pass
0 fail
```

Incluye la suite HTTP real y las pruebas de concurrencia.

### Formato y lint

```bash
pnpm format
pnpm lint
pnpm format:check
```

Los tres comandos pasan sin errores.

---

## 9. Decisiones de diseño

- **No se usa la base de desarrollo para tests.** Aunque el esquema sea el
  mismo, un test puede truncar tablas y borrar datos locales.
- **El esquema se recrea desde cero en cada corrida orquestada.** Esto evita
  falsos positivos por datos viejos y hace reproducible el resultado.
- **El runner no depende de `docker compose --wait`.** El polling con
  `pg.Client` funciona igual en distintas versiones de Compose y permite un
  mensaje de error claro.
- **La suite se saltea sin `TEST_DATABASE_URL`.** `pnpm test` sigue siendo
  rápido y no obliga a tener Docker encendido.
- **La variable `TEST_DATABASE_URL` también permite CI.** Si se define, el
  runner no administra el contenedor y solo ejecuta los tests.
- **La base de test no comparte red ni volumen con desarrollo.** El proyecto
  `prog4-puljiz-test` queda aislado del `prog4-puljiz` de `compose.yaml`.
- **Se usa `tmpfs`.** El contenedor arranca rápido y no deja datos en disco.
- **Los tests usan los adaptadores reales, no dobles.** La suite valida SQL,
  tipos, fechas, JSONB, locks y constraints del mismo código que corre en
  producción.

---

## 10. Uso manual

Preparar la base:

```bash
pnpm test:db:up
```

Ejecutar los tests apuntando a ella:

```bash
TEST_DATABASE_URL=postgresql://admin:password@127.0.0.1:5433/proy_db_test \
  pnpm test:integration
```

Bajar y borrar la base:

```bash
pnpm test:db:down
```

Para cambiar el puerto:

```bash
POSTGRES_TEST_PORT=5434 pnpm test:integration:db
```

Para conservar la base después de una corrida:

```bash
KEEP_TEST_DB=1 pnpm test:integration:db
```

---

## 11. Trabajo pendiente

- Flujo de ofertas con vencimiento y aceptación exclusiva.
- Tarifa dinámica por demanda y cotizaciones.
- Seguimiento del viaje en tiempo real.
- Finalización del viaje y cobro simulado.
- Pruebas de carga y mediciones de latencia.
- Integración continua con el mismo `compose.test.yaml`.
