import assert from 'node:assert/strict';
import test from 'node:test';

import { UbicacionChofer } from '../../../src/domain/entities/ubicacion-chofer.js';
import { InMemoryUbicacionRepository } from '../../../src/infrastructure/adapters/out/persistence/in-memory-ubicacion-repository.js';

const CHOFER_ID = '00000000-0000-4000-8000-000000000010';

function ubicacion(lat, actualizadaEn) {
  return new UbicacionChofer({
    choferId: CHOFER_ID,
    punto: { lat, lng: -58.38 },
    actualizadaEn: new Date(actualizadaEn),
  });
}

test('guarda y reemplaza la ubicación vigente del chofer', async () => {
  const repositorio = new InMemoryUbicacionRepository();

  assert.equal(await repositorio.buscarPorChoferId(CHOFER_ID), null);

  await repositorio.guardar(ubicacion(-34.6, '2026-11-20T18:00:00.000Z'));
  await repositorio.guardar(ubicacion(-34.7, '2026-11-20T18:00:02.000Z'));

  assert.equal((await repositorio.buscarPorChoferId(CHOFER_ID)).punto.lat, -34.7);
});

test('un envío más viejo no pisa la ubicación más reciente', async () => {
  const repositorio = new InMemoryUbicacionRepository();

  await repositorio.guardar(ubicacion(-34.7, '2026-11-20T18:00:02.000Z'));
  await repositorio.guardar(ubicacion(-34.6, '2026-11-20T18:00:00.000Z'));

  assert.equal((await repositorio.buscarPorChoferId(CHOFER_ID)).punto.lat, -34.7);
});
