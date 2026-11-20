-- Tarifas globales versionadas (RF-23, docs/modelo.md §4.7).
--
-- Ciclo de vida: BORRADOR -> PUBLICADA. Una tarifa publicada es inmutable
-- (I12); modificarla exige crear otro borrador y publicarlo.
-- Los importes se guardan en la unidad menor de la moneda (centavos), nunca
-- en punto flotante (§4, convenciones de tipos).

CREATE TABLE IF NOT EXISTS tarifas (
  id UUID PRIMARY KEY,
  estado VARCHAR(10) NOT NULL DEFAULT 'BORRADOR',
  version INTEGER,
  base_centavos INTEGER NOT NULL,
  por_km_centavos INTEGER NOT NULL,
  por_minuto_centavos INTEGER NOT NULL,
  precio_maximo_centavos INTEGER NOT NULL,
  vigente_desde TIMESTAMPTZ,
  publicada_por_id UUID REFERENCES usuarios (id),
  publicada_en TIMESTAMPTZ,
  creada_en TIMESTAMPTZ NOT NULL,
  CONSTRAINT tarifas_estado_check CHECK (
    estado IN ('BORRADOR', 'PUBLICADA')
  ),
  CONSTRAINT tarifas_importes_check CHECK (
    base_centavos >= 0
    AND por_km_centavos >= 0
    AND por_minuto_centavos >= 0
  ),
  CONSTRAINT tarifas_precio_maximo_check CHECK (
    precio_maximo_centavos >= base_centavos
  ),
  CONSTRAINT tarifas_version_coherente_check CHECK (
    (
      estado = 'BORRADOR'
      AND version IS NULL
      AND vigente_desde IS NULL
      AND publicada_por_id IS NULL
      AND publicada_en IS NULL
    )
    OR (
      estado = 'PUBLICADA'
      AND version IS NOT NULL
      AND version > 0
      AND vigente_desde IS NOT NULL
      AND publicada_por_id IS NOT NULL
      AND publicada_en IS NOT NULL
    )
  ),
  CONSTRAINT tarifas_vigencia_check CHECK (
    vigente_desde IS NULL
    OR publicada_en IS NULL
    OR vigente_desde >= publicada_en
  ),
  CONSTRAINT tarifas_publicacion_check CHECK (
    publicada_en IS NULL
    OR publicada_en >= creada_en
  )
);

-- Cada versión publicada tiene un consecutivo único. Los borradores quedan
-- fuera del índice porque su version es NULL.
CREATE UNIQUE INDEX IF NOT EXISTS tarifas_version_publicada_idx
  ON tarifas (version)
  WHERE estado = 'PUBLICADA';

-- Búsqueda de la tarifa vigente: la publicada de mayor versión cuya vigencia
-- ya comenzó (docs/modelo.md §4.7).
CREATE INDEX IF NOT EXISTS tarifas_publicadas_vigencia_idx
  ON tarifas (vigente_desde, version DESC)
  WHERE estado = 'PUBLICADA';

DROP TRIGGER IF EXISTS tarifas_configuracion_versionada_trigger ON tarifas;

CREATE TRIGGER tarifas_configuracion_versionada_trigger
BEFORE INSERT OR UPDATE OR DELETE ON tarifas
FOR EACH ROW
EXECUTE FUNCTION configuracion_versionada_proteger();
