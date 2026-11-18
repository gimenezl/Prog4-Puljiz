import { ErrorDeDominio } from '../errors/error-de-dominio.js';

// Formatos de patente argentina: el anterior (ABC123) y el Mercosur (AB123CD).
const PATRON_PATENTE = /^(?:[A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/;
const TEXTO_MAXIMO = 50;
// Rango de plausibilidad. El dominio no consulta el reloj, así que no compara
// con el año actual.
const ANIO_MINIMO = 1950;
const ANIO_MAXIMO = 2100;

function validarIdentificador(valor, mensaje) {
  if (typeof valor !== 'string' || valor.trim().length === 0) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', mensaje);
  }

  return valor;
}

/**
 * Normaliza la patente para compararla sin importar cómo la escriba el
 * cliente: sin espacios ni guiones y en mayúsculas ("ab 123-cd" -> "AB123CD").
 */
export function normalizarPatente(valor) {
  if (typeof valor !== 'string') {
    throw new ErrorDeDominio('DATOS_INVALIDOS', 'La patente es obligatoria.');
  }

  const normalizada = valor.replace(/[\s-]/g, '').toUpperCase();

  if (!PATRON_PATENTE.test(normalizada)) {
    throw new ErrorDeDominio(
      'DATOS_INVALIDOS',
      'La patente debe tener el formato ABC123 o AB123CD.',
    );
  }

  return normalizada;
}

function validarTexto(valor, nombre, { obligatorio }) {
  if (valor === null || valor === undefined) {
    if (obligatorio) {
      throw new ErrorDeDominio('DATOS_INVALIDOS', `El campo ${nombre} es obligatorio.`);
    }

    return null;
  }

  const normalizado = typeof valor === 'string' ? valor.trim() : '';

  if (normalizado.length === 0 || normalizado.length > TEXTO_MAXIMO) {
    throw new ErrorDeDominio(
      'DATOS_INVALIDOS',
      `El campo ${nombre} debe tener entre 1 y ${TEXTO_MAXIMO} caracteres.`,
    );
  }

  return normalizado;
}

function validarAnio(valor) {
  if (valor === null || valor === undefined) return null;

  if (!Number.isInteger(valor) || valor < ANIO_MINIMO || valor > ANIO_MAXIMO) {
    throw new ErrorDeDominio(
      'DATOS_INVALIDOS',
      `El año debe ser un entero entre ${ANIO_MINIMO} y ${ANIO_MAXIMO}.`,
    );
  }

  return valor;
}

/**
 * Vehículo de un chofer (docs/modelo.md, §4.3). Un chofer tiene a lo sumo uno
 * y la patente es única en el sistema; la unicidad la garantiza la base.
 *
 * Es inmutable: editarlo devuelve una copia con los datos nuevos y el mismo
 * id y chofer.
 */
export class Vehiculo {
  #id;
  #choferId;
  #patente;
  #marca;
  #modelo;
  #anio;
  #color;

  constructor({ id, choferId, patente, marca, modelo, anio = null, color = null }) {
    this.#id = validarIdentificador(id, 'El identificador del vehículo no es válido.');
    this.#choferId = validarIdentificador(choferId, 'El identificador del chofer no es válido.');
    this.#patente = normalizarPatente(patente);
    this.#marca = validarTexto(marca, 'marca', { obligatorio: true });
    this.#modelo = validarTexto(modelo, 'modelo', { obligatorio: true });
    this.#anio = validarAnio(anio);
    this.#color = validarTexto(color, 'color', { obligatorio: false });
  }

  get id() {
    return this.#id;
  }

  get choferId() {
    return this.#choferId;
  }

  get patente() {
    return this.#patente;
  }

  get marca() {
    return this.#marca;
  }

  get modelo() {
    return this.#modelo;
  }

  get anio() {
    return this.#anio;
  }

  get color() {
    return this.#color;
  }

  /** Devuelve una copia con los datos editables reemplazados. */
  conDatos({ patente, marca, modelo, anio = null, color = null }) {
    return new Vehiculo({
      id: this.#id,
      choferId: this.#choferId,
      patente,
      marca,
      modelo,
      anio,
      color,
    });
  }

  aVistaPublica() {
    return {
      id: this.#id,
      choferId: this.#choferId,
      patente: this.#patente,
      marca: this.#marca,
      modelo: this.#modelo,
      anio: this.#anio,
      color: this.#color,
    };
  }

  toJSON() {
    return this.aVistaPublica();
  }
}
