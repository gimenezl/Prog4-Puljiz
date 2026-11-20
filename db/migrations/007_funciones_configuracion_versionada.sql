-- Funciones compartidas por las entidades de configuración administrativa
-- (RF-23): tarifas y reglas de multiplicador.
--
-- El modelo exige que una configuración publicada sea inmutable (I12) y que
-- cada publicación genere una versión consecutiva. Estas reglas se refuerzan
-- en la base para que no dependan solamente del caso de uso.

CREATE OR REPLACE FUNCTION configuracion_versionada_proteger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  siguiente_version INTEGER;
BEGIN
  -- Las versiones publicadas son historia: no se borran.
  IF TG_OP = 'DELETE' THEN
    IF OLD.estado = 'PUBLICADA' THEN
      RAISE EXCEPTION 'No se puede eliminar una versión publicada de %.', TG_TABLE_NAME
        USING ERRCODE = '23514';
    END IF;

    RETURN OLD;
  END IF;

  -- Una publicación es inmutable. Cambiarla significa publicar otra versión.
  IF TG_OP = 'UPDATE' AND OLD.estado = 'PUBLICADA' THEN
    RAISE EXCEPTION 'La versión publicada de % es inmutable; publique una versión nueva.',
      TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;

  IF NEW.estado IS NULL OR NEW.estado NOT IN ('BORRADOR', 'PUBLICADA') THEN
    RAISE EXCEPTION 'El estado de % no es válido.', TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;

  -- El ciclo de vida empieza siempre en BORRADOR: publicar es una transición
  -- explícita posterior.
  IF TG_OP = 'INSERT' AND NEW.estado <> 'BORRADOR' THEN
    RAISE EXCEPTION 'Las filas de % se crean como BORRADOR.', TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;

  IF NEW.estado = 'BORRADOR' THEN
    -- Un borrador no tiene número de versión ni datos de publicación.
    NEW.version := NULL;
    NEW.vigente_desde := NULL;
    NEW.publicada_por_id := NULL;
    NEW.publicada_en := NULL;

    RETURN NEW;
  END IF;

  IF NEW.publicada_por_id IS NULL THEN
    RAISE EXCEPTION 'La publicación de % requiere indicar publicada_por_id.', TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;

  -- Serializa la asignación del consecutivo entre publicaciones concurrentes.
  -- El bloqueo se libera al terminar la transacción.
  PERFORM pg_advisory_xact_lock(hashtext('configuracion_versionada:' || TG_TABLE_NAME));

  EXECUTE format(
    'SELECT COALESCE(MAX(version), 0) + 1 FROM %I WHERE estado = %L',
    TG_TABLE_NAME,
    'PUBLICADA'
  ) INTO siguiente_version;

  NEW.version := siguiente_version;
  NEW.publicada_en := COALESCE(NEW.publicada_en, NOW());
  NEW.vigente_desde := COALESCE(NEW.vigente_desde, NEW.publicada_en);

  -- La vigencia no puede empezar antes de la publicación. Se usa el instante
  -- de publicación informado por el caso de uso o, en su defecto, NOW().
  IF NEW.vigente_desde < NEW.publicada_en THEN
    RAISE EXCEPTION 'vigente_desde no puede ser anterior a publicada_en en %.', TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
