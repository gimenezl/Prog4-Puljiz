import { crearActualizarDisponibilidadChofer } from '../../src/application/use-cases/choferes/actualizar-disponibilidad-chofer.js';
import { crearHabilitarChofer } from '../../src/application/use-cases/choferes/habilitar-chofer.js';
import { crearObtenerPerfilChofer } from '../../src/application/use-cases/choferes/obtener-perfil-chofer.js';
import { crearAceptarViaje } from '../../src/application/use-cases/viajes/aceptar-viaje.js';
import { crearCancelarViaje } from '../../src/application/use-cases/viajes/cancelar-viaje.js';
import { crearCrearViaje } from '../../src/application/use-cases/viajes/crear-viaje.js';
import { crearFinalizarViaje } from '../../src/application/use-cases/viajes/finalizar-viaje.js';
import { crearIniciarViaje } from '../../src/application/use-cases/viajes/iniciar-viaje.js';
import { crearListarViajesDisponibles } from '../../src/application/use-cases/viajes/listar-viajes-disponibles.js';
import { crearMarcarEnCamino } from '../../src/application/use-cases/viajes/marcar-en-camino.js';
import { crearObtenerCobro } from '../../src/application/use-cases/viajes/obtener-cobro.js';
import { crearObtenerViaje } from '../../src/application/use-cases/viajes/obtener-viaje.js';
import { Chofer } from '../../src/domain/entities/chofer.js';
import { UbicacionChofer } from '../../src/domain/entities/ubicacion-chofer.js';
import { Vehiculo } from '../../src/domain/entities/vehiculo.js';
import { FixedClock } from '../../src/infrastructure/adapters/out/clock/fixed-clock.js';
import { InMemoryIdGenerator } from '../../src/infrastructure/adapters/out/ids/in-memory-id-generator.js';
import { SimuladorDeCobroEnMemoria } from '../../src/infrastructure/adapters/out/payments/simulador-de-cobro-en-memoria.js';
import { InMemoryChoferRepository } from '../../src/infrastructure/adapters/out/persistence/in-memory-chofer-repository.js';
import { InMemoryCobroRepository } from '../../src/infrastructure/adapters/out/persistence/in-memory-cobro-repository.js';
import { InMemoryIdempotencyRepository } from '../../src/infrastructure/adapters/out/persistence/in-memory-idempotency-repository.js';
import { InMemoryUbicacionRepository } from '../../src/infrastructure/adapters/out/persistence/in-memory-ubicacion-repository.js';
import { InMemoryUnitOfWork } from '../../src/infrastructure/adapters/out/persistence/in-memory-unit-of-work.js';
import { InMemoryVehiculoRepository } from '../../src/infrastructure/adapters/out/persistence/in-memory-vehiculo-repository.js';
import { InMemoryViajeRepository } from '../../src/infrastructure/adapters/out/persistence/in-memory-viaje-repository.js';
import { datosDeVehiculoDePrueba } from './vehiculos-kit.js';

export const TARIFA_DE_PRUEBA = Object.freeze({
  baseCentavos: 100000,
  porKmCentavos: 50000,
  minimoCentavos: 150000,
  maximoCentavos: 1000000,
});

export const ORIGEN = Object.freeze({ lat: -34.6037, lng: -58.3816 });
export const DESTINO = Object.freeze({ lat: -34.6083, lng: -58.3712 });
export const VIGENCIA_UBICACION_MS = 60_000;
export const RADIO_BUSQUEDA_M = 5000;

/**
 * Kit de viajes con adaptadores en memoria. Cada llamada crea un grafo aislado
 * con su propia unidad de trabajo, para probar concurrencia sin base de datos.
 */
