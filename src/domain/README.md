# Dominio

Contiene las entidades, objetos de valor, servicios y errores del modelo de
negocio. Es la capa más interna y no conoce tecnología.

Reglas obligatorias:

- No importa Express, `pg`, `pino`, `dotenv`, `helmet`, `cors` ni ningún
  adaptador de `src/infrastructure`.
- No importa `src/application` ni `src/composition-root.js`.
- No accede a la base de datos, al sistema de archivos, a la red ni al reloj
  del sistema. El tiempo llega por el puerto `Reloj`.
- La lógica de precios, multiplicadores y transiciones de estado es pura:
  recibe datos y devuelve un resultado.

Organización prevista:

- `entities/`: Usuario, Chofer, Vehiculo, UbicacionChofer, ZonaDeDemanda,
  ReglaDeMultiplicador, Tarifa, MultiplicadorDeZona, Cotizacion, Viaje, Oferta,
  CobroSimulado y ClaveDeIdempotencia.
- `value-objects/`: Dinero, PuntoGeografico, Identificador, etc.
- `services/`: funciones puras como `calcularMultiplicador`, `calcularPrecio`
  y las transiciones de estado.
- `errors/`: motivos de rechazo del dominio (`TRANSICION_INVALIDA`,
  `OFERTA_VENCIDA`, etc.).
