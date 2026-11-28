import { ESTADOS_DEMANDA_ACTIVA, ESTADOS_VIAJE } from '../../../../domain/entities/viaje.js';
import { ErrorDeDominio } from '../../../../domain/errors/error-de-dominio.js';
import { PuntoGeografico } from '../../../../domain/value-objects/punto-geografico.js';

const ESTADOS_ACTIVOS = new Set(ESTADOS_DEMANDA_ACTIVA);

// Orden del historial: más nuevo primero; a igual fecha, id descendente.
function compararDescendente(a, b) {
  return (
    b.solicitadoEn.getTime() - a.solicitadoEn.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
  );
}

// Igual que `(solicitado_en, id) < (antesDe)` en SQL: compara como tupla.
function esAnterior(viaje, antesDe) {
  const tiempo = viaje.solicitadoEn.getTime();
  const tiempoCursor = antesDe.solicitadoEn.getTime();
  return tiempo < tiempoCursor || (tiempo === tiempoCursor && viaje.id < antesDe.id);
}

function paginar(viajes, antesDe, limite) {
  return viajes
    .filter((viaje) => antesDe === null || esAnterior(viaje, antesDe))
    .sort(compararDescendente)
    .slice(0, limite);
}

/**
 * Adaptador falso del puerto RepositorioViajes. Las entidades son inmutables,
 * por lo que el mapa se puede copiar sin clonar cada viaje.
 */
export class InMemoryViajeRepository {
  #porId = new Map();

  async crear(viaje, _ejecutor) {
    if (this.#porId.has(viaje.id)) {
      throw new Error('Ya existe un viaje con el mismo identificador.');
    }

    this.#porId.set(viaje.id, viaje);
  }

  async buscarPorId(id, _ejecutor) {
    return this.#porId.get(id) ?? null;
  }

  async buscarPorIdParaActualizar(id, _ejecutor) {
    return this.#porId.get(id) ?? null;
  }

  async actualizar(viaje, _ejecutor) {
    if (!this.#porId.has(viaje.id)) {
      throw new ErrorDeDominio('NO_ENCONTRADO', 'El viaje no existe.');
    }

    this.#porId.set(viaje.id, viaje);
  }

  async listarSolicitados(limite = 50, _ejecutor) {
    return [...this.#porId.values()]
      .filter((viaje) => viaje.estado === ESTADOS_VIAJE.SOLICITADO)
      .sort((a, b) => {
        const diferencia = a.solicitadoEn.getTime() - b.solicitadoEn.getTime();
        return diferencia !== 0 ? diferencia : a.id.localeCompare(b.id);
      })
      .slice(0, limite);
  }

  /** Igual que el adaptador real, pero midiendo la distancia con Haversine. */
  async listarPorParticipante(usuarioId, { estados = null, antesDe = null, limite }, _ejecutor) {
    return paginar(
      [...this.#porId.values()].filter(
        (viaje) =>
          viaje.esParticipante(usuarioId) && (estados === null || estados.includes(viaje.estado)),
      ),
      antesDe,
      limite,
    );
  }

  async listarActivos({ antesDe = null, limite }, _ejecutor) {
    return paginar(
      [...this.#porId.values()].filter((viaje) => ESTADOS_ACTIVOS.has(viaje.estado)),
      antesDe,
      limite,
    );
  }

  async listarSolicitadosCerca(punto, radioM, limite = 50, _ejecutor) {
    const centro = new PuntoGeografico(punto);

    return [...this.#porId.values()]
      .filter((viaje) => viaje.estado === ESTADOS_VIAJE.SOLICITADO)
      .map((viaje) => ({ viaje, distanciaM: Math.round(centro.distanciaA(viaje.origen)) }))
      .filter(({ distanciaM }) => distanciaM <= radioM)
      .sort(
        (a, b) =>
          a.distanciaM - b.distanciaM ||
          a.viaje.solicitadoEn.getTime() - b.viaje.solicitadoEn.getTime() ||
          a.viaje.id.localeCompare(b.viaje.id),
      )
      .slice(0, limite);
  }

  async listarActivosDesde(desde, _ejecutor) {
    return [...this.#porId.values()].filter(
      (viaje) =>
        ESTADOS_ACTIVOS.has(viaje.estado) && viaje.solicitadoEn.getTime() >= desde.getTime(),
    );
  }

  async verificarDisponibilidad() {
    return true;
  }

  instantaneaMemoria() {
    return new Map(this.#porId);
  }

  restaurarMemoria(instantanea) {
    this.#porId = new Map(instantanea);
  }
}
