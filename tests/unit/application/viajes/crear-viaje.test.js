import assert from 'node:assert/strict';
import test from 'node:test';

import { crearKitViajes, DESTINO, ORIGEN } from '../../../helpers/viajes-kit.js';

test('crea un viaje con precio calculado en el servidor', async () => {
  const kit = crearKitViajes();
  const pasajeroId = kit.crearPasajero();

  const { viaje, reutilizada } = await kit.crearViaje({
    pasajeroId,
    origen: ORIGEN,
    destino: DESTINO,
    claveIdempotencia: 'clave-1',
  });

  assert.equal(reutilizada, false);
  assert.equal(viaje.estado, 'SOLICITADO');
  assert.equal(viaje.pasajeroId, pasajeroId);
  assert.equal(Number.isInteger(viaje.distanciaEstimadaM), true);
  assert.equal(viaje.distanciaEstimadaM > 0, true);
  assert.equal(Number.isInteger(viaje.precioFijadoCentavos), true);
  assert.equal(viaje.precioFijadoCentavos >= 150000, true);
  assert.equal(viaje.precioFijadoCentavos <= 1000000, true);
});

test('exige Idempotency-Key y rechaza un origen igual al destino', async () => {
  const kit = crearKitViajes();

  await assert.rejects(
    () =>
      kit.crearViaje({
        pasajeroId: kit.crearPasajero(),
        origen: ORIGEN,
        destino: DESTINO,
      }),
    (error) => error.codigo === 'CLAVE_DE_IDEMPOTENCIA_REQUERIDA',
  );

  await assert.rejects(
    () =>
      kit.crearViaje({
        pasajeroId: kit.crearPasajero(),
        origen: ORIGEN,
        destino: ORIGEN,
        claveIdempotencia: 'clave-2',
      }),
    (error) => error.codigo === 'DATOS_INVALIDOS',
  );
});

test('reintentar con la misma clave y cuerpo devuelve el viaje original', async () => {
  const kit = crearKitViajes();
  const pasajeroId = kit.crearPasajero();
  const datos = {
    pasajeroId,
    origen: ORIGEN,
    destino: DESTINO,
    claveIdempotencia: 'clave-repetida',
  };

  const primera = await kit.crearViaje(datos);
  const segunda = await kit.crearViaje(datos);

  assert.equal(primera.reutilizada, false);
  assert.equal(segunda.reutilizada, true);
  assert.equal(segunda.viaje.id, primera.viaje.id);
  assert.equal((await kit.repositorioViajes.listarSolicitados(10)).length, 1);
});

test('la misma clave con otro contenido se rechaza', async () => {
  const kit = crearKitViajes();
  const pasajeroId = kit.crearPasajero();
  const claveIdempotencia = 'clave-conflicto';

  await kit.crearViaje({ pasajeroId, origen: ORIGEN, destino: DESTINO, claveIdempotencia });

  await assert.rejects(
    () =>
      kit.crearViaje({
        pasajeroId,
        origen: ORIGEN,
        destino: { lat: -34.62, lng: -58.4 },
        claveIdempotencia,
      }),
    (error) => error.codigo === 'CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO',
  );

  assert.equal((await kit.repositorioViajes.listarSolicitados(10)).length, 1);
});

test('la clave se aísla por pasajero', async () => {
  const kit = crearKitViajes();
  const claveIdempotencia = 'clave-compartida';

  const primera = await kit.crearViaje({
    pasajeroId: kit.crearPasajero(),
    origen: ORIGEN,
    destino: DESTINO,
    claveIdempotencia,
  });
  const segunda = await kit.crearViaje({
    pasajeroId: kit.crearPasajero(),
    origen: ORIGEN,
    destino: DESTINO,
    claveIdempotencia,
  });

  assert.notEqual(primera.viaje.id, segunda.viaje.id);
  assert.equal(segunda.reutilizada, false);
});

test('una clave vencida permite crear un viaje nuevo', async () => {
  const kit = crearKitViajes({ ttlIdempotenciaMs: 60_000 });
  const pasajeroId = kit.crearPasajero();
  const datos = {
    pasajeroId,
    origen: ORIGEN,
    destino: DESTINO,
    claveIdempotencia: 'clave-vencida',
  };

  const primera = await kit.crearViaje(datos);
  kit.reloj.avanzar(60_001);
  const segunda = await kit.crearViaje(datos);

  assert.notEqual(primera.viaje.id, segunda.viaje.id);
  assert.equal(segunda.reutilizada, false);
});

test('dos creaciones simultáneas con la misma clave generan un solo viaje', async () => {
  const kit = crearKitViajes();
  const datos = {
    pasajeroId: kit.crearPasajero(),
    origen: ORIGEN,
    destino: DESTINO,
    claveIdempotencia: 'clave-concurrente',
  };

  const resultados = await Promise.all([kit.crearViaje(datos), kit.crearViaje(datos)]);

  assert.equal(resultados[0].viaje.id, resultados[1].viaje.id);
  assert.equal(resultados.filter((resultado) => resultado.reutilizada).length, 1);
  assert.equal((await kit.repositorioViajes.listarSolicitados(10)).length, 1);
});
