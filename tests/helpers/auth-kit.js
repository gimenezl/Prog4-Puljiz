import { crearActualizarPerfilUsuario } from '../../src/application/use-cases/auth/actualizar-perfil-usuario.js';
import { crearIniciarSesion } from '../../src/application/use-cases/auth/iniciar-sesion.js';
import { crearObtenerPerfilUsuario } from '../../src/application/use-cases/auth/obtener-perfil-usuario.js';
import { crearRegistrarUsuario } from '../../src/application/use-cases/auth/registrar-usuario.js';
import { FixedClock } from '../../src/infrastructure/adapters/out/clock/fixed-clock.js';
import { InMemoryIdGenerator } from '../../src/infrastructure/adapters/out/ids/in-memory-id-generator.js';
import { InMemoryChoferRepository } from '../../src/infrastructure/adapters/out/persistence/in-memory-chofer-repository.js';
import { InMemoryIdempotencyRepository } from '../../src/infrastructure/adapters/out/persistence/in-memory-idempotency-repository.js';
import { InMemoryUnitOfWork } from '../../src/infrastructure/adapters/out/persistence/in-memory-unit-of-work.js';
import { InMemoryUserRepository } from '../../src/infrastructure/adapters/out/persistence/in-memory-user-repository.js';
import { InMemoryViajeRepository } from '../../src/infrastructure/adapters/out/persistence/in-memory-viaje-repository.js';
import { InMemoryPasswordHasher } from '../../src/infrastructure/adapters/out/security/in-memory-password-hasher.js';
import { InMemoryTokenService } from '../../src/infrastructure/adapters/out/security/in-memory-token-service.js';

/**
 * Kit de autenticación con adaptadores falsos. Cada llamada crea un estado
 * aislado para que los tests no compartan usuarios ni tokens.
 */
export function crearKitAuth({ ahora = new Date('2026-01-01T00:00:00.000Z') } = {}) {
  const reloj = new FixedClock(ahora);
  const repositorioUsuarios = new InMemoryUserRepository();
  const repositorioChoferes = new InMemoryChoferRepository();
  const repositorioViajes = new InMemoryViajeRepository();
  const repositorioClavesIdempotencia = new InMemoryIdempotencyRepository();
  const unidadDeTrabajo = new InMemoryUnitOfWork({
    participantes: [
      repositorioUsuarios,
      repositorioChoferes,
      repositorioViajes,
      repositorioClavesIdempotencia,
    ],
  });
  const hasher = new InMemoryPasswordHasher();
  const generadorIds = new InMemoryIdGenerator();
  const servicioDeTokens = new InMemoryTokenService({ minutosDeVida: 60, reloj });

  return {
    reloj,
    repositorioUsuarios,
    repositorioChoferes,
    repositorioViajes,
    repositorioClavesIdempotencia,
    unidadDeTrabajo,
    hasher,
    generadorIds,
    servicioDeTokens,
    registrarUsuario: crearRegistrarUsuario({
      repositorioUsuarios,
      repositorioChoferes,
      unidadDeTrabajo,
      hasher,
      reloj,
      generadorIds,
    }),
    iniciarSesion: crearIniciarSesion({
      repositorioUsuarios,
      hasher,
      servicioDeTokens,
    }),
    obtenerPerfilUsuario: crearObtenerPerfilUsuario({ repositorioUsuarios }),
    actualizarPerfilUsuario: crearActualizarPerfilUsuario({ repositorioUsuarios }),
  };
}
