# TP Programación IV — Plataforma de viajes

Trabajo práctico final de **Programación IV** de la **Universidad Tecnológica Nacional (UTN)**.

## De qué se trata

Backend de una plataforma de viajes estilo transporte urbano, desarrollado en **Node.js con Express**. Corresponde a la sección 6 del enunciado, con la variante de **precio dinámico**: el precio de cada viaje se ajusta con un multiplicador según la demanda de la zona.

La plataforma permite:

- Registro e inicio de sesión de pasajeros, choferes, administradores y operadores de soporte, con permisos por rol.
- Multiplicador por demanda en cada zona, calculado en el servidor con una regla configurable y auditable.
- Estimación de precio y tiempo antes de confirmar; el pasajero paga exactamente el precio que vio, aunque la demanda cambie después.
- Solicitud de viajes y búsqueda de choferes cercanos.
- Ofertas con vencimiento, aceptación exclusiva y cancelaciones resueltas correctamente aunque ocurran al mismo tiempo.
- Seguimiento del viaje en tiempo real, tarifa final y cobro simulado.
- Historial de viajes y operador de soporte.

## Organización

Todas las tareas, ordenadas por etapa y con sus dependencias, están en el tablero de Trello:

https://trello.com/b/88WLBizE/prog4-tp-puljizzz

## Integrantes — Grupo 7

- Lucas Gimenez
- Guido Ayala
- Enzo Vernet

## Stack

- Node.js 22 LTS con ESM estricto (`import` / `export`, sin CommonJS).
- Express 5.
- PostgreSQL 15.
- pnpm.
- Arquitectura hexagonal (dominio, aplicación con puertos y adaptadores, infraestructura).

## Estructura

```text
src/
├── domain/                 # Entidades, objetos de valor, reglas puras y errores
├── application/
│   ├── use-cases/          # Casos de uso
│   └── ports/
│       ├── in/             # Contratos de entrada
│       └── out/            # Contratos de salida (reloj, repositorios, mapas, pagos…)
├── infrastructure/
│   ├── adapters/
│   │   ├── in/http/        # Adaptador de entrada Express
│   │   └── out/            # Adaptadores reales y falsos (PostgreSQL, reloj…)
│   ├── config/             # Validación de variables de entorno
│   └── logging/            # Logger estructurado
├── composition-root.js     # Único punto que crea e inyecta adaptadores
└── main.js                 # Arranque y cierre ordenado del proceso
```

El dominio no importa Express, el driver de PostgreSQL ni ninguna librería de
infraestructura. Esa regla se verifica en `tests/architecture/boundaries.test.js`.
Cada dependencia externa entra por un puerto con un adaptador real y uno falso o
en memoria. El adaptador se elige con `ADAPTERS_MODE` (`real` o `fake`) y el
único archivo que lo decide es `src/composition-root.js`.

## Puesta en marcha

Requisitos: Node.js 22 LTS, pnpm y Docker.

```bash
cp .env.example .env
pnpm install
pnpm db:up
pnpm dev
```

El servidor queda disponible en `http://localhost:3000` y el chequeo de
infraestructura en `http://localhost:3000/health`.

Para ejecutar sin base de datos, usar `ADAPTERS_MODE=fake` en `.env`.

## Comandos

```bash
pnpm dev            # Servidor con recarga automática
pnpm start          # Servidor en modo normal
pnpm test           # Tests de arquitectura, integración y configuración
pnpm lint           # Análisis estático
pnpm format         # Formateo con Prettier
pnpm db:up          # Levanta PostgreSQL con Docker Compose
pnpm db:down        # Detiene PostgreSQL
```

