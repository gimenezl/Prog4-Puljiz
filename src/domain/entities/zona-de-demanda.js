import { ErrorDeDominio } from '../errors/error-de-dominio.js';

function validarTexto(valor, mensaje) {
  if (typeof valor !== 'string' || valor.trim().length === 0) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', mensaje);
  }

  return valor.trim();
}

function validarPunto(punto) {
  if (
    !punto ||
    typeof punto.lat !== 'number' ||
    typeof punto.lng !== 'number' ||
    !Number.isFinite(punto.lat) ||
    !Number.isFinite(punto.lng) ||
    punto.lat < -90 ||
    punto.lat > 90 ||
    punto.lng < -180 ||
    punto.lng > 180
  ) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', 'Las coordenadas del polígono no son válidas.');
  }

  return { lat: punto.lat, lng: punto.lng };
}

/** Normaliza el criterio POLIGONO y descarta el cierre repetido del anillo. */
export function validarCriterio(criterio) {
  if (
    !criterio ||
    criterio.tipo !== 'POLIGONO' ||
    !Array.isArray(criterio.puntos) ||
    criterio.puntos.length < 3
  ) {
    throw new ErrorDeDominio(
      'DATOS_INVALIDOS',
      'El criterio debe ser un POLIGONO de al menos tres puntos.',
    );
  }

  const puntos = criterio.puntos.map(validarPunto);
  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];

  if (primero.lat === ultimo.lat && primero.lng === ultimo.lng && puntos.length > 3) {
    puntos.pop();
  }

  return { tipo: 'POLIGONO', puntos };
}

/** Zona de demanda. Se desactiva, nunca se elimina. */
export class ZonaDeDemanda {
  #id;
  #nombre;
  #criterio;
  #activa;
  #creadaEn;

  constructor({ id, nombre, criterio, activa = true, creadaEn }) {
    if (typeof id !== 'string' || id.trim().length === 0) {
      throw new ErrorDeDominio('DATOS_INVALIDOS', 'El identificador de la zona no es válido.');
    }

    if (!(creadaEn instanceof Date) || Number.isNaN(creadaEn.getTime())) {
      throw new ErrorDeDominio('DATOS_INVALIDOS', 'La fecha de creación de la zona no es válida.');
    }

    this.#id = id;
    this.#nombre = validarTexto(nombre, 'El nombre de la zona es obligatorio.');
    this.#criterio = validarCriterio(criterio);

    if (typeof activa !== 'boolean') {
      throw new ErrorDeDominio('DATOS_INVALIDOS', 'El estado activo de la zona debe ser booleano.');
    }

    this.#activa = activa;
    this.#creadaEn = new Date(creadaEn);
  }

  get id() {
    return this.#id;
  }

  get nombre() {
    return this.#nombre;
  }

  get criterio() {
    return {
      tipo: this.#criterio.tipo,
      puntos: this.#criterio.puntos.map((punto) => ({ ...punto })),
    };
  }

  get activa() {
    return this.#activa;
  }

  get creadaEn() {
    return new Date(this.#creadaEn);
  }

  conDatos({ nombre = this.#nombre, criterio = this.#criterio, activa = this.#activa } = {}) {
    return new ZonaDeDemanda({
      id: this.#id,
      nombre,
      criterio,
      activa,
      creadaEn: this.#creadaEn,
    });
  }

  desactivar() {
    return this.conDatos({ activa: false });
  }

  aVistaPublica() {
    return {
      id: this.#id,
      nombre: this.#nombre,
      criterio: this.criterio,
      activa: this.#activa,
      creadaEn: this.#creadaEn.toISOString(),
    };
  }
}
