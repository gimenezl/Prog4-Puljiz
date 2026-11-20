import assert from 'node:assert/strict';
import test from 'node:test';

import { ReglaDeMultiplicador } from '../../../src/domain/entities/regla-de-multiplicador.js';
import { Tarifa } from '../../../src/domain/entities/tarifa.js';
import { ZonaDeDemanda } from '../../../src/domain/entities/zona-de-demanda.js';

const AHORA = new Date('2026-01-01T00:00:00.000Z');

function codigoDe(funcion) {
  try {
    funcion();
  } catch (error) {
    return error.codigo;
  }

  return null;
}
const CRITERIO = {
  tipo: 'POLIGONO',
  puntos: [
    { lat: -34.62, lng: -58.4 },
    { lat: -34.59, lng: -58.4 },
    { lat: -34.59, lng: -58.36 },
    { lat: -34.62, lng: -58.36 },
  ],
};

test('la zona conserva su identidad al desactivarse', () => {
  const zona = new ZonaDeDemanda({
    id: 'zona-1',
    nombre: 'Centro',
    criterio: CRITERIO,
    creadaEn: AHORA,
  });
  const desactivada = zona.desactivar();

  assert.equal(zona.activa, true);
  assert.equal(desactivada.activa, false);
  assert.equal(desactivada.id, zona.id);
  assert.equal(desactivada.creadaEn.getTime(), AHORA.getTime());
});

test('la zona normaliza el cierre repetido del anillo', () => {
  const cerrada = new ZonaDeDemanda({
    id: 'zona-2',
    nombre: 'Centro',
    criterio: { ...CRITERIO, puntos: [...CRITERIO.puntos, CRITERIO.puntos[0]] },
    creadaEn: AHORA,
  });

  assert.equal(cerrada.criterio.puntos.length, 4);
});

test('una tarifa publicada es inmutable y solo se puede versionar de nuevo', () => {
  const borrador = new Tarifa({
    id: 'tarifa-1',
    baseCentavos: 100000,
    porKmCentavos: 50000,
    porMinutoCentavos: 10000,
    precioMaximoCentavos: 1000000,
    creadaEn: AHORA,
  });
  const publicada = borrador
    .publicar({
      vigenteDesde: AHORA,
      publicadaPorId: 'admin-1',
      publicadaEn: AHORA,
    })
    .conVersion(1);

  assert.equal(publicada.version, 1);
  assert.equal(
    codigoDe(() => publicada.conDatos({ baseCentavos: 1 })),
    'VERSION_YA_PUBLICADA',
  );
  assert.equal(
    codigoDe(() => publicada.publicar({})),
    'VERSION_YA_PUBLICADA',
  );
  assert.equal(borrador.version, null);
});

test('la regla valida umbrales, escala y rango antes de publicarse', () => {
  const datos = {
    id: 'regla-1',
    umbralInferior: '0.5',
    umbralSuperior: '3',
    multiplicadorMinimo: '1',
    multiplicadorMaximo: '2',
    escalaMultiplicador: 2,
    creadaEn: AHORA,
  };

  assert.throws(() => new ReglaDeMultiplicador({ ...datos, umbralSuperior: '0' }), /umbrales/);
  assert.throws(() => new ReglaDeMultiplicador({ ...datos, escalaMultiplicador: 5 }), /escala/);
  assert.throws(() => new ReglaDeMultiplicador({ ...datos, multiplicadorMaximo: '0.5' }), /rango/);

  const regla = new ReglaDeMultiplicador(datos).publicar({
    vigenteDesde: AHORA,
    publicadaPorId: 'admin-1',
    publicadaEn: AHORA,
  });
  assert.equal(regla.estado, 'PUBLICADA');
});
