import { createHttpApp } from './infrastructure/adapters/in/http/app.js';
import { FixedClock } from './infrastructure/adapters/out/clock/fixed-clock.js';
import { SystemClock } from './infrastructure/adapters/out/clock/system-clock.js';
import { CryptoIdGenerator } from './infrastructure/adapters/out/ids/crypto-id-generator.js';
import { InMemoryIdGenerator } from './infrastructure/adapters/out/ids/in-memory-id-generator.js';
import { InMemoryChoferRepository } from './infrastructure/adapters/out/persistence/in-memory-chofer-repository.js';
import { InMemoryDatabase } from './infrastructure/adapters/out/persistence/in-memory-database.js';
import { InMemoryIdempotencyRepository } from './infrastructure/adapters/out/persistence/in-memory-idempotency-repository.js';
import { InMemoryUnitOfWork } from './infrastructure/adapters/out/persistence/in-memory-unit-of-work.js';
import { InMemoryUserRepository } from './infrastructure/adapters/out/persistence/in-memory-user-repository.js';
import { InMemoryViajeRepository } from './infrastructure/adapters/out/persistence/in-memory-viaje-repository.js';
import { PostgresChoferRepository } from './infrastructure/adapters/out/persistence/postgres-chofer-repository.js';
import { PostgresDatabase } from './infrastructure/adapters/out/persistence/postgres-database.js';
import { PostgresIdempotencyRepository } from './infrastructure/adapters/out/persistence/postgres-idempotency-repository.js';
import { PostgresUnitOfWork } from './infrastructure/adapters/out/persistence/postgres-unit-of-work.js';
import { PostgresUserRepository } from './infrastructure/adapters/out/persistence/postgres-user-repository.js';
import { PostgresViajeRepository } from './infrastructure/adapters/out/persistence/postgres-viaje-repository.js';
import { BcryptPasswordHasher } from './infrastructure/adapters/out/security/bcrypt-password-hasher.js';
import { InMemoryPasswordHasher } from './infrastructure/adapters/out/security/in-memory-password-hasher.js';
import { InMemoryTokenService } from './infrastructure/adapters/out/security/in-memory-token-service.js';
import { JwtTokenService } from './infrastructure/adapters/out/security/jwt-token-service.js';
import { createReadinessCheck } from './infrastructure/health/readiness-check.js';
import { createLogger } from './infrastructure/logging/logger.js';
import { crearActualizarPerfilUsuario } from './application/use-cases/auth/actualizar-perfil-usuario.js';
import { crearIniciarSesion } from './application/use-cases/auth/iniciar-sesion.js';
import { crearObtenerPerfilUsuario } from './application/use-cases/auth/obtener-perfil-usuario.js';
import { crearRegistrarUsuario } from './application/use-cases/auth/registrar-usuario.js';
import { crearActualizarDisponibilidadChofer } from './application/use-cases/choferes/actualizar-disponibilidad-chofer.js';
import { crearHabilitarChofer } from './application/use-cases/choferes/habilitar-chofer.js';
import { crearObtenerPerfilChofer } from './application/use-cases/choferes/obtener-perfil-chofer.js';
import { crearAceptarViaje } from './application/use-cases/viajes/aceptar-viaje.js';
import { crearCancelarViaje } from './application/use-cases/viajes/cancelar-viaje.js';
import { crearCrearViaje } from './application/use-cases/viajes/crear-viaje.js';
import { crearListarViajesDisponibles } from './application/use-cases/viajes/listar-viajes-disponibles.js';
import { crearObtenerViaje } from './application/use-cases/viajes/obtener-viaje.js';

/**
 * Único punto de composición de la aplicación.
 *
 * Aquí se crean los adaptadores y se inyectan en los puertos. Cambiar de
 * implementación real a falsa se hace únicamente con ADAPTERS_MODE o
 * modificando este archivo.
 */
