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
