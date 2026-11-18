-- PostGIS: tipos y funciones geográficas (ADR-0006).
-- Lo usan la ubicación vigente de los choferes (RF-03) y las zonas de demanda
-- (RF-16). Requiere la imagen postgis/postgis en Docker.
-- La extensión crea la tabla spatial_ref_sys en el esquema public.

CREATE EXTENSION IF NOT EXISTS postgis;
