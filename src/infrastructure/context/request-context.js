import { AsyncLocalStorage } from 'node:async_hooks';

const almacenamiento = new AsyncLocalStorage();

/**
 * Ejecuta una función dentro de un contexto de request. El contexto se
 * propaga a través de promesas y callbacks iniciados dentro de esa función.
 */
export function ejecutarConContexto(contexto, funcion) {
  return almacenamiento.run(contexto, funcion);
}

export function obtenerContexto() {
  return almacenamiento.getStore();
}

export function obtenerRequestId() {
  return almacenamiento.getStore()?.requestId;
}

export function obtenerLogger() {
  return almacenamiento.getStore()?.logger;
}
