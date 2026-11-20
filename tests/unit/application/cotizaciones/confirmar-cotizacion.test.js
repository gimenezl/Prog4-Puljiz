import assert from 'node:assert/strict';
import test from 'node:test';

import { crearKitCotizaciones, PASAJERO } from '../../../helpers/cotizaciones-kit.js';

async function codigoDe(funcion) {
  try {
    await funcion();
    return null;
  } catch (error) {
    return error.codigo;
  }
}

test('confirmar copia precio y multiplicador al viaje sin recalcular', async () => {
  const kit = crearKitCotizaciones();
  await kit.prepararConfiguracion();
  await kit.crearSolicitudes(7);
  await kit.crearChoferesDisponibles(4);
  const cotizacion = await kit.cotizarComoPasajero();

  const { viaje, reutilizada } = await kit.confirmarComoPasajero(cotizacion.id, 'clave-1');

  assert.equal(reutilizada, false);
  assert.equal(viaje.cotizacionId, cotizacion.id);
  assert.equal(viaje.multiplicadorFijado, cotizacion.multiplicador);
  assert.equal(viaje.precioFijadoCentavos, cotizacion.precioCentavos);
  assert.equal(viaje.estado, 'SOLICITADO');

  const guardada = await kit.repositorioCotizaciones.buscarPorId(cotizacion.id);
  assert.equal(guardada.estado, 'CONFIRMADA');
});

test('la misma clave devuelve el mismo viaje aunque cambie la demanda', async () => {
  const kit = crearKitCotizaciones();
  await kit.prepararConfiguracion();
  await kit.crearChoferesDisponibles(4);
  const cotizacion = await kit.cotizarComoPasajero();
  const primera = await kit.confirmarComoPasajero(cotizacion.id, 'clave-1');

  await kit.crearSolicitudes(40);
  const segunda = await kit.confirmarComoPasajero(cotizacion.id, 'clave-1');

  assert.equal(segunda.reutilizada, true);
  assert.deepEqual(segunda.viaje, primera.viaje);
  assert.equal(segunda.viaje.multiplicadorFijado, cotizacion.multiplicador);
  const viajesDeLaCotizacion = (await kit.repositorioViajes.listarActivosDesde(new Date(0))).filter(
    (viaje) => viaje.cotizacionId === cotizacion.id,
  );
  assert.equal(viajesDeLaCotizacion.length, 1);
});

test('la misma clave con otro contenido se rechaza', async () => {
  const kit = crearKitCotizaciones();
  await kit.prepararConfiguracion();
  const cotizacion = await kit.cotizarComoPasajero();
  await kit.confirmarComoPasajero(cotizacion.id, 'clave-1');

  assert.equal(
    await codigoDe(() =>
      kit.confirmarCotizacion({
        cotizacionId: '00000000-0000-4000-8000-000000000001',
        pasajeroId: PASAJERO.id,
        claveIdempotencia: 'clave-1',
      }),
    ),
    'CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO',
  );
});

test('una cotización vencida no se puede confirmar', async () => {
  const kit = crearKitCotizaciones({ vigenciaMs: 60_000 });
  await kit.prepararConfiguracion();
  const cotizacion = await kit.cotizarComoPasajero();

  kit.reloj.avanzar(60_000);

  assert.equal(
    await codigoDe(() => kit.confirmarComoPasajero(cotizacion.id, 'clave-vencida')),
    'COTIZACION_VENCIDA',
  );
  assert.equal(
    (await kit.obtenerCotizacion({ cotizacionId: cotizacion.id, actor: PASAJERO })).estado,
    'VENCIDA',
  );
  assert.equal((await kit.repositorioViajes.listarActivosDesde(new Date(0))).length, 0);
});

test('no se puede confirmar dos veces con claves distintas', async () => {
  const kit = crearKitCotizaciones();
  await kit.prepararConfiguracion();
  const cotizacion = await kit.cotizarComoPasajero();
  await kit.confirmarComoPasajero(cotizacion.id, 'clave-1');

  assert.equal(
    await codigoDe(() => kit.confirmarComoPasajero(cotizacion.id, 'clave-2')),
    'COTIZACION_YA_CONFIRMADA',
  );
});

test('valida propiedad y clave de idempotencia obligatoria', async () => {
  const kit = crearKitCotizaciones();
  await kit.prepararConfiguracion();
  const cotizacion = await kit.cotizarComoPasajero();

  assert.equal(
    await codigoDe(() =>
      kit.confirmarCotizacion({
        cotizacionId: cotizacion.id,
        pasajeroId: 'otro-pasajero',
        claveIdempotencia: 'clave-1',
      }),
    ),
    'NO_ENCONTRADO',
  );
  assert.equal(
    await codigoDe(() =>
      kit.confirmarCotizacion({
        cotizacionId: cotizacion.id,
        pasajeroId: PASAJERO.id,
        claveIdempotencia: '   ',
      }),
    ),
    'CLAVE_DE_IDEMPOTENCIA_REQUERIDA',
  );
});
