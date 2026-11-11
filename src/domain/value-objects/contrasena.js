import { ErrorDeDominio } from '../errors/error-de-dominio.js';

const LONGITUD_MINIMA = 8;
const BYTES_MAXIMOS = 72;

/**
 * Política de contraseñas del dominio.
 *
 * El máximo de 72 bytes es una restricción de bcrypt: los bytes posteriores
 * se ignoran silenciosamente. Validarlo evita que dos contraseñas distintas
 * sean equivalentes para el algoritmo de hash.
 */
export function validarContrasena(valor) {
  if (typeof valor !== 'string' || valor.length < LONGITUD_MINIMA) {
    throw new ErrorDeDominio(
      'DATOS_INVALIDOS',
      `La contraseña debe tener al menos ${LONGITUD_MINIMA} caracteres.`,
    );
  }

  if (Buffer.byteLength(valor, 'utf8') > BYTES_MAXIMOS) {
    throw new ErrorDeDominio(
      'DATOS_INVALIDOS',
      `La contraseña no puede superar los ${BYTES_MAXIMOS} bytes.`,
    );
  }

  if (!/[A-Za-z]/.test(valor) || !/\d/.test(valor)) {
    throw new ErrorDeDominio(
      'DATOS_INVALIDOS',
      'La contraseña debe incluir al menos una letra y un número.',
    );
  }

  return valor;
}
