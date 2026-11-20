import { ErrorDeDominio } from '../errors/error-de-dominio.js';
import { PuntoGeografico } from '../value-objects/punto-geografico.js';

export const ESTADOS_COTIZACION = Object.freeze({
  VIGENTE: 'VIGENTE',
  CONFIRMADA: 'CONFIRMADA',
  VENCIDA: 'VENCIDA',
});

const ESTADOS_VALIDOS = new Set(Object.values(ESTADOS_COTIZACION));
const REDECIMAL = /^\d+(\.\d{1,4})?$/;

function validarTexto(valor, mensaje) {
  if (typeof valor !== 'string' || valor.trim().length === 0) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', mensaje);
  }

  return valor;
}

function validarEntero(valor, nombre, minimo = 0) {
  if (!Number.isInteger(valor) || valor < minimo) {
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

/**
 * Cotización: foto inmutable del precio (I11). Solo cambia su estado.
 * Guarda los conteos y las versiones usadas para poder reproducir el cálculo.
 */
export class Cotizacion {
  #id;
  #pasajeroId;
  #origen;
  #destino;
  #distanciaEstimadaM;
  #tiempoEstimadoS;
  #zonaId;
  #solicitudesUsadas;
  #choferesDisponiblesUsados;
  #reglaId;
  #reglaVersion;
  #tarifaId;
  #tarifaVersion;
  #multiplicador;
  #precioCentavos;
  #parametrosConteo;
  #calculadaEn;
  #venceEn;
  #estado;

  constructor({
    id,
    pasajeroId,
    origen,
    destino,
    distanciaEstimadaM,
    tiempoEstimadoS,
    zonaId,
    solicitudesUsadas,
    choferesDisponiblesUsados,
    reglaId,
    reglaVersion,
    tarifaId,
    tarifaVersion,
    multiplicador,
    precioCentavos,
    parametrosConteo = {},
    calculadaEn,
    venceEn,
    estado = ESTADOS_COTIZACION.VIGENTE,
  }) {
    this.#id = validarTexto(id, 'El identificador de la cotización no es válido.');
    this.#pasajeroId = validarTexto(pasajeroId, 'El identificador del pasajero no es válido.');
    this.#zonaId = validarTexto(zonaId, 'El identificador de la zona no es válido.');
    this.#reglaId = validarTexto(reglaId, 'El identificador de la regla no es válido.');
    this.#tarifaId = validarTexto(tarifaId, 'El identificador de la tarifa no es válido.');

    if (!(origen instanceof PuntoGeografico) || !(destino instanceof PuntoGeografico)) {
      throw new ErrorDeDominio(
        'DATOS_INVALIDOS',
        'El origen y el destino deben ser puntos válidos.',
      );
    }

    this.#origen = origen;
    this.#destino = destino;
    this.#distanciaEstimadaM = validarEntero(distanciaEstimadaM, 'la distancia estimada', 1);
    this.#tiempoEstimadoS = validarEntero(tiempoEstimadoS, 'el tiempo estimado');
    this.#solicitudesUsadas = validarEntero(solicitudesUsadas, 'las solicitudes usadas');
    this.#choferesDisponiblesUsados = validarEntero(
      choferesDisponiblesUsados,
      'los choferes usados',
    );
    this.#reglaVersion = validarEntero(reglaVersion, 'la versión de la regla', 1);
    this.#tarifaVersion = validarEntero(tarifaVersion, 'la versión de la tarifa', 1);
    this.#precioCentavos = validarEntero(precioCentavos, 'el precio');

    if (typeof multiplicador !== 'string' || !REDECIMAL.test(multiplicador.trim())) {
      throw new ErrorDeDominio('DATOS_INVALIDOS', 'El multiplicador debe ser un decimal exacto.');
    }

    this.#multiplicador = multiplicador.trim();

    if (
      !parametrosConteo ||
      typeof parametrosConteo !== 'object' ||
      Array.isArray(parametrosConteo)
    ) {
      throw new ErrorDeDominio('DATOS_INVALIDOS', 'Los parámetros de conteo no son válidos.');
    }

    this.#parametrosConteo = structuredClone(parametrosConteo);
    this.#calculadaEn = validarFecha(calculadaEn, 'La fecha de cálculo no es válida.');
    this.#venceEn = validarFecha(venceEn, 'La fecha de vencimiento no es válida.');

    if (this.#venceEn.getTime() <= this.#calculadaEn.getTime()) {
      throw new ErrorDeDominio('DATOS_INVALIDOS', 'El vencimiento debe ser posterior al cálculo.');
    }

    if (!ESTADOS_VALIDOS.has(estado)) {
      throw new ErrorDeDominio('DATOS_INVALIDOS', 'El estado de la cotización no es válido.');
    }

    this.#estado = estado;
  }

  get id() {
    return this.#id;
  }

  get pasajeroId() {
    return this.#pasajeroId;
  }

  get origen() {
    return this.#origen;
  }

  get destino() {
    return this.#destino;
  }

  get distanciaEstimadaM() {
    return this.#distanciaEstimadaM;
  }

  get tiempoEstimadoS() {
    return this.#tiempoEstimadoS;
  }

  get zonaId() {
    return this.#zonaId;
  }

  get solicitudesUsadas() {
    return this.#solicitudesUsadas;
  }

  get choferesDisponiblesUsados() {
    return this.#choferesDisponiblesUsados;
  }

  get reglaId() {
    return this.#reglaId;
  }

  get reglaVersion() {
    return this.#reglaVersion;
  }

  get tarifaId() {
    return this.#tarifaId;
  }

  get tarifaVersion() {
    return this.#tarifaVersion;
  }

  get multiplicador() {
    return this.#multiplicador;
  }

  get precioCentavos() {
    return this.#precioCentavos;
  }

  get parametrosConteo() {
    return structuredClone(this.#parametrosConteo);
  }

  get calculadaEn() {
    return new Date(this.#calculadaEn);
  }

  get venceEn() {
    return new Date(this.#venceEn);
  }

  get estado() {
    return this.#estado;
  }

  estaVencida(ahora) {
    return ahora.getTime() >= this.#venceEn.getTime();
  }

  estadoEfectivo(ahora) {
    if (this.#estado === ESTADOS_COTIZACION.VIGENTE && this.estaVencida(ahora)) {
      return ESTADOS_COTIZACION.VENCIDA;
    }

    return this.#estado;
  }

  #conEstado(estado) {
    return new Cotizacion({
      id: this.#id,
      pasajeroId: this.#pasajeroId,
      origen: this.#origen,
      destino: this.#destino,
      distanciaEstimadaM: this.#distanciaEstimadaM,
      tiempoEstimadoS: this.#tiempoEstimadoS,
      zonaId: this.#zonaId,
      solicitudesUsadas: this.#solicitudesUsadas,
      choferesDisponiblesUsados: this.#choferesDisponiblesUsados,
      reglaId: this.#reglaId,
      reglaVersion: this.#reglaVersion,
      tarifaId: this.#tarifaId,
      tarifaVersion: this.#tarifaVersion,
      multiplicador: this.#multiplicador,
      precioCentavos: this.#precioCentavos,
      parametrosConteo: this.#parametrosConteo,
      calculadaEn: this.#calculadaEn,
      venceEn: this.#venceEn,
      estado,
    });
  }

  confirmar(ahora) {
    if (this.#estado !== ESTADOS_COTIZACION.VIGENTE) {
      throw new ErrorDeDominio('COTIZACION_YA_CONFIRMADA', 'La cotización ya no está vigente.');
    }

    if (this.estaVencida(ahora)) {
      throw new ErrorDeDominio('COTIZACION_VENCIDA', 'La cotización ya venció.');
    }

    return this.#conEstado(ESTADOS_COTIZACION.CONFIRMADA);
  }

  vencer() {
    if (this.#estado !== ESTADOS_COTIZACION.VIGENTE) {
      return this;
    }

    return this.#conEstado(ESTADOS_COTIZACION.VENCIDA);
  }

  aVistaPublica(ahora = null) {
    return {
      id: this.#id,
      pasajeroId: this.#pasajeroId,
      origen: this.#origen.aJSON(),
      destino: this.#destino.aJSON(),
      distanciaEstimadaM: this.#distanciaEstimadaM,
      tiempoEstimadoS: this.#tiempoEstimadoS,
      zonaId: this.#zonaId,
      solicitudesUsadas: this.#solicitudesUsadas,
      choferesDisponiblesUsados: this.#choferesDisponiblesUsados,
      reglaVersion: this.#reglaVersion,
      tarifaVersion: this.#tarifaVersion,
      multiplicador: this.#multiplicador,
      precioCentavos: this.#precioCentavos,
      calculadaEn: this.#calculadaEn.toISOString(),
      venceEn: this.#venceEn.toISOString(),
      estado: ahora ? this.estadoEfectivo(ahora) : this.#estado,
    };
  }
}
