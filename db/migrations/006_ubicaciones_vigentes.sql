-- Ubicación vigente de cada chofer (RF-03, docs/modelo.md §4.4, ADR-0006).
-- Una fila por chofer que se reemplaza con cada envío. El historial del
-- recorrido (RF-20) va en otra tabla para no agrandar este índice.
--
-- geography(Point, 4326): punto sobre la Tierra en el sistema del GPS. Las
-- distancias se calculan en metros reales. El índice GiST permite buscar
-- choferes cercanos sin recorrer toda la tabla (RF-06).

CREATE TABLE IF NOT EXISTS ubicaciones_vigentes (
  chofer_id UUID PRIMARY KEY REFERENCES choferes (usuario_id) ON DELETE CASCADE,
  posicion geography(Point, 4326) NOT NULL,
  actualizada_en TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS ubicaciones_vigentes_posicion_idx
  ON ubicaciones_vigentes USING GIST (posicion);
