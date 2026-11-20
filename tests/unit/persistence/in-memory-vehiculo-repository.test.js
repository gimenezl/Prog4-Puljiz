import assert from 'node:assert/strict';
import test from 'node:test';

import { Vehiculo } from '../../../src/domain/entities/vehiculo.js';
import { InMemoryVehiculoRepository } from '../../../src/infrastructure/adapters/out/persistence/in-memory-vehiculo-repository.js';

const CHOFER_A = '00000000-0000-4000-8000-000000000010';
const CHOFER_B = '00000000-0000-4000-8000-000000000011';

function crearVehiculo({ id = '00000000-0000-4000-8000-000000000030', ...datos } = {}) {
  return new Vehiculo({
    id,
    choferId: CHOFER_A,
    patente: 'AB123CD',
    marca: 'Toyota',
    modelo: 'Etios',
    ...datos,
  });
}

test('guarda y recupera el vehículo de un chofer', async () => {
  const repositorio = new InMemoryVehiculoRepository();
  const vehiculo = crearVehiculo();

  assert.equal(await repositorio.buscarPorChoferId(CHOFER_A), null);

  await repositorio.guardar(vehiculo);
  assert.equal(await repositorio.buscarPorChoferId(CHOFER_A), vehiculo);
});

test('guardar de nuevo para el mismo chofer reemplaza los datos', async () => {
  const repositorio = new InMemoryVehiculoRepository();
  const vehiculo = crearVehiculo();

  await repositorio.guardar(vehiculo);
  await repositorio.guardar(
    vehiculo.conDatos({ patente: 'AB123CD', marca: 'Fiat', modelo: 'Uno' }),
  );

  const leido = await repositorio.buscarPorChoferId(CHOFER_A);
  assert.equal(leido.marca, 'Fiat');
  assert.equal(leido.id, vehiculo.id);
});

test('rechaza una patente que ya tiene otro chofer', async () => {
  const repositorio = new InMemoryVehiculoRepository();
  await repositorio.guardar(crearVehiculo());

  await assert.rejects(
    () =>
      repositorio.guardar(
        crearVehiculo({ id: '00000000-0000-4000-8000-000000000031', choferId: CHOFER_B }),
      ),
    (error) => error.codigo === 'PATENTE_YA_REGISTRADA',
  );

  assert.equal(await repositorio.buscarPorChoferId(CHOFER_B), null);
});
