-- Índices para el historial de viajes (RF-14) y el listado de soporte (RF-15).
--
-- El historial pagina por cursor: «los viajes del usuario anteriores a
-- (solicitado_en, id)», del más nuevo al más viejo. Con estos índices la base
-- salta directo a ese punto sin leer las páginas anteriores, sea cual sea la
-- página. Un usuario participa como pasajero o como chofer, por eso hay uno
-- por cada columna.
--
-- El listado de viajes activos para soporte ya tiene viajes_estado_solicitado_en_idx
-- (migración 002).

CREATE INDEX IF NOT EXISTS viajes_pasajero_historial_idx
  ON viajes (pasajero_id, solicitado_en DESC, id DESC);

CREATE INDEX IF NOT EXISTS viajes_chofer_historial_idx
  ON viajes (chofer_id, solicitado_en DESC, id DESC)
  WHERE chofer_id IS NOT NULL;
