import { createHash } from 'node:crypto';

/**
 * Serializa un valor con las claves de los objetos ordenadas. Así dos cuerpos
 * equivalentes producen la misma huella aunque el cliente cambie el orden de
 * las propiedades.
 */
export function canonicalizar(valor) {
  if (Array.isArray(valor)) {
    return valor.map((elemento) => canonicalizar(elemento));
  }

  if (valor !== null && typeof valor === 'object') {
    const ordenado = {};

    for (const clave of Object.keys(valor).sort()) {
      ordenado[clave] = canonicalizar(valor[clave]);
    }

    return ordenado;
  }

  return valor;
}

/** Huella SHA-256 del contenido canónico de una solicitud. */
export function huellaContenido(valor) {
  const serializado = JSON.stringify(canonicalizar(valor));
  return createHash('sha256').update(serializado, 'utf8').digest('hex');
}
