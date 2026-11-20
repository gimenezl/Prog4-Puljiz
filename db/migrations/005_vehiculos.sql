-- Vehículo de cada chofer (RF-02, docs/modelo.md §4.3).
-- Un chofer tiene a lo sumo un vehículo y una patente pertenece a un solo
-- vehículo: las dos reglas las garantiza la base con restricciones UNIQUE.

CREATE TABLE IF NOT EXISTS vehiculos (
  id UUID PRIMARY KEY,
  chofer_id UUID NOT NULL REFERENCES choferes (usuario_id) ON DELETE CASCADE,
  patente VARCHAR(7) NOT NULL,
  marca VARCHAR(50) NOT NULL,
  modelo VARCHAR(50) NOT NULL,
  anio SMALLINT,
  color VARCHAR(50),
  CONSTRAINT vehiculos_chofer_unico UNIQUE (chofer_id),
  CONSTRAINT vehiculos_patente_unica UNIQUE (patente),
  CONSTRAINT vehiculos_anio_check CHECK (anio IS NULL OR anio BETWEEN 1950 AND 2100)
);