export function crearKitViajes({
  ahora = new Date('2026-01-01T00:00:00.000Z'),
  tarifa = TARIFA_DE_PRUEBA,
  ttlIdempotenciaMs = 24 * 60 * 60_000,
} = {}) {
  const reloj = new FixedClock(ahora);
  const repositorioViajes = new InMemoryViajeRepository();
  const repositorioChoferes = new InMemoryChoferRepository();
  const repositorioCobros = new InMemoryCobroRepository();
  const repositorioClavesIdempotencia = new InMemoryIdempotencyRepository();
  const repositorioVehiculos = new InMemoryVehiculoRepository();
  const repositorioUbicaciones = new InMemoryUbicacionRepository();
  const simuladorDeCobro = new SimuladorDeCobroEnMemoria();
  const unidadDeTrabajo = new InMemoryUnitOfWork({
    participantes: [
      repositorioChoferes,
      repositorioViajes,
      repositorioCobros,
      repositorioClavesIdempotencia,
      repositorioVehiculos,
      repositorioUbicaciones,
    ],
  });
  const generadorIds = new InMemoryIdGenerator();

  const kit = {
    reloj,
    repositorioViajes,
    repositorioChoferes,
    repositorioVehiculos,
    repositorioUbicaciones,
    repositorioCobros,
    repositorioClavesIdempotencia,
    simuladorDeCobro,
    unidadDeTrabajo,
    generadorIds,
    crearViaje: crearCrearViaje({
      repositorioViajes,
      repositorioClavesIdempotencia,
      unidadDeTrabajo,
      reloj,
      generadorIds,
      tarifa,
      ttlIdempotenciaMs,
    }),
    aceptarViaje: crearAceptarViaje({
      repositorioViajes,
      repositorioChoferes,
      repositorioUbicaciones,
      unidadDeTrabajo,
      reloj,
      vigenciaUbicacionMs: VIGENCIA_UBICACION_MS,
    }),
    marcarEnCamino: crearMarcarEnCamino({
      repositorioViajes,
      unidadDeTrabajo,
    }),
    iniciarViaje: crearIniciarViaje({
      repositorioViajes,
      unidadDeTrabajo,
      reloj,
    }),
    cancelarViaje: crearCancelarViaje({
      repositorioViajes,
      repositorioChoferes,
      unidadDeTrabajo,
      reloj,
    }),
    finalizarViaje: crearFinalizarViaje({
      repositorioViajes,
      repositorioChoferes,
      repositorioCobros,
      repositorioClavesIdempotencia,
      simuladorDeCobro,
      unidadDeTrabajo,
      reloj,
      generadorIds,
      ttlIdempotenciaMs,
    }),
    obtenerCobro: crearObtenerCobro({ repositorioViajes, repositorioCobros }),
    obtenerViaje: crearObtenerViaje({ repositorioViajes }),
    listarViajesDisponibles: crearListarViajesDisponibles({
      repositorioViajes,
      repositorioChoferes,
      repositorioUbicaciones,
      reloj,
      vigenciaUbicacionMs: VIGENCIA_UBICACION_MS,
      radioBusquedaM: RADIO_BUSQUEDA_M,
    }),
    obtenerPerfilChofer: crearObtenerPerfilChofer({ repositorioChoferes }),
    actualizarDisponibilidadChofer: crearActualizarDisponibilidadChofer({
      repositorioChoferes,
      unidadDeTrabajo,
    }),
    habilitarChofer: crearHabilitarChofer({
      repositorioChoferes,
      repositorioVehiculos,
      unidadDeTrabajo,
    }),
  };

  kit.crearVehiculo = async (choferId) => {
    const vehiculo = new Vehiculo({
      id: generadorIds.generar(),
      choferId,
      ...datosDeVehiculoDePrueba(),
    });

    await repositorioVehiculos.guardar(vehiculo);
    return vehiculo;
  };

  kit.crearPasajero = () => generadorIds.generar();

  // Por defecto el chofer queda con una ubicación vigente (la hora del reloj
  // del kit), como un chofer real que tiene la app abierta.
  kit.crearChofer = async ({ habilitado = true, disponible = true, conUbicacion = true } = {}) => {
    const chofer = new Chofer({
      usuarioId: generadorIds.generar(),
      habilitado,
      disponible: habilitado ? disponible : false,
    });

    await repositorioChoferes.crear(chofer);

    if (conUbicacion) {
      await repositorioUbicaciones.guardar(
        new UbicacionChofer({
          choferId: chofer.usuarioId,
          punto: ORIGEN,
          actualizadaEn: reloj.ahora(),
        }),
      );
    }

    return chofer;
  };

  kit.crearViajeDePrueba = async (sobrescrituras = {}) =>
    kit.crearViaje({
      pasajeroId: kit.crearPasajero(),
      origen: ORIGEN,
      destino: DESTINO,
      claveIdempotencia: generadorIds.generar(),
      ...sobrescrituras,
    });

  /** Crea un viaje ya asignado a un chofer habilitado y disponible. */
  kit.crearViajeAsignado = async ({ chofer, ...sobrescrituras } = {}) => {
    const conductor = chofer ?? (await kit.crearChofer());
    const creado = await kit.crearViajeDePrueba(sobrescrituras);
    const viaje = await kit.aceptarViaje({
      viajeId: creado.viaje.id,
      choferId: conductor.usuarioId,
    });

    return { viaje, chofer: conductor, pasajeroId: creado.viaje.pasajeroId };
  };

  /** Crea un viaje asignado y lo marca en camino. */
  kit.crearViajeEnCamino = async (opciones = {}) => {
    const asignado = await kit.crearViajeAsignado(opciones);
    const viaje = await kit.marcarEnCamino({
      viajeId: asignado.viaje.id,
      choferId: asignado.chofer.usuarioId,
    });

    return { ...asignado, viaje };
  };

  /** Crea un viaje asignado, lo marca en camino y lo inicia. */
  kit.crearViajeEnCurso = async (opciones = {}) => {
    const enCamino = await kit.crearViajeEnCamino(opciones);
    const viaje = await kit.iniciarViaje({
      viajeId: enCamino.viaje.id,
      choferId: enCamino.chofer.usuarioId,
    });

    return { ...enCamino, viaje };
  };

  return kit;
}
