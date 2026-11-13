-- Cobros simulados. Un viaje tiene como máximo un cobro.
-- `viaje_id` UNIQUE es la segunda línea de defensa de la idempotencia natural
-- del cobro; la primera es la clave de idempotencia de la operación.

CREATE TABLE IF NOT EXISTS cobros_simulados (
  id UUID PRIMARY KEY,
  viaje_id UUID NOT NULL UNIQUE REFERENCES viajes (id),
  monto_centavos INTEGER NOT NULL CHECK (monto_centavos >= 0),
  estado VARCHAR(20) NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL,
  cobrado_en TIMESTAMPTZ,
  referencia VARCHAR(100),
  CONSTRAINT cobros_simulados_estado_check CHECK (estado IN ('PENDIENTE', 'COBRADO')),
  CONSTRAINT cobros_simulados_coherencia_check CHECK (
    (estado = 'PENDIENTE' AND cobrado_en IS NULL AND referencia IS NULL)
    OR (estado = 'COBRADO' AND cobrado_en IS NOT NULL AND referencia IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS cobros_simulados_estado_idx
  ON cobros_simulados (estado);
