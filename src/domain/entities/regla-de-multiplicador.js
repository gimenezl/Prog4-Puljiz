import { ErrorDeDominio } from '../errors/error-de-dominio.js';
import { ESTADOS_CONFIGURACION } from './tarifa.js';

const REDECIMAL = /^\d+(\.\d{1,4})?$/;

function validarDecimal(valor, nombre) {
  if (typeof valor !== 'string' || !REDECIMAL.test(valor.trim())) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', `El valor de ${nombre} no es válido.`);
  }

  return valor.trim();
}

function aBigInt(valor) {
  const [entero, fraccion = ''] = valor.split('.');
  return BigInt(entero) * 10000n + BigInt(fraccion.padEnd(4, '0') || '0');
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

/** Regla de multiplicador versionada. Publicada es inmutable (I12). */
export class ReglaDeMultiplicador {
  #id;
  #estado;
  #version;
  #formula;
  #umbralInferior;
  #umbralSuperior;
  #multiplicadorMinimo;
  #multiplicadorMaximo;
  #escalaMultiplicador;
  #vigenteDesde;
  #motivo;
  #publicadaPorId;
  #publicadaEn;
  #creadaEn;

  constructor({
    id,
    estado = ESTADOS_CONFIGURACION.BORRADOR,
    version = null,
    formula = 'LINEAL_POR_TRAMOS',
    umbralInferior,
    umbralSuperior,
    multiplicadorMinimo,
    multiplicadorMaximo,
    escalaMultiplicador,
    vigenteDesde = null,
    motivo = null,
    publicadaPorId = null,
    publicadaEn = null,
    creadaEn,
  }) {
    if (typeof id !== 'string' || id.trim().length === 0) {
      throw new ErrorDeDominio('DATOS_INVALIDOS', 'El identificador de la regla no es válido.');
    }

    if (!Object.values(ESTADOS_CONFIGURACION).includes(estado)) {
      throw new ErrorDeDominio('DATOS_INVALIDOS', 'El estado de la regla no es válido.');
    }

    if (formula !== 'LINEAL_POR_TRAMOS') {
      throw new ErrorDeDominio('DATOS_INVALIDOS', 'La fórmula de la regla no es válida.');
    }

    if (
      !Number.isInteger(escalaMultiplicador) ||
      escalaMultiplicador < 0 ||
      escalaMultiplicador > 4
    ) {
      throw new ErrorDeDominio('DATOS_INVALIDOS', 'La escala del multiplicador no es válida.');
    }

    if (motivo !== null && motivo !== undefined) {
      if (typeof motivo !== 'string' || motivo.trim().length === 0 || motivo.trim().length > 500) {
        throw new ErrorDeDominio('DATOS_INVALIDOS', 'El motivo de la regla no es válido.');
      }
    }

    this.#id = id;
    this.#estado = estado;
    this.#version = version;
    this.#formula = formula;
    this.#umbralInferior = validarDecimal(umbralInferior, 'el umbral inferior');
    this.#umbralSuperior = validarDecimal(umbralSuperior, 'el umbral superior');
    this.#multiplicadorMinimo = validarDecimal(multiplicadorMinimo, 'el multiplicador mínimo');
    this.#multiplicadorMaximo = validarDecimal(multiplicadorMaximo, 'el multiplicador máximo');
    this.#escalaMultiplicador = escalaMultiplicador;
    this.#vigenteDesde = validarFechaOpcional(
      vigenteDesde,
      'La vigencia de la regla no es válida.',
    );
    this.#motivo = motivo === null || motivo === undefined ? null : motivo.trim();
    this.#publicadaPorId = publicadaPorId;
    this.#publicadaEn = validarFechaOpcional(publicadaEn, 'La fecha de publicación no es válida.');
    this.#creadaEn = validarFecha(creadaEn, 'La fecha de creación de la regla no es válida.');

    const inferior = aBigInt(this.#umbralInferior);
    const superior = aBigInt(this.#umbralSuperior);
    const minimo = aBigInt(this.#multiplicadorMinimo);
    const maximo = aBigInt(this.#multiplicadorMaximo);

    if (inferior < 0n || superior <= inferior) {
      throw new ErrorDeDominio('DATOS_INVALIDOS', 'Los umbrales de la regla no son válidos.');
    }

    if (minimo < 10000n || maximo < minimo) {
      throw new ErrorDeDominio('DATOS_INVALIDOS', 'El rango del multiplicador no es válido.');
    }

    if (estado === ESTADOS_CONFIGURACION.PUBLICADA) {
      // Estado transitorio: `publicar()` no conoce la versión, la asigna el
      // repositorio al persistir (en la base, mediante trigger).
      if (
        (version !== null && (!Number.isInteger(version) || version < 1)) ||
        !this.#vigenteDesde ||
        !this.#publicadaPorId ||
        !this.#publicadaEn
      ) {
        throw new ErrorDeDominio('DATOS_INVALIDOS', 'La regla publicada está incompleta.');
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

  get formula() {
    return this.#formula;
  }

  get umbralInferior() {
    return this.#umbralInferior;
  }

  get umbralSuperior() {
    return this.#umbralSuperior;
  }

  get multiplicadorMinimo() {
    return this.#multiplicadorMinimo;
  }

  get multiplicadorMaximo() {
    return this.#multiplicadorMaximo;
  }

  get escalaMultiplicador() {
    return this.#escalaMultiplicador;
  }

  get vigenteDesde() {
    return this.#vigenteDesde ? new Date(this.#vigenteDesde) : null;
  }

  get motivo() {
    return this.#motivo;
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
        'Una regla publicada no se puede modificar; publique una versión nueva.',
      );
    }

    return new ReglaDeMultiplicador({
      id: this.#id,
      estado: this.#estado,
      version: this.#version,
      formula: cambios.formula ?? this.#formula,
      umbralInferior: cambios.umbralInferior ?? this.#umbralInferior,
      umbralSuperior: cambios.umbralSuperior ?? this.#umbralSuperior,
      multiplicadorMinimo: cambios.multiplicadorMinimo ?? this.#multiplicadorMinimo,
      multiplicadorMaximo: cambios.multiplicadorMaximo ?? this.#multiplicadorMaximo,
      escalaMultiplicador: cambios.escalaMultiplicador ?? this.#escalaMultiplicador,
      creadaEn: this.#creadaEn,
    });
  }

  publicar({ vigenteDesde, motivo, publicadaPorId, publicadaEn }) {
    if (this.#estado !== ESTADOS_CONFIGURACION.BORRADOR) {
      throw new ErrorDeDominio(
        'VERSION_YA_PUBLICADA',
        'La regla ya está publicada; publique una versión nueva.',
      );
    }

    return new ReglaDeMultiplicador({
      id: this.#id,
      estado: ESTADOS_CONFIGURACION.PUBLICADA,
      version: null,
      formula: this.#formula,
      umbralInferior: this.#umbralInferior,
      umbralSuperior: this.#umbralSuperior,
      multiplicadorMinimo: this.#multiplicadorMinimo,
      multiplicadorMaximo: this.#multiplicadorMaximo,
      escalaMultiplicador: this.#escalaMultiplicador,
      vigenteDesde,
      motivo,
      publicadaPorId,
      publicadaEn,
      creadaEn: this.#creadaEn,
    });
  }

  conVersion(version) {
    return new ReglaDeMultiplicador({
      id: this.#id,
      estado: this.#estado,
      version,
      formula: this.#formula,
      umbralInferior: this.#umbralInferior,
      umbralSuperior: this.#umbralSuperior,
      multiplicadorMinimo: this.#multiplicadorMinimo,
      multiplicadorMaximo: this.#multiplicadorMaximo,
      escalaMultiplicador: this.#escalaMultiplicador,
      vigenteDesde: this.#vigenteDesde,
      motivo: this.#motivo,
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
      formula: this.#formula,
      umbralInferior: this.#umbralInferior,
      umbralSuperior: this.#umbralSuperior,
      multiplicadorMinimo: this.#multiplicadorMinimo,
      multiplicadorMaximo: this.#multiplicadorMaximo,
      escalaMultiplicador: this.#escalaMultiplicador,
      vigenteDesde: this.#vigenteDesde?.toISOString() ?? null,
      motivo: this.#motivo,
      publicadaPorId: this.#publicadaPorId,
      publicadaEn: this.#publicadaEn?.toISOString() ?? null,
      creadaEn: this.#creadaEn.toISOString(),
    };
  }
}
