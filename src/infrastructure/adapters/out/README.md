# Adaptadores de salida

Cada dependencia externa debe tener un adaptador real y otro falso o en memoria
para los tests. El composition root elige uno u otro con `ADAPTERS_MODE`.

| Dependencia | Puerto | Adaptador real | Adaptador falso |
|---|---|---|---|
| Base de datos | `BaseDeDatos` / Repositorios / `UnidadDeTrabajo` | `persistence/postgres-database.js` | `persistence/in-memory-database.js` |
| Usuarios | `RepositorioUsuarios` | `persistence/postgres-user-repository.js` | `persistence/in-memory-user-repository.js` |
| Choferes | `RepositorioChoferes` | `persistence/postgres-chofer-repository.js` | `persistence/in-memory-chofer-repository.js` |
| Viajes | `RepositorioViajes` | `persistence/postgres-viaje-repository.js` | `persistence/in-memory-viaje-repository.js` |
| Idempotencia | `RepositorioClavesIdempotencia` | `persistence/postgres-idempotency-repository.js` | `persistence/in-memory-idempotency-repository.js` |
| Transacciones | `UnidadDeTrabajo` | `persistence/postgres-unit-of-work.js` | `persistence/in-memory-unit-of-work.js` |
| Hash de contraseñas | `ServicioDeHash` | `security/bcrypt-password-hasher.js` | `security/in-memory-password-hasher.js` |
| Tokens de sesión | `ServicioDeTokens` | `security/jwt-token-service.js` | `security/in-memory-token-service.js` |
| Identificadores | `GeneradorDeIds` | `ids/crypto-id-generator.js` | `ids/in-memory-id-generator.js` |
| Reloj | `Reloj` | `clock/system-clock.js` | `clock/fixed-clock.js` |
| Mapas / recorrido | `EstimadorDeRecorrido` | pendiente | pendiente |
| Búsqueda geográfica | `Zonas` y `BuscadorDeChoferesCercanos` | pendiente | pendiente |
| Cobro simulado | `SimuladorDeCobro` | pendiente | pendiente |
| Tiempo real | `Notificador` | pendiente | pendiente |
| Almacenamiento | `AlmacenamientoDeArchivos` | pendiente | pendiente |

Los adaptadores de mapas, pagos y notificaciones se agregan cuando exista el
caso de uso que los consuma. No se crean stubs vacíos para evitar código muerto.
