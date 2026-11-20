import { crearConfirmarCotizacion } from '../../src/application/use-cases/cotizaciones/confirmar-cotizacion.js';
import {
  crearListarCotizaciones,
  crearObtenerCotizacion,
} from '../../src/application/use-cases/cotizaciones/consultar-cotizaciones.js';
import { crearCotizar } from '../../src/application/use-cases/cotizaciones/cotizar.js';
import {
  crearCrearRegla,
  crearCrearTarifa,
  crearCrearZona,
  crearPublicarRegla,
  crearPublicarTarifa,
} from '../../src/application/use-cases/configuracion/configuracion-administrativa.js';
import { Viaje } from '../../src/domain/entities/viaje.js';
import { ZonaDeDemanda } from '../../src/domain/entities/zona-de-demanda.js';
import { PuntoGeografico } from '../../src/domain/value-objects/punto-geografico.js';
import { FixedClock } from '../../src/infrastructure/adapters/out/clock/fixed-clock.js';
import { MedidorDeDemanda } from '../../src/infrastructure/adapters/out/demanda/medidor-de-demanda.js';
import { InMemoryIdGenerator } from '../../src/infrastructure/adapters/out/ids/in-memory-id-generator.js';
import { EstimadorDeRecorridoHaversine } from '../../src/infrastructure/adapters/out/recorrido/estimador-de-recorrido.js';
import { InMemoryChoferRepository } from '../../src/infrastructure/adapters/out/persistence/in-memory-chofer-repository.js';
import { InMemoryCotizacionRepository } from '../../src/infrastructure/adapters/out/persistence/in-memory-cotizacion-repository.js';
import { InMemoryIdempotencyRepository } from '../../src/infrastructure/adapters/out/persistence/in-memory-idempotency-repository.js';
import { InMemoryReglaRepository } from '../../src/infrastructure/adapters/out/persistence/in-memory-regla-repository.js';
import { InMemoryTarifaRepository } from '../../src/infrastructure/adapters/out/persistence/in-memory-tarifa-repository.js';
import { InMemoryUbicacionRepository } from '../../src/infrastructure/adapters/out/persistence/in-memory-ubicacion-repository.js';
import { InMemoryUnitOfWork } from '../../src/infrastructure/adapters/out/persistence/in-memory-unit-of-work.js';
import { InMemoryViajeRepository } from '../../src/infrastructure/adapters/out/persistence/in-memory-viaje-repository.js';
import { InMemoryZonaRepository } from '../../src/infrastructure/adapters/out/persistence/in-memory-zona-repository.js';
import { Chofer } from '../../src/domain/entities/chofer.js';
import { UbicacionChofer } from '../../src/domain/entities/ubicacion-chofer.js';

export const AHORA = Object.freeze(new Date('2026-01-01T00:00:00.000Z'));
export const ORIGEN = Object.freeze({ lat: -34.6037, lng: -58.3816 });
export const DESTINO = Object.freeze({ lat: -34.6083, lng: -58.3712 });
export const ADMIN = Object.freeze({ id: 'admin-1', rol: 'ADMINISTRADOR' });
export const PASAJERO = Object.freeze({ id: 'pasajero-1', rol: 'PASAJERO' });
export const CRITERIO_ZONA = Object.freeze({
  tipo: 'POLIGONO',
  puntos: [
    { lat: -34.62, lng: -58.4 },
    { lat: -34.59, lng: -58.4 },
    { lat: -34.59, lng: -58.36 },
    { lat: -34.62, lng: -58.36 },
  ],
});

/**
 * Kit aislado para probar cotizaciones con los mismos casos de uso que la app.
 * Toda la configuración se publica a través de sus casos de uso, de modo que
 * los tests cubren también el alta y la publicación administrativa.
 */
