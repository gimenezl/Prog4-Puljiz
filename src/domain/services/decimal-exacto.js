import { ErrorDeDominio } from '../errors/error-de-dominio.js';

/**
 * Utilidades de aritmética decimal exacta.
 *
 * Los decimales del modelo tienen escala fija (como máximo 4). Se guardan como
 * enteros escalados y las operaciones se hacen con BigInt para no perder
 * precisión con coma flotante. Ninguna función depende de reloj ni de base.
 */
export const ESCALA_DECIMAL = 4;

const REDECIMAL = /^\d+(\.\d+)?$/;

function potencia(exponente) {
  return 10n ** BigInt(exponente);
}

/** Convierte un texto decimal de escala fija a un entero escalado. */
export function aEnteroEscalado(valor, escala = ESCALA_DECIMAL) {
  if (!Number.isInteger(escala) || escala < 0 || escala > ESCALA_DECIMAL) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', 'La escala decimal no es válida.');
  }

  const texto = typeof valor === 'number' ? String(valor) : valor;

  if (typeof texto !== 'string' || !REDECIMAL.test(texto.trim())) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', 'El decimal no tiene un formato válido.');
  }

  const normalizado = texto.trim();
  const [entero, fraccion = ''] = normalizado.split('.');
  const cantidadDecimales = fraccion.length;

  if (cantidadDecimales > escala) {
    throw new ErrorDeDominio(
      'DATOS_INVALIDOS',
      `El decimal no puede tener más de ${escala} decimales.`,
    );
  }

  return BigInt(entero) * potencia(escala) + BigInt(fraccion.padEnd(escala, '0') || '0');
}

/** Formatea un entero escalado como texto decimal de escala fija. */
export function desdeEnteroEscalado(valor, escala = ESCALA_DECIMAL) {
  if (!Number.isInteger(escala) || escala < 0 || escala > ESCALA_DECIMAL) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', 'La escala decimal no es válida.');
  }

  const negativo = valor < 0n;
  const absoluto = negativo ? -valor : valor;
  const divisor = potencia(escala);
  const entero = absoluto / divisor;
  const fraccion = absoluto % divisor;
  const texto =
    escala === 0
      ? entero.toString()
      : `${entero.toString()}.${fraccion.toString().padStart(escala, '0')}`;

  return negativo ? `-${texto}` : texto;
}

/** Redondeo MITAD_HACIA_ARRIBA de un cociente de BigInt no negativos. */
export function redondearMitadArriba(numerador, denominador) {
  if (denominador <= 0n) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', 'El denominador debe ser positivo.');
  }

  return (2n * numerador + denominador) / (2n * denominador);
}

/** Convierte un valor escalado a otra escala, redondeando mitad hacia arriba. */
export function cambiarEscala(valor, escalaOrigen, escalaDestino) {
  if (escalaDestino === escalaOrigen) return valor;

  if (escalaDestino < escalaOrigen) {
    return redondearMitadArriba(valor, potencia(escalaOrigen - escalaDestino));
  }

  return valor * potencia(escalaDestino - escalaOrigen);
}

/** Cantidad de decimales de un texto decimal, entre 0 y 4. */
export function escalaDeTexto(valor) {
  if (typeof valor !== 'string') {
    throw new ErrorDeDominio('DATOS_INVALIDOS', 'El decimal debe viajar como texto.');
  }

  const texto = valor.trim();
  if (!REDECIMAL.test(texto)) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', 'El decimal no tiene un formato válido.');
  }

  const cantidad = texto.includes('.') ? texto.split('.')[1].length : 0;
  if (cantidad > ESCALA_DECIMAL) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', 'El decimal no puede tener más de 4 decimales.');
  }

  return cantidad;
}
