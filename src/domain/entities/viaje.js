import { ErrorDeDominio } from '../errors/error-de-dominio.js';
import { PuntoGeografico } from '../value-objects/punto-geografico.js';

export const ESTADOS_VIAJE = Object.freeze({
  SOLICITADO: 'SOLICITADO',
  ASIGNADO: 'ASIGNADO',
  CANCELADO_POR_PASAJERO: 'CANCELADO_POR_PASAJERO',
  CANCELADO_POR_CHOFER: 'CANCELADO_POR_CHOFER',
  CANCELADO_POR_SOPORTE: 'CANCELADO_POR_SOPORTE',
  SIN_CHOFERES_DISPONIBLES: 'SIN_CHOFERES_DISPONIBLES',
  FINALIZADO: 'FINALIZADO',
});

const ESTADOS_VALIDOS = new Set(Object.values(ESTADOS_VIAJE));
const ESTADOS_CON_CHOFER = new Set([
  ESTADOS_VIAJE.ASIGNADO,
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
  if (typeof valor !== 'string' || valor.trim().length === 0) {
    throw new ErrorDeDominio(
      'DATOS_INVALIDOS',
      'El motivo de cancelación es obligatorio y no puede estar vacío.',
    );
  }

  return valor.trim();
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
  #choferId;
  #estado;
  #solicitadoEn;
  #asignadoEn;
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
    choferId = null,
    estado = ESTADOS_VIAJE.SOLICITADO,
    solicitadoEn,
    asignadoEn = null,
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
    this.#cerradoEn = validarFechaOpcional(cerradoEn, 'La fecha de cierre no es válida.');
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

  /** Asigna el viaje a un chofer. Solo se puede hacer una vez. */
  asignar(choferId, ahora) {
    if (this.#estado !== ESTADOS_VIAJE.SOLICITADO || this.#choferId !== null) {
      throw new ErrorDeDominio(
        'VIAJE_NO_DISPONIBLE',
        'El viaje ya no está disponible para ser aceptado.',
      );
    }

    return new Viaje({
      id: this.#id,
      pasajeroId: this.#pasajeroId,
      origen: this.#origen,
      destino: this.#destino,
      distanciaEstimadaM: this.#distanciaEstimadaM,
      precioFijadoCentavos: this.#precioFijadoCentavos,
      choferId: validarIdentificador(choferId, 'El identificador del chofer no es válido.'),
      estado: ESTADOS_VIAJE.ASIGNADO,
      solicitadoEn: this.#solicitadoEn,
      asignadoEn: validarFecha(ahora, 'La fecha de asignación no es válida.'),
    });
  }

  /** Cancela el viaje por decisión de su pasajero. */
  cancelarPorPasajero(ahora, motivo) {
    if (this.#estado !== ESTADOS_VIAJE.SOLICITADO && this.#estado !== ESTADOS_VIAJE.ASIGNADO) {
      throw new ErrorDeDominio(
        'TRANSICION_INVALIDA',
        'El viaje ya no puede cancelarse en su estado actual.',
      );
    }

    return new Viaje({
      id: this.#id,
      pasajeroId: this.#pasajeroId,
      origen: this.#origen,
      destino: this.#destino,
      distanciaEstimadaM: this.#distanciaEstimadaM,
      precioFijadoCentavos: this.#precioFijadoCentavos,
      choferId: this.#choferId,
      estado: ESTADOS_VIAJE.CANCELADO_POR_PASAJERO,
      solicitadoEn: this.#solicitadoEn,
      asignadoEn: this.#asignadoEn,
      cerradoEn: validarFecha(ahora, 'La fecha de cierre no es válida.'),
      canceladoPorId: this.#pasajeroId,
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
      choferId: this.#choferId,
      estado: this.#estado,
      solicitadoEn: this.#solicitadoEn.toISOString(),
      asignadoEn: this.#asignadoEn ? this.#asignadoEn.toISOString() : null,
      cerradoEn: this.#cerradoEn ? this.#cerradoEn.toISOString() : null,
      canceladoPorId: this.#canceladoPorId,
      motivoCancelacion: this.#motivoCancelacion,
    };
  }

  toJSON() {
    return this.aVistaPublica();
  }
}
