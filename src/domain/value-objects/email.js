import { ErrorDeDominio } from '../errors/error-de-dominio.js';

const PATRON_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LONGITUD_MAXIMA = 254;

/**
 * Normaliza un email para almacenarlo y compararlo sin distinguir mayúsculas.
 * La validación vive en el dominio para que ningún adaptador pueda guardar
 * direcciones inválidas.
 */
export function normalizarEmail(valor) {
  if (typeof valor !== 'string') {
    throw new ErrorDeDominio('DATOS_INVALIDOS', 'El email es obligatorio.');
  }

  const normalizado = valor.trim().toLowerCase();

  if (normalizado.length === 0 || normalizado.length > LONGITUD_MAXIMA) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', 'El email no es válido.');
  }

  if (!PATRON_EMAIL.test(normalizado)) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', 'El email no es válido.');
  }

  return normalizado;
}
