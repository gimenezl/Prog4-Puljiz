import { randomUUID } from 'node:crypto';

const PATRON_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Acepta un identificador de correlación recibido por header solo si tiene
 * un formato seguro y acotado. Si no, genera uno nuevo.
 */
export function normalizarRequestId(valor) {
  if (typeof valor === 'string' && PATRON_REQUEST_ID.test(valor)) {
    return valor;
  }

  return randomUUID();
}
