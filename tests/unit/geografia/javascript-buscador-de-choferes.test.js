import assert from 'node:assert/strict';
import test from 'node:test';

import { Chofer } from '../../../src/domain/entities/chofer.js';
import { UbicacionChofer } from '../../../src/domain/entities/ubicacion-chofer.js';
import { JavaScriptBuscadorDeChoferes } from '../../../src/infrastructure/adapters/out/geografia/javascript-buscador-de-choferes.js';
import { InMemoryChoferRepository } from '../../../src/infrastructure/adapters/out/persistence/in-memory-chofer-repository.js';
import { InMemoryUbicacionRepository } from '../../../src/infrastructure/adapters/out/persistence/in-memory-ubicacion-repository.js';
import { BELGRANO, CONGRESO, OBELISCO, PALERMO } from '../../helpers/lugares.js';

const AHORA = new Date('2026-11-23T18:00:00.000Z');
const VIGENCIA_MS = 60_000;

async function prepararEscenario() {
  const repositorioChoferes = new InMemoryChoferRepository();
  const repositorioUbicaciones = new InMemoryUbicacionRepository();

  async function chofer(
    id,
    { habilitado = true, disponible = true, viaje = null, punto, haceMs = 0 },
  ) {
    await repositorioChoferes.crear(
      new Chofer({ usuarioId: id, habilitado, disponible, viajeActivoId: viaje }),
    );

    if (punto) {
      await repositorioUbicaciones.guardar(
        new UbicacionChofer({
          choferId: id,
          punto,
          actualizadaEn: new Date(AHORA.getTime() - haceMs),
        }),
      );
    }
  }

  await chofer('palermo', { punto: PALERMO });
  await chofer('congreso', { punto: CONGRESO });
  await chofer('belgrano', { punto: BELGRANO });
  await chofer('inhabilitado', { habilitado: false, disponible: false, punto: OBELISCO });
  await chofer('no-disponible', { disponible: false, punto: OBELISCO });
  await chofer('ocupado', { viaje: 'viaje-1', punto: OBELISCO });
  await chofer('vencido', { punto: OBELISCO, haceMs: VIGENCIA_MS });
  await chofer('sin-ubicacion', {});

  return new JavaScriptBuscadorDeChoferes({ repositorioChoferes, repositorioUbicaciones });
}

const criterios = (sobrescrituras = {}) => ({
  origen: OBELISCO,
  radioM: 5000,
  limite: 10,
  ahora: AHORA,
  vigenciaUbicacionMs: VIGENCIA_MS,
  ...sobrescrituras,
});

test('devuelve solo choferes elegibles dentro del radio, del más cercano al más lejano', async () => {
  const buscador = await prepararEscenario();

  const resultado = await buscador.buscar(criterios());

  assert.deepEqual(
    resultado.map((candidato) => candidato.choferId),
    ['congreso', 'palermo'],
  );
  // Distancias reales en metros: Congreso ~1,2 km y Palermo ~4,8 km.
  assert.equal(Math.round(resultado[0].distanciaM / 100), 12);
  assert.equal(Math.round(resultado[1].distanciaM / 100), 48);
});

test('respeta el límite de candidatos y el radio', async () => {
  const buscador = await prepararEscenario();

  assert.deepEqual(
    (await buscador.buscar(criterios({ limite: 1 }))).map((c) => c.choferId),
    ['congreso'],
  );
  assert.deepEqual(
    (await buscador.buscar(criterios({ radioM: 9000 }))).map((c) => c.choferId),
    ['congreso', 'palermo', 'belgrano'],
  );
  assert.deepEqual(await buscador.buscar(criterios({ radioM: 500 })), []);
});
