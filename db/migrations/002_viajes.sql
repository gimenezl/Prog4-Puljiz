-- Viajes, perfiles operativos de chofer y claves de idempotencia.
-- El orden de creación respeta las referencias: usuarios -> viajes -> choferes.

CREATE TABLE IF NOT EXISTS viajes (
  id UUID PRIMARY KEY,
  pasajero_id UUID NOT NULL REFERENCES usuarios (id),
  origen_lat DOUBLE PRECISION NOT NULL CHECK (origen_lat BETWEEN -90 AND 90),
  origen_lng DOUBLE PRECISION NOT NULL CHECK (origen_lng BETWEEN -180 AND 180),
  destino_lat DOUBLE PRECISION NOT NULL CHECK (destino_lat BETWEEN -90 AND 90),
  destino_lng DOUBLE PRECISION NOT NULL CHECK (destino_lng BETWEEN -180 AND 180),
  distancia_estimada_m INTEGER NOT NULL CHECK (distancia_estimada_m > 0),
  precio_fijado_centavos INTEGER NOT NULL CHECK (precio_fijado_centavos >= 0),
  chofer_id UUID REFERENCES usuarios (id),
  estado VARCHAR(30) NOT NULL,
  solicitado_en TIMESTAMPTZ NOT NULL,
  asignado_en TIMESTAMPTZ,
  cerrado_en TIMESTAMPTZ,
  cancelado_por_id UUID REFERENCES usuarios (id),
  motivo_cancelacion VARCHAR(500),
  CONSTRAINT viajes_estado_check CHECK (
    estado IN (
      'SOLICITADO',
      'ASIGNADO',
      'CHOFER_EN_CAMINO',
      'EN_CURSO',
      'FINALIZADO',
      'CANCELADO_POR_PASAJERO',
      'CANCELADO_POR_CHOFER',
      'CANCELADO_POR_SOPORTE',
      'SIN_CHOFERES_DISPONIBLES'
    )
  ),
  CONSTRAINT viajes_chofer_coherente_check CHECK (
    (estado IN ('SOLICITADO', 'SIN_CHOFERES_DISPONIBLES') AND chofer_id IS NULL)
    OR (
      estado IN ('ASIGNADO', 'CHOFER_EN_CAMINO', 'EN_CURSO', 'FINALIZADO')
      AND chofer_id IS NOT NULL
    )
    OR estado IN ('CANCELADO_POR_PASAJERO', 'CANCELADO_POR_CHOFER', 'CANCELADO_POR_SOPORTE')
  ),
  CONSTRAINT viajes_cancelacion_check CHECK (
    estado NOT IN ('CANCELADO_POR_PASAJERO', 'CANCELADO_POR_CHOFER', 'CANCELADO_POR_SOPORTE')
    OR (motivo_cancelacion IS NOT NULL AND cerrado_en IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS viajes_estado_solicitado_en_idx
  ON viajes (estado, solicitado_en);

-- Segunda línea de defensa de I2: un chofer no puede tener dos viajes activos.
CREATE UNIQUE INDEX IF NOT EXISTS viajes_chofer_activo_idx
  ON viajes (chofer_id)
  WHERE chofer_id IS NOT NULL
    AND estado IN ('ASIGNADO', 'CHOFER_EN_CAMINO', 'EN_CURSO');

CREATE TABLE IF NOT EXISTS choferes (
  usuario_id UUID PRIMARY KEY REFERENCES usuarios (id) ON DELETE CASCADE,
  habilitado BOOLEAN NOT NULL DEFAULT false,
  disponible BOOLEAN NOT NULL DEFAULT false,
  viaje_activo_id UUID UNIQUE REFERENCES viajes (id),
  CONSTRAINT choferes_disponibilidad_check CHECK (NOT disponible OR habilitado)
);

CREATE TABLE IF NOT EXISTS claves_idempotencia (
  alcance VARCHAR(200) NOT NULL,
  clave VARCHAR(255) NOT NULL,
  hash_contenido CHAR(64) NOT NULL,
  respuesta JSONB NOT NULL,
  creada_en TIMESTAMPTZ NOT NULL,
  vence_en TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (alcance, clave)
);

CREATE INDEX IF NOT EXISTS claves_idempotencia_vence_en_idx
  ON claves_idempotencia (vence_en);
