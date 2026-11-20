import { ErrorDeDominio } from '../../domain/errors/error-de-dominio.js';

/**
 * Exige que el chofer tenga una ubicación reciente para recibir viajes
 * (docs/modelo.md §2 «Chofer elegible», invariante I5). Sin ubicación, o con
 * una más vieja que la vigencia configurada, el chofer no es elegible: así no
 * se ofrecen viajes a alguien que cerró la app o perdió la señal.
 */
export async function exigirUbicacionVigente({
  repositorioUbicaciones,
  choferId,
  ahora,
  vigenciaMs,
  ejecutor,
}) {
  const ubicacion = await repositorioUbicaciones.buscarPorChoferId(choferId, ejecutor);

  if (!ubicacion || !ubicacion.estaVigente(ahora, vigenciaMs)) {
    throw new ErrorDeDominio(
      'CHOFER_NO_ELEGIBLE',
      'El chofer no tiene una ubicación reciente. Debe informar su ubicación para recibir viajes.',
    );
  }

  return ubicacion;
}
