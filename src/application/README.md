# Aplicación

Orquesta los casos de uso y define los puertos de entrada y salida.

Reglas obligatorias:

- No importa Express, `pg`, `pino`, `dotenv`, `helmet`, `cors` ni adaptadores
  concretos de `src/infrastructure`.
- Depende del dominio y de sus propios puertos.
- Los casos de uso reciben sus dependencias por inyección; no construyen
  adaptadores.
- La validación de entrada y la sanitización de datos se hace en el borde
  (adaptador HTTP o caso de uso), nunca confiando en el cliente.

Organización prevista:

- `use-cases/`: un archivo por operación (registrar usuario, cotizar, confirmar,
  aceptar oferta, cancelar, finalizar, etc.).
- `ports/in/`: contratos que expone la aplicación.
- `ports/out/`: contratos que la aplicación necesita del exterior.
