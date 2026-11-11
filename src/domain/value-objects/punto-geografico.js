import { ErrorDeDominio } from '../errors/error-de-dominio.js';

const RADIO_TIERRA_M = 6_371_000;
const A_RADIANES = Math.PI / 180;

function validarCoordenada(valor, minimo, maximo, nombre) {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < minimo || valor > maximo) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', `La coordenada ${nombre} no es válida.`);
  }

  return valor;
}

/**
 * Punto geográfico del dominio. No conoce mapas ni proveedores externos:
 * solo valida coordenadas y calcula una distancia aproximada.
 */
export class PuntoGeografico {
  #lat;
  #lng;

  constructor({ lat, lng }) {
    this.#lat = validarCoordenada(lat, -90, 90, 'latitud');
    this.#lng = validarCoordenada(lng, -180, 180, 'longitud');
  }

  get lat() {
    return this.#lat;
  }

  get lng() {
    return this.#lng;
  }

  /** Distancia en metros con la fórmula de Haversine. */
  distanciaA(otro) {
    if (!(otro instanceof PuntoGeografico)) {
      throw new ErrorDeDominio('DATOS_INVALIDOS', 'El punto de destino no es válido.');
    }

    const diferenciaLat = (otro.#lat - this.#lat) * A_RADIANES;
    const diferenciaLng = (otro.#lng - this.#lng) * A_RADIANES;
    const lat1 = this.#lat * A_RADIANES;
    const lat2 = otro.#lat * A_RADIANES;

    const a =
      Math.sin(diferenciaLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(diferenciaLng / 2) ** 2;

    return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  aJSON() {
    return { lat: this.#lat, lng: this.#lng };
  }
}
