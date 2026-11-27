-- RF-09: instante de inicio del viaje y coherencia de tiempos por estado.
-- La migración es idempotente: se puede aplicar varias veces sobre la misma base.

ALTER TABLE viajes ADD COLUMN IF NOT EXISTS iniciado_en TIMESTAMPTZ;

-- Backfill de filas históricas. Antes de esta migración el viaje pasaba de
-- ASIGNADO a FINALIZADO sin registrar el inicio; se usa la asignación como
-- aproximación para no romper los checks nuevos.
UPDATE viajes
   SET iniciado_en = COALESCE(asignado_en, solicitado_en)
 WHERE estado IN ('EN_CURSO', 'FINALIZADO')
   AND iniciado_en IS NULL;

UPDATE viajes
   SET cerrado_en = COALESCE(cerrado_en, iniciado_en, asignado_en, solicitado_en)
 WHERE estado = 'FINALIZADO'
   AND cerrado_en IS NULL;

-- EN_CURSO y FINALIZADO exigen iniciado_en. Los estados previos al inicio lo
-- prohíben. Los cancelados lo admiten nulo o no nulo (soporte podría cancelar
-- un viaje ya iniciado en una tarjeta futura).
ALTER TABLE viajes DROP CONSTRAINT IF EXISTS viajes_iniciado_check;
ALTER TABLE viajes ADD CONSTRAINT viajes_iniciado_check CHECK (
  (estado IN ('EN_CURSO', 'FINALIZADO') AND iniciado_en IS NOT NULL)
  OR (
    estado IN ('SOLICITADO', 'ASIGNADO', 'CHOFER_EN_CAMINO', 'SIN_CHOFERES_DISPONIBLES')
    AND iniciado_en IS NULL
  )
  OR estado IN ('CANCELADO_POR_PASAJERO', 'CANCELADO_POR_CHOFER', 'CANCELADO_POR_SOPORTE')
);

-- FINALIZADO exige cerrado_en. Los cancelados ya lo exigen en
-- viajes_cancelacion_check; SIN_CHOFERES_DISPONIBLES se deja para RF-22.
ALTER TABLE viajes DROP CONSTRAINT IF EXISTS viajes_cierre_check;
ALTER TABLE viajes ADD CONSTRAINT viajes_cierre_check CHECK (
  estado NOT IN (
    'FINALIZADO',
    'CANCELADO_POR_PASAJERO',
    'CANCELADO_POR_CHOFER',
    'CANCELADO_POR_SOPORTE'
  )
  OR cerrado_en IS NOT NULL
);

-- Los estados cancelados exigen autor. El resto no debe conservar un autor de
-- cancelación de una transición anterior.
ALTER TABLE viajes DROP CONSTRAINT IF EXISTS viajes_cancelacion_autor_check;
ALTER TABLE viajes ADD CONSTRAINT viajes_cancelacion_autor_check CHECK (
  (
    estado IN ('CANCELADO_POR_PASAJERO', 'CANCELADO_POR_CHOFER', 'CANCELADO_POR_SOPORTE')
    AND cancelado_por_id IS NOT NULL
  )
  OR (
    estado NOT IN ('CANCELADO_POR_PASAJERO', 'CANCELADO_POR_CHOFER', 'CANCELADO_POR_SOPORTE')
    AND cancelado_por_id IS NULL
  )
);

-- Una cancelación por chofer siempre conserva al chofer como historial.
ALTER TABLE viajes DROP CONSTRAINT IF EXISTS viajes_cancelado_por_chofer_check;
ALTER TABLE viajes ADD CONSTRAINT viajes_cancelado_por_chofer_check CHECK (
  estado <> 'CANCELADO_POR_CHOFER' OR chofer_id IS NOT NULL
);
