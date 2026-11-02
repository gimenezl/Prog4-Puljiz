# Infraestructura

Contiene los adaptadores y la configuración técnica. Es la única capa que conoce
Express, PostgreSQL, el sistema operativo y las librerías externas.

Estructura:

- `adapters/in/http/`: adaptador de entrada HTTP (Express).
- `adapters/out/`: adaptadores de salida (persistencia, reloj, mapas, pagos,
  notificaciones, almacenamiento).
- `config/`: carga y validación de variables de entorno.
- `logging/`: logger estructurado.

Reglas:

- Los adaptadores implementan los puertos definidos en
  `src/application/ports/out`.
- Cada dependencia externa tiene un adaptador real y uno falso o en memoria.
- Ningún adaptador decide reglas de negocio.
- `src/composition-root.js` es el único archivo que crea adaptadores concretos
  y los inyecta.
