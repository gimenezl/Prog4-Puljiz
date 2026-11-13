import { randomUUID } from 'node:crypto';

import { crearAceptarViaje } from '../../src/application/use-cases/viajes/aceptar-viaje.js';
import { crearCancelarViaje } from '../../src/application/use-cases/viajes/cancelar-viaje.js';
import { crearCrearViaje } from '../../src/application/use-cases/viajes/crear-viaje.js';
import { crearFinalizarViaje } from '../../src/application/use-cases/viajes/finalizar-viaje.js';
import { crearObtenerCobro } from '../../src/application/use-cases/viajes/obtener-cobro.js';
import { Chofer } from '../../src/domain/entities/chofer.js';
import { ROLES, Usuario } from '../../src/domain/entities/usuario.js';
import { SystemClock } from '../../src/infrastructure/adapters/out/clock/system-clock.js';
import { CryptoIdGenerator } from '../../src/infrastructure/adapters/out/ids/crypto-id-generator.js';
import { SimuladorDeCobroDeterminista } from '../../src/infrastructure/adapters/out/payments/simulador-de-cobro-determinista.js';
import { PostgresChoferRepository } from '../../src/infrastructure/adapters/out/persistence/postgres-chofer-repository.js';
import { PostgresCobroRepository } from '../../src/infrastructure/adapters/out/persistence/postgres-cobro-repository.js';
import { PostgresDatabase } from '../../src/infrastructure/adapters/out/persistence/postgres-database.js';
import { PostgresIdempotencyRepository } from '../../src/infrastructure/adapters/out/persistence/postgres-idempotency-repository.js';
import { PostgresUnitOfWork } from '../../src/infrastructure/adapters/out/persistence/postgres-unit-of-work.js';
import { PostgresUserRepository } from '../../src/infrastructure/adapters/out/persistence/postgres-user-repository.js';
import { PostgresViajeRepository } from '../../src/infrastructure/adapters/out/persistence/postgres-viaje-repository.js';
import { DESTINO, ORIGEN, TARIFA_DE_PRUEBA } from './viajes-kit.js';

/**
 * Kit de integración con PostgreSQL real.
 *
 * Reutiliza exactamente los mismos adaptadores y casos de uso que el
 * composition root, pero permite preparar usuarios y viajes sin pasar por HTTP.
 * `TEST_DATABASE_URL` debe apuntar a una base descartable.
 */
export function crearKitPostgres({ max = 20 } = {}) {
  const cadenaDeConexion = process.env.TEST_DATABASE_URL;

  if (!cadenaDeConexion) {
    throw new Error('TEST_DATABASE_URL no está definida.');
  }

  const baseDeDatos = new PostgresDatabase({
    connectionString: cadenaDeConexion,
    max,
    connectionTimeoutMs: 5000,
    statementTimeoutMs: 15000,
  });

  const repositorioUsuarios = new PostgresUserRepository({ baseDeDatos });
  const repositorioChoferes = new PostgresChoferRepository({ baseDeDatos });
  const repositorioViajes = new PostgresViajeRepository({ baseDeDatos });
  const repositorioCobros = new PostgresCobroRepository({ baseDeDatos });
  const repositorioClavesIdempotencia = new PostgresIdempotencyRepository({ baseDeDatos });
  const simuladorDeCobro = new SimuladorDeCobroDeterminista();
  const unidadDeTrabajo = new PostgresUnitOfWork({ baseDeDatos });
  const reloj = new SystemClock();
  const generadorIds = new CryptoIdGenerator();

  const kit = {
    baseDeDatos,
    repositorioUsuarios,
    repositorioChoferes,
    repositorioViajes,
    repositorioCobros,
    repositorioClavesIdempotencia,
    simuladorDeCobro,
    unidadDeTrabajo,
    reloj,
    generadorIds,

    crearViaje: crearCrearViaje({
      repositorioViajes,
      repositorioClavesIdempotencia,
      unidadDeTrabajo,
      reloj,
      generadorIds,
      tarifa: TARIFA_DE_PRUEBA,
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
    }),

    obtenerCobro: crearObtenerCobro({ repositorioViajes, repositorioCobros }),

    async crearUsuario({ rol = ROLES.PASAJERO, email, nombre = 'Usuario de prueba' } = {}) {
      const usuario = new Usuario({
        id: randomUUID(),
        email: email ?? `prueba-${randomUUID()}@example.com`,
        nombre,
        credencial: 'credencial-de-prueba',
        rol,
        creadoEn: reloj.ahora(),
      });

      await repositorioUsuarios.crear(usuario);
      return usuario;
    },

    async crearChofer({ habilitado = true, disponible = true, email } = {}) {
      const usuario = await kit.crearUsuario({
        rol: ROLES.CHOFER,
        email,
        nombre: 'Chofer de prueba',
      });
      const perfil = new Chofer({
        usuarioId: usuario.id,
        habilitado,
        disponible: habilitado && disponible,
      });

      await repositorioChoferes.crear(perfil);
      return { usuario, perfil };
    },

    async crearViajeDePrueba({ pasajero, ...sobrescrituras } = {}) {
      const duenio = pasajero ?? (await kit.crearUsuario());

      const resultado = await kit.crearViaje({
        pasajeroId: duenio.id,
        origen: ORIGEN,
        destino: DESTINO,
        claveIdempotencia: randomUUID(),
        ...sobrescrituras,
      });

      return { ...resultado, pasajero: duenio };
    },

    async crearViajeAsignado({ chofer, pasajero, ...sobrescrituras } = {}) {
      const conductor = chofer ?? (await kit.crearChofer());
      const creado = await kit.crearViajeDePrueba({ pasajero, ...sobrescrituras });
      const viaje = await kit.aceptarViaje({
        viajeId: creado.viaje.id,
        choferId: conductor.usuario.id,
      });

      return { viaje, chofer: conductor, pasajero: creado.pasajero };
    },

    async limpiar() {
      await baseDeDatos.query(
        'TRUNCATE TABLE cobros_simulados, claves_idempotencia, choferes, viajes, usuarios CASCADE',
      );
    },

    async cerrar() {
      await baseDeDatos.cerrar();
    },
  };

  return kit;
}