export function composeApplication(entorno) {
  const logger = createLogger(entorno);
  const usaAdaptadoresFalsos = entorno.ADAPTERS_MODE === 'fake';

  const baseDeDatos = usaAdaptadoresFalsos
    ? new InMemoryDatabase()
    : new PostgresDatabase({
        connectionString: entorno.DATABASE_URL,
        ssl: entorno.DATABASE_SSL,
        max: entorno.DATABASE_POOL_MAX,
        connectionTimeoutMs: entorno.DATABASE_CONNECTION_TIMEOUT_MS,
        statementTimeoutMs: entorno.DATABASE_STATEMENT_TIMEOUT_MS,
        logger,
      });

  const reloj = usaAdaptadoresFalsos ? new FixedClock() : new SystemClock();

  const repositorioUsuarios = usaAdaptadoresFalsos
    ? new InMemoryUserRepository()
    : new PostgresUserRepository({ baseDeDatos });

  const repositorioChoferes = usaAdaptadoresFalsos
    ? new InMemoryChoferRepository()
    : new PostgresChoferRepository({ baseDeDatos });

  const repositorioViajes = usaAdaptadoresFalsos
    ? new InMemoryViajeRepository()
    : new PostgresViajeRepository({ baseDeDatos });

  const repositorioClavesIdempotencia = usaAdaptadoresFalsos
    ? new InMemoryIdempotencyRepository()
    : new PostgresIdempotencyRepository({ baseDeDatos });

  const unidadDeTrabajo = usaAdaptadoresFalsos
    ? new InMemoryUnitOfWork({
        participantes: [
          repositorioUsuarios,
          repositorioChoferes,
          repositorioViajes,
          repositorioClavesIdempotencia,
        ],
      })
    : new PostgresUnitOfWork({ baseDeDatos });

  const hasherContrasenas = usaAdaptadoresFalsos
    ? new InMemoryPasswordHasher()
    : new BcryptPasswordHasher({ costo: entorno.PASSWORD_HASH_COST });

  const generadorIds = usaAdaptadoresFalsos ? new InMemoryIdGenerator() : new CryptoIdGenerator();

  const servicioDeTokens = usaAdaptadoresFalsos
    ? new InMemoryTokenService({
        minutosDeVida: entorno.JWT_EXPIRES_IN_MINUTES,
        reloj,
      })
    : new JwtTokenService({
        secreto: entorno.JWT_SECRET,
        minutosDeVida: entorno.JWT_EXPIRES_IN_MINUTES,
        reloj,
      });

  const tarifa = {
    baseCentavos: entorno.TARIFA_BASE_CENTAVOS,
    porKmCentavos: entorno.TARIFA_POR_KM_CENTAVOS,
    minimoCentavos: entorno.TARIFA_MINIMO_CENTAVOS,
    maximoCentavos: entorno.TARIFA_MAXIMO_CENTAVOS,
  };

  const registrarUsuario = crearRegistrarUsuario({
    repositorioUsuarios,
    repositorioChoferes,
    unidadDeTrabajo,
    hasher: hasherContrasenas,
    reloj,
    generadorIds,
  });
  const iniciarSesion = crearIniciarSesion({
    repositorioUsuarios,
    hasher: hasherContrasenas,
    servicioDeTokens,
  });
  const obtenerPerfilUsuario = crearObtenerPerfilUsuario({ repositorioUsuarios });
  const actualizarPerfilUsuario = crearActualizarPerfilUsuario({ repositorioUsuarios });

  const crearViaje = crearCrearViaje({
    repositorioViajes,
    repositorioClavesIdempotencia,
    unidadDeTrabajo,
    reloj,
    generadorIds,
    tarifa,
    ttlIdempotenciaMs: entorno.IDEMPOTENCIA_TTL_MS,
  });
  const aceptarViaje = crearAceptarViaje({
    repositorioViajes,
    repositorioChoferes,
    unidadDeTrabajo,
    reloj,
  });
  const cancelarViaje = crearCancelarViaje({
    repositorioViajes,
    repositorioChoferes,
    unidadDeTrabajo,
    reloj,
  });
  const obtenerViaje = crearObtenerViaje({ repositorioViajes });
  const listarViajesDisponibles = crearListarViajesDisponibles({
    repositorioViajes,
    repositorioChoferes,
  });

  const obtenerPerfilChofer = crearObtenerPerfilChofer({ repositorioChoferes });
  const actualizarDisponibilidadChofer = crearActualizarDisponibilidadChofer({
    repositorioChoferes,
    unidadDeTrabajo,
  });
  const habilitarChofer = crearHabilitarChofer({
    repositorioChoferes,
    unidadDeTrabajo,
  });

  const readinessCheck = createReadinessCheck({
    checks: {
      baseDeDatos: () => baseDeDatos.verificarConexion(),
      usuarios: () => repositorioUsuarios.verificarDisponibilidad(),
      choferes: () => repositorioChoferes.verificarDisponibilidad(),
      viajes: () => repositorioViajes.verificarDisponibilidad(),
      idempotencia: () => repositorioClavesIdempotencia.verificarDisponibilidad(),
      reloj: () => reloj.ahora() instanceof Date,
    },
    timeoutMs: entorno.READINESS_TIMEOUT_MS,
  });

  const app = createHttpApp({
    logger,
    readinessCheck,
    auth: {
      registrarUsuario,
      iniciarSesion,
      obtenerPerfilUsuario,
      actualizarPerfilUsuario,
      servicioDeTokens,
      loginRateLimit: {
        windowMs: entorno.LOGIN_RATE_LIMIT_WINDOW_MS,
        limit: entorno.LOGIN_RATE_LIMIT_MAX,
      },
    },
    viajes: {
      crearViaje,
      aceptarViaje,
      cancelarViaje,
      obtenerViaje,
      listarViajesDisponibles,
    },
    choferes: {
      obtenerPerfilChofer,
      actualizarDisponibilidadChofer,
      habilitarChofer,
    },
    corsOrigin: entorno.CORS_ORIGIN,
    bodyLimit: entorno.BODY_LIMIT,
    rateLimit: {
      windowMs: entorno.RATE_LIMIT_WINDOW_MS,
      limit: entorno.RATE_LIMIT_MAX,
    },
  });

  async function shutdown() {
    await baseDeDatos.cerrar();
  }

  return {
    app,
    logger,
    baseDeDatos,
    reloj,
    generadorIds,
    readinessCheck,
    repositorioUsuarios,
    repositorioChoferes,
    repositorioViajes,
    repositorioClavesIdempotencia,
    unidadDeTrabajo,
    hasherContrasenas,
    servicioDeTokens,
    shutdown,
  };
}
