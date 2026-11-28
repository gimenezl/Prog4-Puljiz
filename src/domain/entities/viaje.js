import { ErrorDeDominio } from '../errors/error-de-dominio.js';
import { PuntoGeografico } from '../value-objects/punto-geografico.js';

export const ESTADOS_VIAJE = Object.freeze({
  SOLICITADO: 'SOLICITADO',
  ASIGNADO: 'ASIGNADO',
  CHOFER_EN_CAMINO: 'CHOFER_EN_CAMINO',
  EN_CURSO: 'EN_CURSO',
  CANCELADO_POR_PASAJERO: 'CANCELADO_POR_PASAJERO',
  CANCELADO_POR_CHOFER: 'CANCELADO_POR_CHOFER',
  CANCELADO_POR_SOPORTE: 'CANCELADO_POR_SOPORTE',
  SIN_CHOFERES_DISPONIBLES: 'SIN_CHOFERES_DISPONIBLES',
  FINALIZADO: 'FINALIZADO',
});

/** Estados que representan demanda activa para el multiplicador (RF-23). */
export const ESTADOS_DEMANDA_ACTIVA = Object.freeze([
  ESTADOS_VIAJE.SOLICITADO,
  ESTADOS_VIAJE.ASIGNADO,
  ESTADOS_VIAJE.CHOFER_EN_CAMINO,
  ESTADOS_VIAJE.EN_CURSO,
]);

const ESTADOS_VALIDOS = new Set(Object.values(ESTADOS_VIAJE));
const ESTADOS_CON_CHOFER = new Set([
  ESTADOS_VIAJE.ASIGNADO,
  ESTADOS_VIAJE.CHOFER_EN_CAMINO,
  ESTADOS_VIAJE.EN_CURSO,
  ESTADOS_VIAJE.CANCELADO_POR_CHOFER,
  ESTADOS_VIAJE.FINALIZADO,
]);
const ESTADOS_SIN_CHOFER = new Set([
  ESTADOS_VIAJE.SOLICITADO,
  ESTADOS_VIAJE.SIN_CHOFERES_DISPONIBLES,
]);
const ESTADOS_CANCELADOS = new Set([
  ESTADOS_VIAJE.CANCELADO_POR_PASAJERO,
  ESTADOS_VIAJE.CANCELADO_POR_CHOFER,
  ESTADOS_VIAJE.CANCELADO_POR_SOPORTE,
]);

function validarIdentificador(valor, mensaje) {
  if (typeof valor !== 'string' || valor.trim().length === 0) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', mensaje);
  }

  return valor;
}

