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

Migraciones actuales:

- `001_usuarios.sql`: cuentas y unicidad del email sin distinguir mayúsculas.
- `002_viajes.sql`: viajes, perfiles de chofer y claves de idempotencia. Incluye
  el índice único parcial que impide dos viajes activos por chofer.
