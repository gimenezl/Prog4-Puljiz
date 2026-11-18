import assert from 'node:assert/strict';
import test from 'node:test';

import { CobroSimulado, ESTADOS_COBRO } from '../../../src/domain/entities/cobro-simulado.js';

const CREACION = new Date('2026-01-01T00:00:00.000Z');
const COBRO = new Date('2026-01-01T00:10:00.000Z');

function crearCobro(sobrescrituras = {}) {
  return new CobroSimulado({
    id: '00000000-0000-4000-8000-000000000010',
    viajeId: '00000000-0000-4000-8000-000000000001',
    montoCentavos: 160000,
    creadoEn: CREACION,
    ...sobrescrituras,
  });
}

test('crea un cobro pendiente con monto y vista pública serializable', () => {
  const cobro = crearCobro();

  assert.equal(cobro.estado, ESTADOS_COBRO.PENDIENTE);
  assert.equal(cobro.montoCentavos, 160000);
  assert.equal(cobro.cobradoEn, null);
  assert.equal(cobro.referencia, null);
  assert.deepEqual(cobro.aVistaPublica(), {
    id: '00000000-0000-4000-8000-000000000010',
    viajeId: '00000000-0000-4000-8000-000000000001',
    montoCentavos: 160000,
    estado: 'PENDIENTE',
    creadoEn: CREACION.toISOString(),
    cobradoEn: null,
    referencia: null,
  });
});

test('cobrar confirma una sola vez y un segundo intento devuelve el mismo cobro', () => {
  const pendiente = crearCobro();
  const cobrado = pendiente.cobrar(COBRO, 'SIM-viaje-1');

  assert.equal(cobrado.estado, ESTADOS_COBRO.COBRADO);
  assert.equal(cobrado.cobradoEn.getTime(), COBRO.getTime());
  assert.equal(cobrado.referencia, 'SIM-viaje-1');
  assert.equal(pendiente.estado, ESTADOS_COBRO.PENDIENTE);

  const reintento = cobrado.cobrar(new Date('2026-01-02T00:00:00.000Z'), 'OTRA-REFERENCIA');
  assert.equal(reintento, cobrado);
  assert.equal(reintento.cobradoEn.getTime(), COBRO.getTime());
  assert.equal(reintento.referencia, 'SIM-viaje-1');
});

test('rechaza montos, estados y combinaciones incoherentes', () => {
  assert.throws(
    () => crearCobro({ montoCentavos: -1 }),
    (error) => error.codigo === 'DATOS_INVALIDOS',
  );
  assert.throws(
    () => crearCobro({ montoCentavos: 10.5 }),
    (error) => error.codigo === 'DATOS_INVALIDOS',
  );
  assert.throws(
    () => crearCobro({ estado: 'DESCONOCIDO' }),
    (error) => error.codigo === 'DATOS_INVALIDOS',
  );
  assert.throws(
    () => crearCobro({ estado: ESTADOS_COBRO.COBRADO }),
    (error) => error.codigo === 'DATOS_INVALIDOS',
  );
  assert.throws(
    () => crearCobro({ cobradoEn: COBRO, referencia: 'SIM-1' }),
    (error) => error.codigo === 'DATOS_INVALIDOS',
  );
  assert.throws(
    () =>
      crearCobro({
        estado: ESTADOS_COBRO.COBRADO,
        cobradoEn: COBRO,
        referencia: '',
      }),
    (error) => error.codigo === 'DATOS_INVALIDOS',
  );
});
