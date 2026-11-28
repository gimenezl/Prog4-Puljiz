import assert from 'node:assert/strict';
import test from 'node:test';

import { Viaje } from '../../../src/domain/entities/viaje.js';
import { PuntoGeografico } from '../../../src/domain/value-objects/punto-geografico.js';
import { InMemoryViajeRepository } from '../../../src/infrastructure/adapters/out/persistence/in-memory-viaje-repository.js';

const PASAJERO = '00000000-0000-4000-8000-0000000000a1';
const OTRO = '00000000-0000-4000-8000-0000000000a2';

function viaje(numero, { pasajeroId = PASAJERO, minuto = numero } = {}) {
  return new Viaje({
    id: `00000000-0000-4000-8000-${String(numero).padStart(12, '0')}`,
    pasajeroId,
    origen: new PuntoGeografico({ lat: -34.6, lng: -58.38 }),
    destino: new PuntoGeografico({ lat: -34.61, lng: -58.37 }),
    distanciaEstimadaM: 1000,
    precioFijadoCentavos: 150000,
    estado: 'SOLICITADO',
    solicitadoEn: new Date(Date.UTC(2026, 10, 1, 12, minuto)),
  });
}

test('el historial pagina por cursor del más nuevo al más viejo, solo con viajes propios', async () => {
  const repositorio = new InMemoryViajeRepository();
  for (let n = 1; n <= 5; n += 1) await repositorio.crear(viaje(n));
  await repositorio.crear(viaje(6, { pasajeroId: OTRO }));

  const primera = await repositorio.listarPorParticipante(PASAJERO, { limite: 2 });
  assert.deepEqual(
    primera.map((v) => v.id.slice(-1)),
    ['5', '4'],
  );

  const ultimo = primera.at(-1);
  const segunda = await repositorio.listarPorParticipante(PASAJERO, {
    limite: 2,
    antesDe: { solicitadoEn: ultimo.solicitadoEn, id: ultimo.id },
  });
  assert.deepEqual(
    segunda.map((v) => v.id.slice(-1)),
    ['3', '2'],
  );
});

test('a igual fecha desempata por id, sin repetir ni saltear viajes', async () => {
  const repositorio = new InMemoryViajeRepository();
  for (let n = 1; n <= 4; n += 1) await repositorio.crear(viaje(n, { minuto: 0 }));

  const vistos = [];
  let antesDe = null;

  for (;;) {
    const pagina = await repositorio.listarPorParticipante(PASAJERO, { limite: 3, antesDe });
    if (pagina.length === 0) break;
    vistos.push(...pagina.map((v) => v.id.slice(-1)));
    const ultimo = pagina.at(-1);
    antesDe = { solicitadoEn: ultimo.solicitadoEn, id: ultimo.id };
  }

  assert.deepEqual(vistos, ['4', '3', '2', '1']);
});
