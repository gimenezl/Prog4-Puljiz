import { ErrorDeDominio } from '../errors/error-de-dominio.js';

export const ESTADOS_CONFIGURACION = Object.freeze({
  BORRADOR: 'BORRADOR',
  PUBLICADA: 'PUBLICADA',
});

function validarEntero(valor, nombre) {
  if (!Number.isInteger(valor) || valor < 0) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', `El valor de ${nombre} no es válido.`);
  }

  return valor;
}

function validarFecha(valor, mensaje) {
  if (!(valor instanceof Date) || Number.isNaN(valor.getTime())) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', mensaje);
  }

  return new Date(valor);
}

function validarFechaOpcional(valor, mensaje) {
  if (valor === null || valor === undefined) return null;
  return validarFecha(valor, mensaje);
}

/** Tarifa global versionada. Publicada es inmutable (I12). */
export class Tarifa {
  #id;
  #estado;
  #version;
  #baseCentavos;
  #porKmCentavos;
  #porMinutoCentavos;
  #precioMaximoCentavos;
  #vigenteDesde;
  #publicadaPorId;
  #publicadaEn;
  #creadaEn;

  constructor({
    id,
    estado = ESTADOS_CONFIGURACION.BORRADOR,
    version = null,
    baseCentavos,
    porKmCentavos,
    porMinutoCentavos,
    precioMaximoCentavos,
    vigenteDesde = null,
    publicadaPorId = null,
    publicadaEn = null,
    creadaEn,
  }) {
    if (typeof id !== 'string' || id.trim().length === 0) {
      throw new ErrorDeDominio('DATOS_INVALIDOS', 'El identificador de la tarifa no es válido.');
    }

    if (!Object.values(ESTADOS_CONFIGURACION).includes(estado)) {
      throw new ErrorDeDominio('DATOS_INVALIDOS', 'El estado de la tarifa no es válido.');
    }

    this.#id = id;
    this.#estado = estado;
    this.#version = version;
    this.#baseCentavos = validarEntero(baseCentavos, 'la base');
    this.#porKmCentavos = validarEntero(porKmCentavos, 'el importe por kilómetro');
    this.#porMinutoCentavos = validarEntero(porMinutoCentavos, 'el importe por minuto');
    this.#precioMaximoCentavos = validarEntero(precioMaximoCentavos, 'el precio máximo');
    this.#vigenteDesde = validarFechaOpcional(
      vigenteDesde,
      'La vigencia de la tarifa no es válida.',
    );
    this.#publicadaPorId = publicadaPorId;
    this.#publicadaEn = validarFechaOpcional(publicadaEn, 'La fecha de publicación no es válida.');
    this.#creadaEn = validarFecha(creadaEn, 'La fecha de creación de la tarifa no es válida.');

    if (this.#precioMaximoCentavos < this.#baseCentavos) {
      throw new ErrorDeDominio(
        'DATOS_INVALIDOS',
        'El precio máximo no puede ser menor que la base.',
      );
    }

    if (estado === ESTADOS_CONFIGURACION.PUBLICADA) {
      // `publicar()` produce un estado transitorio sin versión: la versión la
      // asigna el repositorio al persistir (la base lo hace con un trigger).
      // Se admite `null`, pero no una versión inválida.
      if (
        (version !== null && (!Number.isInteger(version) || version < 1)) ||
        !this.#vigenteDesde ||
        !this.#publicadaPorId ||
        !this.#publicadaEn
      ) {
        throw new ErrorDeDominio('DATOS_INVALIDOS', 'La tarifa publicada está incompleta.');
      }

      if (this.#vigenteDesde.getTime() < this.#publicadaEn.getTime()) {
        throw new ErrorDeDominio(
          'DATOS_INVALIDOS',
          'La vigencia no puede ser anterior a la publicación.',
        );
      }
    }
  }

  get id() {
    return this.#id;
  }

  get estado() {
    return this.#estado;
  }

  get version() {
    return this.#version;
  }

  get baseCentavos() {
    return this.#baseCentavos;
  }

  get porKmCentavos() {
    return this.#porKmCentavos;
  }

  get porMinutoCentavos() {
    return this.#porMinutoCentavos;
  }

  get precioMaximoCentavos() {
    return this.#precioMaximoCentavos;
  }

  get vigenteDesde() {
    return this.#vigenteDesde ? new Date(this.#vigenteDesde) : null;
  }

  get publicadaPorId() {
    return this.#publicadaPorId;
  }

  get publicadaEn() {
    return this.#publicadaEn ? new Date(this.#publicadaEn) : null;
  }

  get creadaEn() {
    return new Date(this.#creadaEn);
  }

  conDatos(cambios) {
    if (this.#estado !== ESTADOS_CONFIGURACION.BORRADOR) {
      throw new ErrorDeDominio(
        'VERSION_YA_PUBLICADA',
        'Una tarifa publicada no se puede modificar; publique una versión nueva.',
      );
    }

    return new Tarifa({
      id: this.#id,
      estado: this.#estado,
      version: this.#version,
      baseCentavos: cambios.baseCentavos ?? this.#baseCentavos,
      porKmCentavos: cambios.porKmCentavos ?? this.#porKmCentavos,
      porMinutoCentavos: cambios.porMinutoCentavos ?? this.#porMinutoCentavos,
      precioMaximoCentavos: cambios.precioMaximoCentavos ?? this.#precioMaximoCentavos,
      creadaEn: this.#creadaEn,
    });
  }

  publicar({ vigenteDesde, publicadaPorId, publicadaEn }) {
    if (this.#estado !== ESTADOS_CONFIGURACION.BORRADOR) {
      throw new ErrorDeDominio(
        'VERSION_YA_PUBLICADA',
        'La tarifa ya está publicada; publique una versión nueva.',
      );
    }

    return new Tarifa({
      id: this.#id,
      estado: ESTADOS_CONFIGURACION.PUBLICADA,
      version: null,
      baseCentavos: this.#baseCentavos,
      porKmCentavos: this.#porKmCentavos,
      porMinutoCentavos: this.#porMinutoCentavos,
      precioMaximoCentavos: this.#precioMaximoCentavos,
      vigenteDesde,
      publicadaPorId,
      publicadaEn,
      creadaEn: this.#creadaEn,
    });
  }

  conVersion(version) {
    return new Tarifa({
      id: this.#id,
      estado: this.#estado,
      version,
      baseCentavos: this.#baseCentavos,
      porKmCentavos: this.#porKmCentavos,
      porMinutoCentavos: this.#porMinutoCentavos,
      precioMaximoCentavos: this.#precioMaximoCentavos,
      vigenteDesde: this.#vigenteDesde,
      publicadaPorId: this.#publicadaPorId,
      publicadaEn: this.#publicadaEn,
      creadaEn: this.#creadaEn,
    });
  }

  aVistaPublica() {
    return {
      id: this.#id,
      estado: this.#estado,
      version: this.#version,
      baseCentavos: this.#baseCentavos,
      porKmCentavos: this.#porKmCentavos,
      porMinutoCentavos: this.#porMinutoCentavos,
      precioMaximoCentavos: this.#precioMaximoCentavos,
      vigenteDesde: this.#vigenteDesde?.toISOString() ?? null,
      publicadaPorId: this.#publicadaPorId,
      publicadaEn: this.#publicadaEn?.toISOString() ?? null,
      creadaEn: this.#creadaEn.toISOString(),
    };
  }
}
