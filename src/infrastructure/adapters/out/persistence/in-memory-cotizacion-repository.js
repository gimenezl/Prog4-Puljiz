/**
 * Adaptador falso del puerto RepositorioCotizaciones. Las cotizaciones son
 * inmutables: `marcarEstado` reemplaza la entidad por otra con el mismo foto y
 * distinto estado, con la misma condición que el UPDATE real.
 */
export class InMemoryCotizacionRepository {
  #porId = new Map();

  async crear(cotizacion, _ejecutor) {
    if (this.#porId.has(cotizacion.id)) {
      throw new Error('Ya existe una cotización con el mismo identificador.');
    }

    this.#porId.set(cotizacion.id, cotizacion);
    return cotizacion;
  }

  async buscarPorId(id, _ejecutor) {
    return this.#porId.get(id) ?? null;
  }

  async ultimaPorZona(zonaId, _ejecutor) {
    return (
      [...this.#porId.values()]
        .filter((cotizacion) => cotizacion.zonaId === zonaId)
        .sort((a, b) => b.calculadaEn.getTime() - a.calculadaEn.getTime())[0] ?? null
    );
  }

  async listarPorPasajero(pasajeroId, _ejecutor) {
    return [...this.#porId.values()]
      .filter((cotizacion) => cotizacion.pasajeroId === pasajeroId)
      .sort((a, b) => b.calculadaEn.getTime() - a.calculadaEn.getTime());
  }

  async marcarEstado(id, estado, ahora, _ejecutor) {
    const cotizacion = this.#porId.get(id);

    if (!cotizacion || cotizacion.estado !== 'VIGENTE' || cotizacion.estaVencida(ahora)) {
      return false;
    }

    const actualizada = estado === 'CONFIRMADA' ? cotizacion.confirmar(ahora) : cotizacion.vencer();
    this.#porId.set(id, actualizada);
    return true;
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
