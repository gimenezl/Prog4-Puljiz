# ADR-0002: PostgreSQL con SQL parametrizado y sin ORM

- **Estado:** Aceptado
- **Fecha:** 2026-11-11
- **Participantes:** Lucas Gimenez, Guido Ayala, Enzo Vernet
- **Tarjeta:** E0 · ADR de módulos y persistencia

## Contexto

La plataforma necesita una base relacional que garantice las invariantes de
`docs/modelo.md` aun con pedidos simultáneos: un viaje con un solo chofer, un
chofer con un solo viaje activo, una clave de idempotencia usada una sola vez.
Varias de esas garantías dependen de transacciones, bloqueos de fila,
restricciones `CHECK` e índices únicos parciales. Además, la búsqueda geográfica
(ADR-0006) va a necesitar funciones espaciales.

Hay que decidir dos cosas: el motor y la forma de acceder a los datos desde Node.

Restricción del enunciado: tenemos que poder explicar qué SQL se ejecuta en cada
operación, también en la defensa oral.

## Alternativas consideradas

### Motor

| Alternativa                 | Ventajas                                                                                                                                                      | Desventajas                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **PostgreSQL 15** (elegida) | Bloqueos de fila (`SELECT ... FOR UPDATE`), índices únicos parciales, `CHECK`, `JSONB`, extensión PostGIS para geografía. Imagen oficial liviana para Docker. | Hay que levantar un servidor; en tests hace falta Docker.                                                     |
| MySQL 8                     | Conocido, también tiene `FOR UPDATE`.                                                                                                                         | No tiene índices únicos parciales (hay que simularlos), soporte geográfico más limitado.                      |
| SQLite                      | Sin servidor, ideal para tests.                                                                                                                               | Bloquea la base entera al escribir: no permite probar carreras reales entre conexiones ni medir concurrencia. |

### Acceso a datos

| Alternativa                                      | Ventajas                                                                                                                                 | Desventajas                                                                                                                                                                                |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Driver `pg` con SQL escrito a mano** (elegida) | El SQL que se ejecuta es exactamente el que está en el repositorio; control total de bloqueos y transacciones; sin dependencias pesadas. | Más código de mapeo fila → entidad; las migraciones se escriben a mano.                                                                                                                    |
| ORM (Prisma, Sequelize, TypeORM)                 | Menos código repetitivo, migraciones generadas.                                                                                          | El SQL real queda oculto; los bloqueos de fila y los índices parciales requieren escapes a SQL crudo; acopla el dominio a los modelos del ORM, lo que va contra la arquitectura hexagonal. |
| Query builder (Knex)                             | Punto intermedio, SQL legible.                                                                                                           | Otra API que aprender; para las consultas críticas igual terminaríamos escribiendo SQL.                                                                                                    |

## Decisión

Usamos **PostgreSQL 15** y el driver **`pg`** con **SQL parametrizado escrito a
mano**, sin ORM.

- Cada repositorio de `src/infrastructure/adapters/out/persistence/postgres-*.js`
  implementa un puerto de `src/application/ports/out/`. El dominio no conoce `pg`.
- Todos los valores van como parámetros (`$1`, `$2`, …), nunca concatenados al SQL.
- Las operaciones que tocan varias filas corren en una unidad de trabajo
  (`postgres-unit-of-work.js`) que abre `BEGIN`, ejecuta y hace `COMMIT` o
  `ROLLBACK`. Se usa el aislamiento por defecto de PostgreSQL (`READ COMMITTED`)
  más bloqueos de fila explícitos (ADR-0004).
- El esquema vive en `db/migrations/*.sql`, que `scripts/migrate.js` aplica en
  orden alfabético. Hoy son idempotentes (`CREATE ... IF NOT EXISTS`).

### SQL que se ejecuta

Aceptar un viaje (caso de uso `aceptar-viaje.js`), dentro de una transacción:

```sql
BEGIN;
SELECT ... FROM viajes   WHERE id = $1         FOR UPDATE;  -- bloquea el viaje
SELECT ... FROM choferes WHERE usuario_id = $1 FOR UPDATE;  -- bloquea al chofer
UPDATE viajes   SET chofer_id = $2, estado = $3, asignado_en = $4, ... WHERE id = $1;
UPDATE choferes SET ... viaje_activo_id = ... WHERE usuario_id = $1;
COMMIT;
```

Crear un viaje con clave de idempotencia (caso de uso `crear-viaje.js`):

```sql
BEGIN;
SELECT ... FROM claves_idempotencia WHERE alcance = $1 AND clave = $2;
INSERT INTO viajes (...) VALUES ($1, $2, ...);
INSERT INTO claves_idempotencia (...) VALUES (...) ON CONFLICT (alcance, clave) DO NOTHING;
COMMIT;
```

Si el `INSERT ... ON CONFLICT DO NOTHING` no inserta nada, otra transacción ganó
la misma clave: se hace `ROLLBACK` del viaje creado y se devuelve la respuesta
guardada por la transacción ganadora.

Las restricciones de `db/migrations/002_viajes.sql` son la segunda línea de
defensa: por ejemplo, el índice único parcial `viajes_chofer_activo_idx` impide
que un chofer tenga dos viajes activos aunque el código fallara.

## Consecuencias

- Podemos mostrar y explicar cada consulta; el comportamiento ante carreras se
  prueba contra PostgreSQL real (`pnpm test:integration:db`, con `compose.test.yaml`).
- Los tests de dominio y de aplicación no necesitan base: usan los adaptadores en
  memoria con el mismo contrato.
- Hay más código de mapeo que con un ORM.
- `scripts/migrate.js` no lleva registro de qué migraciones se aplicaron: vuelve a
  ejecutar todas en cada arranque. Funciona mientras cada migración sea
  idempotente. Cuando haga falta una migración que no lo sea (por ejemplo, un
  `ALTER TABLE` que mueve datos), hay que agregar una tabla de control de
  migraciones aplicadas.

## Condición de revisión

Reabrir si el mapeo manual se vuelve inmanejable (más de diez tablas con
relaciones complejas), si necesitamos una migración no idempotente sin tabla de
control, o si la medición de E4 muestra que el pool de conexiones es el cuello
de botella.
