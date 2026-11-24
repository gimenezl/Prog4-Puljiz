-- Origen del viaje como punto PostGIS (RF-06, ADR-0006).
--
-- Es una columna GENERADA: PostgreSQL la calcula sola a partir de origen_lat y
-- origen_lng en cada INSERT o UPDATE, así que el código no la escribe nunca y
-- no puede quedar desincronizada. Los viajes existentes se completan al
-- agregar la columna.
--
-- El índice es parcial: solo indexa los viajes SOLICITADO, que son los únicos
-- que se buscan por cercanía. Así el índice no crece con el historial.

ALTER TABLE viajes
  ADD COLUMN IF NOT EXISTS origen geography(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(origen_lng, origen_lat), 4326)::geography) STORED;

CREATE INDEX IF NOT EXISTS viajes_origen_solicitados_idx
  ON viajes USING GIST (origen)
  WHERE estado = 'SOLICITADO';
