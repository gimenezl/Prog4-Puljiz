-- Reglas de multiplicador versionadas (RF-16, RF-23, docs/modelo.md §4.6).
--
-- La fórmula vigente es LINEAL_POR_TRAMOS (§7.1). El ciclo de vida y la
-- inmutabilidad de las versiones publicadas son los mismos que en tarifas
-- (I12). Los decimales se guardan como NUMERIC de escala fija, nunca como
-- punto flotante.

CREATE TABLE IF NOT EXISTS reglas_multiplicador (
  id UUID PRIMARY KEY,
  estado VARCHAR(10) NOT NULL DEFAULT 'BORRADOR',
  version INTEGER,
  formula VARCHAR(30) NOT NULL DEFAULT 'LINEAL_POR_TRAMOS',
  umbral_inferior NUMERIC(12, 4) NOT NULL,
  umbral_superior NUMERIC(12, 4) NOT NULL,
  multiplicador_minimo NUMERIC(6, 4) NOT NULL,
  multiplicador_maximo NUMERIC(6, 4) NOT NULL,
  escala_multiplicador SMALLINT NOT NULL,
  vigente_desde TIMESTAMPTZ,
  motivo VARCHAR(500),
  publicada_por_id UUID REFERENCES usuarios (id),
  publicada_en TIMESTAMPTZ,
  creada_en TIMESTAMPTZ NOT NULL,
  CONSTRAINT reglas_multiplicador_estado_check CHECK (
    estado IN ('BORRADOR', 'PUBLICADA')
  ),
  CONSTRAINT reglas_multiplicador_formula_check CHECK (
    formula IN ('LINEAL_POR_TRAMOS')
  ),
  CONSTRAINT reglas_multiplicador_umbrales_check CHECK (
    umbral_inferior >= 0
    AND umbral_superior > umbral_inferior
  ),
  CONSTRAINT reglas_multiplicador_rango_check CHECK (
    multiplicador_minimo >= 1
    AND multiplicador_maximo >= multiplicador_minimo
  ),
  CONSTRAINT reglas_multiplicador_escala_check CHECK (
    escala_multiplicador BETWEEN 0 AND 4
  ),
  CONSTRAINT reglas_multiplicador_motivo_check CHECK (
    motivo IS NULL
    OR (
      motivo = btrim(motivo)
      AND length(motivo) BETWEEN 1 AND 500
    )
  ),
  CONSTRAINT reglas_multiplicador_version_coherente_check CHECK (
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
  CONSTRAINT reglas_multiplicador_vigencia_check CHECK (
    vigente_desde IS NULL
    OR publicada_en IS NULL
    OR vigente_desde >= publicada_en
  ),
  CONSTRAINT reglas_multiplicador_publicacion_check CHECK (
    publicada_en IS NULL
    OR publicada_en >= creada_en
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS reglas_multiplicador_version_publicada_idx
  ON reglas_multiplicador (version)
  WHERE estado = 'PUBLICADA';

CREATE INDEX IF NOT EXISTS reglas_multiplicador_publicadas_vigencia_idx
  ON reglas_multiplicador (vigente_desde, version DESC)
  WHERE estado = 'PUBLICADA';

DROP TRIGGER IF EXISTS reglas_multiplicador_configuracion_versionada_trigger ON reglas_multiplicador;

CREATE TRIGGER reglas_multiplicador_configuracion_versionada_trigger
BEFORE INSERT OR UPDATE OR DELETE ON reglas_multiplicador
FOR EACH ROW
EXECUTE FUNCTION configuracion_versionada_proteger();
