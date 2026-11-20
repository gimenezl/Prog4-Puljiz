const EPSILON = 1e-12;

function enSegmento(punto, a, b) {
  const cross = (punto.lng - a.lng) * (b.lat - a.lat) - (punto.lat - a.lat) * (b.lng - a.lng);

  if (Math.abs(cross) > EPSILON) return false;

  return (
    punto.lng >= Math.min(a.lng, b.lng) - EPSILON &&
    punto.lng <= Math.max(a.lng, b.lng) + EPSILON &&
    punto.lat >= Math.min(a.lat, b.lat) - EPSILON &&
    punto.lat <= Math.max(a.lat, b.lat) + EPSILON
  );
}

function orientacion(a, b, c) {
  const valor = (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng);

  if (Math.abs(valor) < EPSILON) return 0;
  return valor > 0 ? 1 : 2;
}

function segmentosSeCortan(a, b, c, d) {
  const o1 = orientacion(a, b, c);
  const o2 = orientacion(a, b, d);
  const o3 = orientacion(c, d, a);
  const o4 = orientacion(c, d, b);

  if (o1 !== o2 && o3 !== o4) return true;

  return (
    (o1 === 0 && enSegmento(c, a, b)) ||
    (o2 === 0 && enSegmento(d, a, b)) ||
    (o3 === 0 && enSegmento(a, c, d)) ||
    (o4 === 0 && enSegmento(b, c, d))
  );
}

/** Punto dentro o sobre el borde del polígono (equivalente a ST_Covers). */
export function puntoDentroDePoligono(punto, puntos) {
  if (!punto || puntos.length < 3) return false;

  let dentro = false;

  for (let i = 0, j = puntos.length - 1; i < puntos.length; j = i, i += 1) {
    const actual = puntos[i];
    const anterior = puntos[j];

    if (enSegmento(punto, anterior, actual)) return true;

    const cruza =
      actual.lat > punto.lat !== anterior.lat > punto.lat &&
      punto.lng <
        ((anterior.lng - actual.lng) * (punto.lat - actual.lat)) / (anterior.lat - actual.lat) +
          actual.lng;

    if (cruza) dentro = !dentro;
  }

  return dentro;
}

/** Dos polígonos se solapan si comparten área o aunque sea un borde. */
export function poligonosSeSolapan(puntosA, puntosB) {
  for (const punto of puntosA) {
    if (puntoDentroDePoligono(punto, puntosB)) return true;
  }

  for (const punto of puntosB) {
    if (puntoDentroDePoligono(punto, puntosA)) return true;
  }

  for (let i = 0; i < puntosA.length; i += 1) {
    const a = puntosA[i];
    const b = puntosA[(i + 1) % puntosA.length];

    for (let j = 0; j < puntosB.length; j += 1) {
      if (segmentosSeCortan(a, b, puntosB[j], puntosB[(j + 1) % puntosB.length])) {
        return true;
      }
    }
  }

  return false;
}

/** Convierte el criterio de la API a WKT para PostGIS, cerrando el anillo. */
export function criterioAWkt(criterio) {
  const puntos = criterio.puntos.map((punto) => `${punto.lng} ${punto.lat}`);
  const primero = puntos[0];

  return `SRID=4326;POLYGON((${[...puntos, primero].join(', ')}))`;
}
