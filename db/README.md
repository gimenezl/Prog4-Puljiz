# Base de datos

- `migrations/`: migraciones SQL versionadas. Se agregan cuando se defina el
  esquema de la primera tarjeta.
- `seeds/`: datos iniciales para desarrollo (zonas, tarifas, usuarios de
  prueba). Nunca se ejecutan en producción.

Convenciones para las migraciones:

- Nombre `NNNN-descripcion.sql` (por ejemplo `0001-crear-usuarios.sql`).
- SQL explícito, legible y reversible cuando sea posible.
- Las restricciones únicas e índices parciales del modelo de dominio se
  declaran en la migración correspondiente.
- Las credenciales y cadenas de conexión viven en `.env`, nunca en el SQL.
- Las migraciones son idempotentes (`IF NOT EXISTS`) y se aplican en orden
  alfabético. La función `aplicarMigraciones` de `scripts/migrate.js` es
  reutilizada por el runner de tests de integración.

Migraciones actuales:

- `001_usuarios.sql`: cuentas y unicidad del email sin distinguir mayúsculas.
- `002_viajes.sql`: viajes, perfiles de chofer y claves de idempotencia. Incluye
  el índice único parcial que impide dos viajes activos por chofer.

## Base de pruebas

`compose.test.yaml` define una instancia PostgreSQL separada y descartable:

- Contenedor `prog4-puljiz-db-test`.
- Base `proy_db_test`, publicada solo en `127.0.0.1:${POSTGRES_TEST_PORT:-5433}`.
- Datos en `tmpfs`: al bajar el contenedor se pierden.
- Sin volumen compartido con la base de desarrollo.

`pnpm test:integration:db` levanta esa base, recrea el esquema, aplica las
migraciones, ejecuta `tests/integration/postgres/` y la baja al terminar. Con
`KEEP_TEST_DB=1` se conserva para inspeccionarla. Para usarla manualmente:
`pnpm test:db:up`, luego definir `TEST_DATABASE_URL` y ejecutar los tests, y
finalmente `pnpm test:db:down`.
