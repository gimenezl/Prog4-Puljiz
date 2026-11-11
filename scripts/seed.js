import { composeApplication } from '../src/composition-root.js';
import { Chofer } from '../src/domain/entities/chofer.js';
import { ROLES, Usuario } from '../src/domain/entities/usuario.js';
import { validarContrasena } from '../src/domain/value-objects/contrasena.js';
import { loadEnv } from '../src/infrastructure/config/env.js';

const CUENTAS = Object.freeze([
  {
    rol: ROLES.ADMINISTRADOR,
    email: 'admin@prog4.test',
    nombre: 'Administrador de prueba',
    contrasena: 'Admin1234!',
  },
  {
    rol: ROLES.OPERADOR_SOPORTE,
    email: 'soporte@prog4.test',
    nombre: 'Operador de soporte de prueba',
    contrasena: 'Soporte1234!',
  },
  {
    rol: ROLES.PASAJERO,
    email: 'pasajero@prog4.test',
    nombre: 'Pasajero de prueba',
    contrasena: 'Pasajero1234!',
  },
  {
    rol: ROLES.CHOFER,
    email: 'chofer1@prog4.test',
    nombre: 'Chofer de prueba 1',
    contrasena: 'Chofer1234!',
  },
  {
    rol: ROLES.CHOFER,
    email: 'chofer2@prog4.test',
    nombre: 'Chofer de prueba 2',
    contrasena: 'Chofer1234!',
  },
]);

function informar(mensaje) {
  process.stdout.write(`[seed] ${mensaje}\n`);
}

function perfilChoferHabilitado(usuarioId) {
  return new Chofer({
    usuarioId,
    habilitado: true,
    disponible: true,
  });
}

async function asegurarPerfilChofer(composicion, usuario) {
  const existente = await composicion.repositorioChoferes.buscarPorUsuarioId(usuario.id);

  if (existente) return existente;

  const perfil = perfilChoferHabilitado(usuario.id);
  await composicion.repositorioChoferes.crear(perfil);
  return perfil;
}

async function asegurarCuenta(composicion, cuenta) {
  validarContrasena(cuenta.contrasena);

  const existente = await composicion.repositorioUsuarios.buscarPorEmail(cuenta.email);

  if (existente) {
    if (existente.rol !== cuenta.rol) {
      throw new Error(
        `La cuenta ${cuenta.email} ya existe con rol ${existente.rol}; ` +
          `se esperaba ${cuenta.rol}.`,
      );
    }

    if (existente.rol === ROLES.CHOFER) {
      await asegurarPerfilChofer(composicion, existente);
    }

    informar(`${cuenta.email} ya existía (${cuenta.rol}); no se modificó.`);
    return existente;
  }

  const credencial = await composicion.hasherContrasenas.hashear(cuenta.contrasena);

  const usuario = await composicion.unidadDeTrabajo.ejecutar(async (tx) => {
    const creado = new Usuario({
      id: composicion.generadorIds.generar(),
      email: cuenta.email,
      nombre: cuenta.nombre,
      credencial,
      rol: cuenta.rol,
      creadoEn: composicion.reloj.ahora(),
    });

    await composicion.repositorioUsuarios.crear(creado, tx);

    if (creado.rol === ROLES.CHOFER) {
      await composicion.repositorioChoferes.crear(perfilChoferHabilitado(creado.id), tx);
    }

    return creado;
  });

  informar(`${cuenta.email} creado (${cuenta.rol}).`);
  return usuario;
}

async function principal() {
  const entorno = loadEnv();

  if (entorno.ADAPTERS_MODE !== 'real') {
    throw new Error('La carga de datos de prueba requiere ADAPTERS_MODE=real y DATABASE_URL.');
  }

  const composicion = composeApplication(entorno);

  try {
    for (const cuenta of CUENTAS) {
      await asegurarCuenta(composicion, cuenta);
    }

    informar('Datos de prueba disponibles:');
    for (const cuenta of CUENTAS) {
      informar(`  ${cuenta.rol.padEnd(16)} ${cuenta.email} / ${cuenta.contrasena}`);
    }
  } finally {
    await composicion.shutdown();
  }
}

principal().catch((error) => {
  process.stderr.write(`[seed] ${error.message}\n`);
  process.exitCode = 1;
});
