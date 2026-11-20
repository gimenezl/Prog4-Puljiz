import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADMIN,
  AHORA,
  crearKitCotizaciones,
  DESTINO,
  ORIGEN,
  PASAJERO,
} from '../../../helpers/cotizaciones-kit.js';

async function codigoDe(funcion) {
  try {
    await funcion();
    return null;
  } catch (error) {
    return error.codigo;
  }
}

test('cotiza con demanda baja y guarda la trazabilidad completa', async () => {
  const kit = crearKitCotizaciones();
  const { zona, tarifa, regla } = await kit.prepararConfiguracion();
  await kit.crearSolicitudes(1);
  await kit.crearChoferesDisponibles(4);

  const vista = await kit.cotizarComoPasajero();
  const guardada = await kit.repositorioCotizaciones.buscarPorId(vista.id);

  assert.equal(vista.multiplicador, '1.00');
  assert.equal(vista.solicitudesUsadas, 1);
  assert.equal(vista.choferesDisponiblesUsados, 4);
  assert.equal(vista.estado, 'VIGENTE');
  assert.equal(vista.venceEn, new Date(AHORA.getTime() + 5 * 60_000).toISOString());
  assert.equal(vista.reglaVersion, 1);
  assert.equal(vista.tarifaVersion, 1);
  assert.equal(guardada.zonaId, zona.id);
  assert.equal(guardada.reglaId, regla.id);
  assert.equal(guardada.tarifaId, tarifa.id);
  assert.equal(guardada.precioCentavos, vista.precioCentavos);
  assert.equal(guardada.parametrosConteo.zonaId, zona.id);
  assert.equal(guardada.parametrosConteo.ventanaMs, 5 * 60_000);
});

test('aplica los umbrales cerrados y la demanda alta', async () => {
  const kit = crearKitCotizaciones();
  await kit.prepararConfiguracion();
  await kit.crearChoferesDisponibles(4);

  await kit.crearSolicitudes(2);
  assert.equal((await kit.cotizarComoPasajero()).multiplicador, '1.00');

  const kitAlto = crearKitCotizaciones();
  await kitAlto.prepararConfiguracion();
  await kitAlto.crearChoferesDisponibles(4);
  await kitAlto.crearSolicitudes(12);
  assert.equal((await kitAlto.cotizarComoPasajero()).multiplicador, '2.00');

  const kitIntermedio = crearKitCotizaciones();
  await kitIntermedio.prepararConfiguracion();
  await kitIntermedio.crearChoferesDisponibles(4);
  await kitIntermedio.crearSolicitudes(7);
  assert.equal((await kitIntermedio.cotizarComoPasajero()).multiplicador, '1.50');
});

test('sin choferes: 0/0 usa el mínimo y demanda sin choferes usa el máximo', async () => {
  const kitVacio = crearKitCotizaciones();
  await kitVacio.prepararConfiguracion();
  assert.equal((await kitVacio.cotizarComoPasajero()).multiplicador, '1.00');

  const kitSinChoferes = crearKitCotizaciones();
  await kitSinChoferes.prepararConfiguracion();
  await kitSinChoferes.crearSolicitudes(1);
  assert.equal((await kitSinChoferes.cotizarComoPasajero()).multiplicador, '2.00');
});

test('no cuenta viajes fuera de la ventana ni ubicaciones vencidas', async () => {
  const kit = crearKitCotizaciones();
  await kit.prepararConfiguracion();
  await kit.crearSolicitudes(20, { minutosAtras: 6 });
  await kit.crearChoferesDisponibles(20, {
    actualizadaEn: new Date(AHORA.getTime() - 5 * 60_000),
  });

  const vista = await kit.cotizarComoPasajero();
  assert.equal(vista.solicitudesUsadas, 0);
  assert.equal(vista.choferesDisponiblesUsados, 0);
  assert.equal(vista.multiplicador, '1.00');
});

test('rechaza cotizar fuera de cobertura o sin configuración publicada', async () => {
  const kit = crearKitCotizaciones();
  await kit.prepararConfiguracion();

  assert.equal(
    await codigoDe(() =>
      kit.cotizar({
        pasajeroId: PASAJERO.id,
        origen: { lat: 0, lng: 0 },
        destino: DESTINO,
      }),
    ),
    'FUERA_DE_COBERTURA',
  );

  const kitSinPublicar = crearKitCotizaciones();
  await kitSinPublicar.prepararConfiguracion({ publicar: false });

  assert.equal(
    await codigoDe(() => kitSinPublicar.cotizarComoPasajero()),
    'CONFIGURACION_INCOMPLETA',
  );
});

test('una publicación nueva cambia la versión usada por las cotizaciones posteriores', async () => {
  const kit = crearKitCotizaciones();
  const { tarifa } = await kit.prepararConfiguracion();

  const primera = await kit.cotizarComoPasajero();
  const borrador = await kit.crearTarifa({
    actor: ADMIN,
    baseCentavos: tarifa.baseCentavos + 100,
    porKmCentavos: tarifa.porKmCentavos,
    porMinutoCentavos: tarifa.porMinutoCentavos,
    precioMaximoCentavos: tarifa.precioMaximoCentavos,
  });
  await kit.publicarTarifa({ actor: ADMIN, tarifaId: borrador.id });

  const segunda = await kit.cotizarComoPasajero();
  assert.equal(primera.tarifaVersion, 1);
  assert.equal(segunda.tarifaVersion, 2);
  assert.equal(segunda.precioCentavos > primera.precioCentavos, true);
  assert.equal(segunda.origen.lat, ORIGEN.lat);
});
