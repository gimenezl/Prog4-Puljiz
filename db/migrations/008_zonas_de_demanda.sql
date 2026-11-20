-- Zonas de demanda (RF-23, docs/modelo.md §4.5 y §3).
--
-- Una zona se desactiva, nunca se borra: las cotizaciones y viajes históricos
-- la referencian. El criterio geográfico se guarda como área PostGIS, tal como
-- propone el ADR-0006: geography(Polygon, 4326) con índice GiST y ST_Covers
-- para ubicar un punto.
--
-- I16: dos zonas activas no pueden solaparse. Se refuerza con un trigger que
-- usa ST_Intersects. También rechaza que compartan solamente un borde, porque
-- ST_Covers considera que un punto del borde pertenece a ambas zonas.

CREATE TABLE IF NOT EXISTS zonas_de_demanda (
  id UUID PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  area geography(Polygon, 4326) NOT NULL,
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  creada_en TIMESTAMPTZ NOT NULL,
  CONSTRAINT zonas_de_demanda_nombre_check CHECK (
    nombre = btrim(nombre)
    AND length(nombre) BETWEEN 1 AND 100
  ),
  CONSTRAINT zonas_de_demanda_area_check CHECK (
    NOT ST_IsEmpty(area::geometry)
    AND ST_IsValid(area::geometry)
  )
);

-- El nombre identifica a la zona para el administrador: no distinguimos
-- mayúsculas de minúsculas y evitamos duplicados por espacios accidentales.
CREATE UNIQUE INDEX IF NOT EXISTS zonas_de_demanda_nombre_lower_idx
  ON zonas_de_demanda (LOWER(nombre));

-- Búsqueda de pertenencia: ST_Covers(area, punto) con índice GiST.
CREATE INDEX IF NOT EXISTS zonas_de_demanda_area_idx
  ON zonas_de_demanda USING GIST (area);

CREATE INDEX IF NOT EXISTS zonas_de_demanda_activa_idx
  ON zonas_de_demanda (activa);

CREATE OR REPLACE FUNCTION zonas_de_demanda_proteger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las zonas de demanda no se eliminan; se desactivan.'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- La identidad y el alta son inmutables: una zona puede cambiar de nombre,
    -- área o estado, pero no convertirse en otra zona.
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.creada_en IS DISTINCT FROM OLD.creada_en THEN
      RAISE EXCEPTION 'El id y la fecha de creación de una zona de demanda son inmutables.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NOT ST_IsValid(NEW.area::geometry) OR ST_IsEmpty(NEW.area::geometry) THEN
    RAISE EXCEPTION 'El área de la zona de demanda no es un polígono válido y no vacío.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.activa THEN
    -- Serializa altas, reactivaciones y cambios de área para que dos
    -- transacciones concurrentes no puedan crear zonas activas superpuestas.
    PERFORM pg_advisory_xact_lock(hashtext('zonas_de_demanda_solapamiento'));

    IF EXISTS (
      SELECT 1
        FROM zonas_de_demanda z
       WHERE z.id <> NEW.id
         AND z.activa
         AND ST_Intersects(z.area, NEW.area)
    ) THEN
      RAISE EXCEPTION 'La zona de demanda se solapa con otra zona activa.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zonas_de_demanda_proteger_trigger ON zonas_de_demanda;

CREATE TRIGGER zonas_de_demanda_proteger_trigger
BEFORE INSERT OR UPDATE OR DELETE ON zonas_de_demanda
FOR EACH ROW
EXECUTE FUNCTION zonas_de_demanda_proteger();