function validarEnteroNoNegativo(valor, mensaje) {
  if (!Number.isInteger(valor) || valor < 0) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', mensaje);
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

function validarMotivo(valor) {
  if (typeof valor !== 'string') {
    throw new ErrorDeDominio('DATOS_INVALIDOS', 'El motivo de cancelación es obligatorio.');
  }

  const motivo = valor.trim();

  if (motivo.length === 0) {
    throw new ErrorDeDominio(
      'DATOS_INVALIDOS',
      'El motivo de cancelación es obligatorio y no puede estar vacío.',
    );
  }

  if (motivo.length > 500) {
    throw new ErrorDeDominio(
      'DATOS_INVALIDOS',
      'El motivo de cancelación no puede superar los 500 caracteres.',
    );
  }

  return motivo;
}

/**
 * Viaje solicitado por un pasajero.
 *
 * Las transiciones son inmutables: cada método devuelve una copia con el nuevo
 * estado. La atomicidad la aporta la unidad de trabajo, no la entidad.
 */
export class Viaje {
  #id;
  #pasajeroId;
  #origen;
  #destino;
  #distanciaEstimadaM;
  #precioFijadoCentavos;
  #cotizacionId;
  #multiplicadorFijado;
  #choferId;
  #estado;
  #solicitadoEn;
  #asignadoEn;
  #iniciadoEn;
  #cerradoEn;
  #canceladoPorId;
  #motivoCancelacion;

  constructor({
    id,
    pasajeroId,
    origen,
    destino,
    distanciaEstimadaM,
    precioFijadoCentavos,
    cotizacionId = null,
    multiplicadorFijado = '1.0000',
    choferId = null,
    estado = ESTADOS_VIAJE.SOLICITADO,
    solicitadoEn,
    asignadoEn = null,
    iniciadoEn = null,
    cerradoEn = null,
    canceladoPorId = null,
    motivoCancelacion = null,
  }) {
    this.#id = validarIdentificador(id, 'El identificador del viaje no es válido.');
    this.#pasajeroId = validarIdentificador(
      pasajeroId,
      'El identificador del pasajero no es válido.',
    );

    if (!(origen instanceof PuntoGeografico) || !(destino instanceof PuntoGeografico)) {
      throw new ErrorDeDominio(
        'DATOS_INVALIDOS',
        'El origen y el destino deben ser puntos válidos.',
      );
    }

    this.#origen = origen;
    this.#destino = destino;
    this.#distanciaEstimadaM = validarEnteroNoNegativo(
      distanciaEstimadaM,
      'La distancia estimada no es válida.',
    );

    if (this.#distanciaEstimadaM === 0) {
      throw new ErrorDeDominio('DATOS_INVALIDOS', 'El destino debe ser distinto del origen.');
    }

    this.#precioFijadoCentavos = validarEnteroNoNegativo(
      precioFijadoCentavos,
      'El precio fijado no es válido.',
    );

    if (
      typeof multiplicadorFijado !== 'string' ||
      !/^\d+(\.\d{1,4})?$/.test(multiplicadorFijado.trim())
    ) {
      throw new ErrorDeDominio('DATOS_INVALIDOS', 'El multiplicador fijado no es válido.');
    }

    this.#cotizacionId =
      cotizacionId === null
        ? null
        : validarIdentificador(cotizacionId, 'El identificador de la cotización no es válido.');
    this.#multiplicadorFijado = multiplicadorFijado.trim();

    if (!ESTADOS_VALIDOS.has(estado)) {
      throw new ErrorDeDominio('DATOS_INVALIDOS', 'El estado del viaje no es válido.');
    }

    if (choferId !== null) {
      validarIdentificador(choferId, 'El identificador del chofer no es válido.');
    }

    if (ESTADOS_CON_CHOFER.has(estado) && choferId === null) {
      throw new ErrorDeDominio('DATOS_INVALIDOS', 'El estado del viaje requiere un chofer.');
    }

    if (ESTADOS_SIN_CHOFER.has(estado) && choferId !== null) {
      throw new ErrorDeDominio('DATOS_INVALIDOS', 'El estado del viaje no admite un chofer.');
    }

    if (ESTADOS_CANCELADOS.has(estado)) {
      validarMotivo(motivoCancelacion);
    }

    this.#choferId = choferId;
    this.#estado = estado;
    this.#solicitadoEn = validarFecha(solicitadoEn, 'La fecha de solicitud no es válida.');
    this.#asignadoEn = validarFechaOpcional(asignadoEn, 'La fecha de asignación no es válida.');
    this.#iniciadoEn = validarFechaOpcional(iniciadoEn, 'La fecha de inicio no es válida.');
    this.#cerradoEn = validarFechaOpcional(cerradoEn, 'La fecha de cierre no es válida.');

    if (
      (estado === ESTADOS_VIAJE.EN_CURSO || estado === ESTADOS_VIAJE.FINALIZADO) &&
      this.#iniciadoEn === null
    ) {
      throw new ErrorDeDominio(
        'DATOS_INVALIDOS',
        'El estado del viaje requiere una fecha de inicio.',
      );
    }
    this.#canceladoPorId =
      canceladoPorId === null
        ? null
        : validarIdentificador(canceladoPorId, 'El autor de la cancelación no es válido.');
    this.#motivoCancelacion = motivoCancelacion === null ? null : validarMotivo(motivoCancelacion);
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

  get precioFijadoCentavos() {
    return this.#precioFijadoCentavos;
  }

  get cotizacionId() {
    return this.#cotizacionId;
  }

  get multiplicadorFijado() {
    return this.#multiplicadorFijado;
  }

  get choferId() {
    return this.#choferId;
  }

  get estado() {
    return this.#estado;
  }

  get solicitadoEn() {
    return new Date(this.#solicitadoEn);
  }

  get asignadoEn() {
    return this.#asignadoEn ? new Date(this.#asignadoEn) : null;
  }

  get iniciadoEn() {
    return this.#iniciadoEn ? new Date(this.#iniciadoEn) : null;
  }

  get cerradoEn() {
    return this.#cerradoEn ? new Date(this.#cerradoEn) : null;
  }

  get canceladoPorId() {
    return this.#canceladoPorId;
  }

  get motivoCancelacion() {
    return this.#motivoCancelacion;
  }

  esParticipante(usuarioId) {
    return this.#pasajeroId === usuarioId || this.#choferId === usuarioId;
  }

  esTerminal() {
    return (
      ESTADOS_CANCELADOS.has(this.#estado) ||
      this.#estado === ESTADOS_VIAJE.FINALIZADO ||
      this.#estado === ESTADOS_VIAJE.SIN_CHOFERES_DISPONIBLES
    );
  }

  #copia(sobrescrituras) {
    return new Viaje({
      id: this.#id,
      pasajeroId: this.#pasajeroId,
      origen: this.#origen,
      destino: this.#destino,
      distanciaEstimadaM: this.#distanciaEstimadaM,
      precioFijadoCentavos: this.#precioFijadoCentavos,
      cotizacionId: this.#cotizacionId,
      multiplicadorFijado: this.#multiplicadorFijado,
      choferId: this.#choferId,
      estado: this.#estado,
      solicitadoEn: this.#solicitadoEn,
      asignadoEn: this.#asignadoEn,
      iniciadoEn: this.#iniciadoEn,
      cerradoEn: this.#cerradoEn,
      canceladoPorId: this.#canceladoPorId,
      motivoCancelacion: this.#motivoCancelacion,
      ...sobrescrituras,
    });
  }

  /** Asigna el viaje a un chofer. Solo se puede hacer una vez. */
  asignar(choferId, ahora) {
    if (this.#estado !== ESTADOS_VIAJE.SOLICITADO || this.#choferId !== null) {
      throw new ErrorDeDominio(
        'VIAJE_NO_DISPONIBLE',
        'El viaje ya no está disponible para ser aceptado.',
      );
    }

    return this.#copia({
      choferId: validarIdentificador(choferId, 'El identificador del chofer no es válido.'),
      estado: ESTADOS_VIAJE.ASIGNADO,
      asignadoEn: validarFecha(ahora, 'La fecha de asignación no es válida.'),
      iniciadoEn: null,
      cerradoEn: null,
      canceladoPorId: null,
      motivoCancelacion: null,
    });
  }

  /** Marca que el chofer asignado salió hacia el origen. */
  marcarEnCamino() {
    if (this.#estado !== ESTADOS_VIAJE.ASIGNADO) {
      throw new ErrorDeDominio(
        'TRANSICION_INVALIDA',
        'Solo un viaje asignado puede marcarse en camino.',
      );
    }

    return this.#copia({ estado: ESTADOS_VIAJE.CHOFER_EN_CAMINO });
  }

  /** Inicia el viaje con el chofer en camino y fija la fecha de inicio. */
  iniciar(ahora) {
    if (this.#estado !== ESTADOS_VIAJE.CHOFER_EN_CAMINO) {
      throw new ErrorDeDominio(
        'TRANSICION_INVALIDA',
        'Solo un viaje con el chofer en camino puede iniciarse.',
      );
    }

    return this.#copia({
      estado: ESTADOS_VIAJE.EN_CURSO,
      iniciadoEn: validarFecha(ahora, 'La fecha de inicio no es válida.'),
    });
  }

  /** Finaliza el viaje en curso y fija la fecha de cierre. */
  finalizar(ahora) {
    if (this.#estado !== ESTADOS_VIAJE.EN_CURSO) {
      throw new ErrorDeDominio('TRANSICION_INVALIDA', 'Solo un viaje en curso puede finalizarse.');
    }

    return this.#copia({
      estado: ESTADOS_VIAJE.FINALIZADO,
      cerradoEn: validarFecha(ahora, 'La fecha de cierre no es válida.'),
    });
  }

  /** Cancela el viaje por decisión de su pasajero. */
  cancelarPorPasajero(ahora, motivo) {
    if (
      this.#estado !== ESTADOS_VIAJE.SOLICITADO &&
      this.#estado !== ESTADOS_VIAJE.ASIGNADO &&
      this.#estado !== ESTADOS_VIAJE.CHOFER_EN_CAMINO
    ) {
      throw new ErrorDeDominio(
        'TRANSICION_INVALIDA',
        'El viaje ya no puede cancelarse en su estado actual.',
      );
    }

    return this.#copia({
      estado: ESTADOS_VIAJE.CANCELADO_POR_PASAJERO,
      cerradoEn: validarFecha(ahora, 'La fecha de cierre no es válida.'),
      canceladoPorId: this.#pasajeroId,
      motivoCancelacion: validarMotivo(motivo),
    });
  }

  /** Cancela el viaje por decisión del chofer asignado. */
  cancelarPorChofer(ahora, motivo) {
    if (
      this.#choferId === null ||
      (this.#estado !== ESTADOS_VIAJE.ASIGNADO && this.#estado !== ESTADOS_VIAJE.CHOFER_EN_CAMINO)
    ) {
      throw new ErrorDeDominio(
        'TRANSICION_INVALIDA',
        'El viaje ya no puede cancelarse por el chofer en su estado actual.',
      );
    }

    return this.#copia({
      estado: ESTADOS_VIAJE.CANCELADO_POR_CHOFER,
      cerradoEn: validarFecha(ahora, 'La fecha de cierre no es válida.'),
      canceladoPorId: this.#choferId,
      motivoCancelacion: validarMotivo(motivo),
    });
  }

  /**
   * Cancela el viaje por decisión del operador de soporte (RF-15).
   *
   * Es el único actor que puede cortar un viaje EN_CURSO: así ningún viaje
   * queda trabado en un estado del que nadie puede sacarlo. El chofer, si lo
   * había, queda como historial. Cancelar nunca genera cobro.
   */
  cancelarPorSoporte(ahora, motivo, soporteId) {
    if (
      this.#estado !== ESTADOS_VIAJE.SOLICITADO &&
      this.#estado !== ESTADOS_VIAJE.ASIGNADO &&
      this.#estado !== ESTADOS_VIAJE.CHOFER_EN_CAMINO &&
      this.#estado !== ESTADOS_VIAJE.EN_CURSO
    ) {
      throw new ErrorDeDominio(
        'TRANSICION_INVALIDA',
        'El viaje ya no puede cancelarse en su estado actual.',
      );
    }

    return this.#copia({
      estado: ESTADOS_VIAJE.CANCELADO_POR_SOPORTE,
      cerradoEn: validarFecha(ahora, 'La fecha de cierre no es válida.'),
      canceladoPorId: validarIdentificador(soporteId, 'El operador de soporte no es válido.'),
      motivoCancelacion: validarMotivo(motivo),
    });
  }

  aVistaPublica() {
    return {
      id: this.#id,
      pasajeroId: this.#pasajeroId,
      origen: this.#origen.aJSON(),
      destino: this.#destino.aJSON(),
      distanciaEstimadaM: this.#distanciaEstimadaM,
      precioFijadoCentavos: this.#precioFijadoCentavos,
      cotizacionId: this.#cotizacionId,
      multiplicadorFijado: this.#multiplicadorFijado,
      choferId: this.#choferId,
      estado: this.#estado,
      solicitadoEn: this.#solicitadoEn.toISOString(),
      asignadoEn: this.#asignadoEn ? this.#asignadoEn.toISOString() : null,
      iniciadoEn: this.#iniciadoEn ? this.#iniciadoEn.toISOString() : null,
      cerradoEn: this.#cerradoEn ? this.#cerradoEn.toISOString() : null,
      canceladoPorId: this.#canceladoPorId,
      motivoCancelacion: this.#motivoCancelacion,
    };
  }

  toJSON() {
    return this.aVistaPublica();
  }
}