export function crearKitCotizaciones({
  ahora = AHORA,
  ventanaMs = 5 * 60_000,
  vigenciaMs = 5 * 60_000,
  ubicacionVigenciaMs = 60_000,
  ttlIdempotenciaMs = 24 * 60 * 60_000,
} = {}) {
  const reloj = new FixedClock(ahora);
  const generadorIds = new InMemoryIdGenerator();
  const repositorioZonas = new InMemoryZonaRepository();
  const repositorioTarifas = new InMemoryTarifaRepository();
  const repositorioReglas = new InMemoryReglaRepository();
  const repositorioCotizaciones = new InMemoryCotizacionRepository();
  const repositorioViajes = new InMemoryViajeRepository();
  const repositorioChoferes = new InMemoryChoferRepository();
  const repositorioUbicaciones = new InMemoryUbicacionRepository();
  const repositorioClavesIdempotencia = new InMemoryIdempotencyRepository();
  const unidadDeTrabajo = new InMemoryUnitOfWork({
    participantes: [
      repositorioZonas,
      repositorioTarifas,
      repositorioReglas,
      repositorioCotizaciones,
      repositorioViajes,
      repositorioChoferes,
      repositorioUbicaciones,
      repositorioClavesIdempotencia,
    ],
  });

  const medidorDeDemanda = new MedidorDeDemanda({
    repositorioViajes,
    repositorioChoferes,
    repositorioUbicaciones,
    ventanaMs,
    ubicacionVigenciaMs,
  });
  const estimadorDeRecorrido = new EstimadorDeRecorridoHaversine({ velocidadEstimadaKmh: 30 });

  const crearZona = crearCrearZona({
    repositorioZonas,
    unidadDeTrabajo,
    reloj,
    generadorIds,
  });
  const crearTarifa = crearCrearTarifa({
    repositorioTarifas,
    unidadDeTrabajo,
    reloj,
    generadorIds,
  });
  const publicarTarifa = crearPublicarTarifa({ repositorioTarifas, unidadDeTrabajo, reloj });
  const crearRegla = crearCrearRegla({
    repositorioReglas,
    unidadDeTrabajo,
    reloj,
    generadorIds,
  });
  const publicarRegla = crearPublicarRegla({ repositorioReglas, unidadDeTrabajo, reloj });

  const kit = {
    reloj,
    generadorIds,
    repositorioZonas,
    repositorioTarifas,
    repositorioReglas,
    repositorioCotizaciones,
    repositorioViajes,
    repositorioChoferes,
    repositorioUbicaciones,
    repositorioClavesIdempotencia,
    unidadDeTrabajo,
    medidorDeDemanda,
    estimadorDeRecorrido,
    crearZona,
    crearTarifa,
    publicarTarifa,
    crearRegla,
    publicarRegla,
    cotizar: crearCotizar({
      repositorioZonas,
      repositorioTarifas,
      repositorioReglas,
      repositorioCotizaciones,
      medidorDeDemanda,
      estimadorDeRecorrido,
      unidadDeTrabajo,
      reloj,
      generadorIds,
      vigenciaMs,
    }),
    confirmarCotizacion: crearConfirmarCotizacion({
      repositorioCotizaciones,
      repositorioViajes,
      repositorioClavesIdempotencia,
      unidadDeTrabajo,
      reloj,
      generadorIds,
      ttlIdempotenciaMs,
    }),
    obtenerCotizacion: crearObtenerCotizacion({ repositorioCotizaciones, reloj }),
    listarCotizaciones: crearListarCotizaciones({ repositorioCotizaciones, reloj }),
  };

  /** Publica zona, tarifa y regla con valores de prueba. */
  kit.prepararConfiguracion = async ({
    tarifa = {
      baseCentavos: 100000,
      porKmCentavos: 50000,
      porMinutoCentavos: 10000,
      precioMaximoCentavos: 1000000,
    },
    regla = {
      umbralInferior: '0.5',
      umbralSuperior: '3',
      multiplicadorMinimo: '1',
      multiplicadorMaximo: '2',
      escalaMultiplicador: 2,
    },
    publicar = true,
  } = {}) => {
    const zona = await crearZona({ actor: ADMIN, nombre: 'Centro', criterio: CRITERIO_ZONA });
    const tarifaCreada = await crearTarifa({ actor: ADMIN, ...tarifa });
    const reglaCreada = await crearRegla({ actor: ADMIN, ...regla });

    if (publicar) {
      await publicarTarifa({ actor: ADMIN, tarifaId: tarifaCreada.id });
      await publicarRegla({ actor: ADMIN, reglaId: reglaCreada.id });
    }

    return {
      zona,
      tarifa: await repositorioTarifas.buscarPorId(tarifaCreada.id),
      regla: await repositorioReglas.buscarPorId(reglaCreada.id),
    };
  };

  /** Inserta viajes activos con origen dentro de la zona. */
  kit.crearSolicitudes = async (cantidad, { estado = 'SOLICITADO', minutosAtras = 0 } = {}) => {
    for (let i = 0; i < cantidad; i += 1) {
      const viaje = new Viaje({
        id: generadorIds.generar(),
        pasajeroId: generadorIds.generar(),
        origen: new PuntoGeografico(ORIGEN),
        destino: new PuntoGeografico(DESTINO),
        distanciaEstimadaM: 1000,
        precioFijadoCentavos: 100000,
        estado,
        solicitadoEn: new Date(reloj.ahora().getTime() - minutosAtras * 60_000),
      });

      await repositorioViajes.crear(viaje);
    }
  };

  /** Inserta choferes elegibles con ubicación vigente en la zona. */
  kit.crearChoferesDisponibles = async (
    cantidad,
    {
      actualizadaEn = reloj.ahora(),
      habilitado = true,
      disponible = true,
      viajeActivoId = null,
    } = {},
  ) => {
    for (let i = 0; i < cantidad; i += 1) {
      const chofer = new Chofer({
        usuarioId: generadorIds.generar(),
        habilitado,
        disponible,
        viajeActivoId,
      });

      await repositorioChoferes.crear(chofer);
      await repositorioUbicaciones.guardar(
        new UbicacionChofer({
          choferId: chofer.usuarioId,
          punto: new PuntoGeografico(ORIGEN),
          actualizadaEn,
        }),
      );
    }
  };

  kit.cotizarComoPasajero = (sobrescrituras = {}) =>
    kit.cotizar({ pasajeroId: PASAJERO.id, origen: ORIGEN, destino: DESTINO, ...sobrescrituras });

  kit.confirmarComoPasajero = (cotizacionId, claveIdempotencia, sobrescrituras = {}) =>
    kit.confirmarCotizacion({
      cotizacionId,
      pasajeroId: PASAJERO.id,
      claveIdempotencia,
      ...sobrescrituras,
    });

  kit.ZONA = ZonaDeDemanda;

  return kit;
}
