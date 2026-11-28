import { ErrorDeDominio } from '../../domain/errors/error-de-dominio.js';

const PATRON_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cursor opaco de paginación (RF-14, RF-15).
 *
 * Guarda la posición del último viaje de la página: su `solicitadoEn` y su
 * `id` (para desempatar viajes con la misma fecha). Viaja en base64url para
 * que el cliente lo trate como un dato opaco: lo devuelve tal cual, sin
 * armarlo ni interpretarlo.
 */
export function codificarCursor(viaje) {
  const posicion = { t: viaje.solicitadoEn.toISOString(), id: viaje.id };
  return Buffer.from(JSON.stringify(posicion), 'utf8').toString('base64url');
}

/** Devuelve `{ solicitadoEn, id }` o lanza DATOS_INVALIDOS si el cursor no es válido. */
export function decodificarCursor(texto) {
  const invalido = () => new ErrorDeDominio('DATOS_INVALIDOS', 'El cursor no es válido.');
  let posicion;

  try {
    posicion = JSON.parse(Buffer.from(texto, 'base64url').toString('utf8'));
  } catch {
    throw invalido();
  }

  const solicitadoEn = new Date(posicion?.t);

  if (
    typeof posicion?.t !== 'string' ||
    Number.isNaN(solicitadoEn.getTime()) ||
    typeof posicion?.id !== 'string' ||
    !PATRON_ID.test(posicion.id)
  ) {
    throw invalido();
  }

  return { solicitadoEn, id: posicion.id };
}

/**
 * Pide un viaje más de los que se muestran para saber si hay otra página, sin
 * contar el total. Devuelve la página y el cursor siguiente (o null).
 */
export async function paginarPorCursor({ listar, cursor, limite }) {
  const antesDe = cursor ? decodificarCursor(cursor) : null;
  const viajes = await listar({ antesDe, limite: limite + 1 });
  const hayMas = viajes.length > limite;
  const pagina = hayMas ? viajes.slice(0, limite) : viajes;

  return { viajes: pagina, siguienteCursor: hayMas ? codificarCursor(pagina.at(-1)) : null };
}
