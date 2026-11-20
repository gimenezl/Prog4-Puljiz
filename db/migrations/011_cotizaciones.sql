-- Cotizaciones inmutables y precio fijado en el viaje (ADR-0005, RF-16 a RF-19).
--
-- La cotización es una foto: todos sus atributos se fijan al crearla y solo
-- cambia `estado` (I11). Guarda las entradas del cálculo y la versión de la
-- regla y la tarifa usadas para poder reproducirlo (I18).

CREATE TABLE IF NOT EXISTS cotizaciones (
  id UUID PRIMARY KEY,
  pasajero_id UUID NOT NULL REFERENCES usuarios (id),
  origen_lat DOUBLE PRECISION NOT NULL CHECK (origen_lat BETWEEN -90 AND 90),
  origen_lng DOUBLE PRECISION NOT NULL CHECK (origen_lng BETWEEN -180 AND 180),
  destino_lat DOUBLE PRECISION NOT NULL CHECK (destino_lat BETWEEN -90 AND 90),
  destino_lng DOUBLE PRECISION NOT NULL CHECK (destino_lng BETWEEN -180 AND 180),
  distancia_estimada_m INTEGER NOT NULL CHECK (distancia_estimada_m > 0),
  tiempo_estimado_s INTEGER NOT NULL CHECK (tiempo_estimado_s >= 0),
  zona_id UUID NOT NULL REFERENCES zonas_de_demanda (id),
  solicitudes_usadas INTEGER NOT NULL CHECK (solicitudes_usadas >= 0),
  choferes_disponibles_usados INTEGER NOT NULL CHECK (choferes_disponibles_usados >= 0),
  regla_id UUID NOT NULL REFERENCES reglas_multiplicador (id),
  regla_version INTEGER NOT NULL CHECK (regla_version > 0),
  tarifa_id UUID NOT NULL REFERENCES tarifas (id),
  tarifa_version INTEGER NOT NULL CHECK (tarifa_version > 0),
  multiplicador NUMERIC(6, 4) NOT NULL CHECK (multiplicador >= 1),
  precio_centavos INTEGER NOT NULL CHECK (precio_centavos >= 0),
  parametros_conteo JSONB NOT NULL DEFAULT '{}'::jsonb,
  calculada_en TIMESTAMPTZ NOT NULL,
  vence_en TIMESTAMPTZ NOT NULL,
  estado VARCHAR(10) NOT NULL DEFAULT 'VIGENTE',
  CONSTRAINT cotizaciones_estado_check CHECK (estado IN ('VIGENTE', 'CONFIRMADA', 'VENCIDA')),
  CONSTRAINT cotizaciones_vigencia_check CHECK (vence_en > calculada_en)
);

CREATE INDEX IF NOT EXISTS cotizaciones_pasajero_id_idx
  ON cotizaciones (pasajero_id);

CREATE INDEX IF NOT EXISTS cotizaciones_zona_calculada_idx
  ON cotizaciones (zona_id, calculada_en DESC);

CREATE INDEX IF NOT EXISTS cotizaciones_estado_vence_idx
  ON cotizaciones (estado, vence_en);

-- Los viajes históricos no tienen cotización: la columna es nullable por ese
-- motivo. Los viajes nuevos siempre la reciben y el multiplicador se fija al
-- confirmar; el DEFAULT 1.0000 solo cubre las filas anteriores a esta migración.
ALTER TABLE viajes
  ADD COLUMN IF NOT EXISTS cotizacion_id UUID,
  ADD COLUMN IF NOT EXISTS multiplicador_fijado NUMERIC(6, 4) NOT NULL DEFAULT 1.0000;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'viajes_cotizacion_id_fkey'
  ) THEN
    ALTER TABLE viajes
      ADD CONSTRAINT viajes_cotizacion_id_fkey
      FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'viajes_cotizacion_id_key'
  ) THEN
    ALTER TABLE viajes ADD CONSTRAINT viajes_cotizacion_id_key UNIQUE (cotizacion_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'viajes_multiplicador_fijado_check'
  ) THEN
    ALTER TABLE viajes
      ADD CONSTRAINT viajes_multiplicador_fijado_check
      CHECK (multiplicador_fijado >= 1);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION cotizaciones_proteger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM viajes WHERE cotizacion_id = OLD.id) THEN
      RAISE EXCEPTION 'La cotización ya generó un viaje y no se puede eliminar.'
        USING ERRCODE = '23514';
    END IF;

    RETURN OLD;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.pasajero_id IS DISTINCT FROM OLD.pasajero_id
     OR NEW.origen_lat IS DISTINCT FROM OLD.origen_lat
     OR NEW.origen_lng IS DISTINCT FROM OLD.origen_lng
     OR NEW.destino_lat IS DISTINCT FROM OLD.destino_lat
     OR NEW.destino_lng IS DISTINCT FROM OLD.destino_lng
     OR NEW.distancia_estimada_m IS DISTINCT FROM OLD.distancia_estimada_m
     OR NEW.tiempo_estimado_s IS DISTINCT FROM OLD.tiempo_estimado_s
     OR NEW.zona_id IS DISTINCT FROM OLD.zona_id
     OR NEW.solicitudes_usadas IS DISTINCT FROM OLD.solicitudes_usadas
     OR NEW.choferes_disponibles_usados IS DISTINCT FROM OLD.choferes_disponibles_usados
     OR NEW.regla_id IS DISTINCT FROM OLD.regla_id
     OR NEW.regla_version IS DISTINCT FROM OLD.regla_version
     OR NEW.tarifa_id IS DISTINCT FROM OLD.tarifa_id
     OR NEW.tarifa_version IS DISTINCT FROM OLD.tarifa_version
     OR NEW.multiplicador IS DISTINCT FROM OLD.multiplicador
     OR NEW.precio_centavos IS DISTINCT FROM OLD.precio_centavos
     OR NEW.parametros_conteo IS DISTINCT FROM OLD.parametros_conteo
     OR NEW.calculada_en IS DISTINCT FROM OLD.calculada_en
     OR NEW.vence_en IS DISTINCT FROM OLD.vence_en THEN
    RAISE EXCEPTION 'La cotización es inmutable; solo cambia su estado.'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.estado <> 'VIGENTE' OR NEW.estado NOT IN ('CONFIRMADA', 'VENCIDA') THEN
    RAISE EXCEPTION 'Transición de estado de cotización no permitida.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cotizaciones_proteger_trigger ON cotizaciones;

CREATE TRIGGER cotizaciones_proteger_trigger
BEFORE UPDATE OR DELETE ON cotizaciones
FOR EACH ROW
EXECUTE FUNCTION cotizaciones_proteger();
