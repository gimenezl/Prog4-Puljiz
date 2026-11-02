# Adaptadores de salida

Cada dependencia externa debe tener un adaptador real y otro falso o en memoria
para los tests. El composition root elige uno u otro con `ADAPTERS_MODE`.

| Dependencia | Puerto | Adaptador real | Adaptador falso |
|---|---|---|---|
| Base de datos | Repositorios / UnidadDeTrabajo | `persistence/postgres-database.js` | `persistence/in-memory-database.js` |
| Reloj | `Reloj` | `clock/system-clock.js` | `clock/fixed-clock.js` |
| Mapas / recorrido | `EstimadorDeRecorrido` | pendiente | pendiente |
| Búsqueda geográfica | `Zonas` y `BuscadorDeChoferesCercanos` | pendiente | pendiente |
| Cobro simulado | `SimuladorDeCobro` | pendiente | pendiente |
| Tiempo real | `Notificador` | pendiente | pendiente |
| Almacenamiento | `AlmacenamientoDeArchivos` | pendiente | pendiente |

Los adaptadores de mapas, pagos y notificaciones se agregan cuando exista el
caso de uso que los consuma. No se crean stubs vacíos para evitar código muerto.
