import { crearActualizarDisponibilidadChofer } from '../../src/application/use-cases/choferes/actualizar-disponibilidad-chofer.js';
import { crearHabilitarChofer } from '../../src/application/use-cases/choferes/habilitar-chofer.js';
import { crearObtenerPerfilChofer } from '../../src/application/use-cases/choferes/obtener-perfil-chofer.js';
import { crearAceptarViaje } from '../../src/application/use-cases/viajes/aceptar-viaje.js';
import { crearCancelarViaje } from '../../src/application/use-cases/viajes/cancelar-viaje.js';
import { crearCrearViaje } from '../../src/application/use-cases/viajes/crear-viaje.js';
import { crearFinalizarViaje } from '../../src/application/use-cases/viajes/finalizar-viaje.js';
import { crearListarViajesDisponibles } from '../../src/application/use-cases/viajes/listar-viajes-disponibles.js';
import { crearObtenerCobro } from '../../src/application/use-cases/viajes/obtener-cobro.js';
import { crearObtenerViaje } from '../../src/application/use-cases/viajes/obtener-viaje.js';
import { Chofer } from '../../src/domain/entities/chofer.js';
import { FixedClock } from '../../src/infrastructure/adapters/out/clock/fixed-clock.js';
import { InMemoryIdGenerator } from '../../src/infrastructure/adapters/out/ids/in-memory-id-generator.js';
import { SimuladorDeCobroEnMemoria } from '../../src/infrastructure/adapters/out/payments/simulador-de-cobro-en-memoria.js';
import { InMemoryChoferRepository } from '../../src/infrastructure/adapters/out/persistence/in-memory-chofer-repository.js';
import { InMemoryCobroRepository } from '../../src/infrastructure/adapters/out/persistence/in-memory-cobro-repository.js';
import { InMemoryIdempotencyRepository } from '../../src/infrastructure/adapters/out/persistence/in-memory-idempotency-repository.js';
import { InMemoryUnitOfWork } from '../../src/infrastructure/adapters/out/persistence/in-memory-unit-of-work.js';
import { InMemoryViajeRepository } from '../../src/infrastructure/adapters/out/persistence/in-memory-viaje-repository.js';

export const TARIFA_DE_PRUEBA = Object.freeze({
  baseCentavos: 100000,
  porKmCentavos: 50000,
  minimoCentavos: 150000,
  maximoCentavos: 1000000,
});

export const ORIGEN = Object.freeze({ lat: -34.6037, lng: -58.3816 });
export const DESTINO = Object.freeze({ lat: -34.6083, lng: -58.3712 });

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
  const simuladorDeCobro = new SimuladorDeCobroEnMemoria();
  const unidadDeTrabajo = new InMemoryUnitOfWork({
    participantes: [
      repositorioChoferes,
      repositorioViajes,
      repositorioCobros,
      repositorioClavesIdempotencia,
    ],
  });
  const generadorIds = new InMemoryIdGenerator();

  const kit = {
    reloj,
    repositorioViajes,
    repositorioChoferes,
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
    }),
    obtenerPerfilChofer: crearObtenerPerfilChofer({ repositorioChoferes }),
    actualizarDisponibilidadChofer: crearActualizarDisponibilidadChofer({
      repositorioChoferes,
      unidadDeTrabajo,
    }),
    habilitarChofer: crearHabilitarChofer({
      repositorioChoferes,
      unidadDeTrabajo,
    }),
  };

  kit.crearPasajero = () => generadorIds.generar();

  kit.crearChofer = async ({ habilitado = true, disponible = true } = {}) => {
    const chofer = new Chofer({
      usuarioId: generadorIds.generar(),
      habilitado,
      disponible: habilitado ? disponible : false,
    });

    await repositorioChoferes.crear(chofer);
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

  return kit;
}
