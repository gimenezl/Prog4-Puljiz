# Puertos de salida

Los puertos describen lo que la aplicación necesita del exterior. No importan
Express, el driver de PostgreSQL ni ningún adaptador concreto.

Reglas:

1. Toda dependencia externa entra por un puerto.
2. Cada puerto tiene al menos dos adaptadores: uno real y uno falso o en memoria
   para los tests.
3. El único archivo que decide qué adaptador se usa es `src/composition-root.js`,
   a través de `ADAPTERS_MODE` (`real` o `fake`).
4. Los contratos se documentan con JSDoc y se validan en los tests de integración
   y de arquitectura.

Puertos previstos: `BaseDeDatos`, `Reloj`, `GeneradorDeIds`, `RepositorioUsuarios`,
`RepositorioChoferes`, `RepositorioViajes`, `RepositorioClavesIdempotencia`,
`ServicioDeHash`, `ServicioDeTokens`, `UnidadDeTrabajo`, repositorios por agregado,
`EstimadorDeRecorrido`, `Zonas`, `BuscadorDeChoferesCercanos`, `SimuladorDeCobro`,
`Notificador` y `AlmacenamientoDeArchivos`.
