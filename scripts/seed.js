import { composeApplication } from '../src/composition-root.js';
import { Chofer } from '../src/domain/entities/chofer.js';
import { ReglaDeMultiplicador } from '../src/domain/entities/regla-de-multiplicador.js';
import { Tarifa } from '../src/domain/entities/tarifa.js';
import { UbicacionChofer } from '../src/domain/entities/ubicacion-chofer.js';
import { ROLES, Usuario } from '../src/domain/entities/usuario.js';
import { Vehiculo } from '../src/domain/entities/vehiculo.js';
import { ZonaDeDemanda } from '../src/domain/entities/zona-de-demanda.js';
import { validarContrasena } from '../src/domain/value-objects/contrasena.js';
import { PuntoGeografico } from '../src/domain/value-objects/punto-geografico.js';
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
    vehiculo: { patente: 'AA100AA', marca: 'Toyota', modelo: 'Etios', anio: 2021 },
  },
  {
    rol: ROLES.CHOFER,
    email: 'chofer2@prog4.test',
    nombre: 'Chofer de prueba 2',
    contrasena: 'Chofer1234!',
    vehiculo: { patente: 'AA200AA', marca: 'Fiat', modelo: 'Cronos', anio: 2023 },
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

// Los choferes del seed nacen habilitados, así que necesitan vehículo (Q11).
async function asegurarVehiculo(composicion, usuario, datos) {
  const existente = await composicion.repositorioVehiculos.buscarPorChoferId(usuario.id);

  if (existente) return existente;

  const vehiculo = new Vehiculo({
    id: composicion.generadorIds.generar(),
    choferId: usuario.id,
    ...datos,
  });
  await composicion.repositorioVehiculos.guardar(vehiculo);
  informar(`vehículo ${vehiculo.patente} registrado para ${usuario.email}.`);
  return vehiculo;
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

const ZONA_SEED = {
  nombre: 'Centro',
  criterio: {
    tipo: 'POLIGONO',
    puntos: [
      { lat: -34.62, lng: -58.4 },
      { lat: -34.59, lng: -58.4 },
      { lat: -34.59, lng: -58.36 },
      { lat: -34.62, lng: -58.36 },
    ],
  },
};

async function asegurarConfiguracion(composicion) {
  const ahora = composicion.reloj.ahora();
  const administrador = await composicion.repositorioUsuarios.buscarPorEmail('admin@prog4.test');

  if (!administrador) throw new Error('No existe la cuenta administradora del seed.');

  if (!(await composicion.repositorioTarifas.vigente(ahora))) {
    const borrador = new Tarifa({
      id: composicion.generadorIds.generar(),
      baseCentavos: 100000,
      porKmCentavos: 50000,
      porMinutoCentavos: 10000,
      precioMaximoCentavos: 1000000,
      creadaEn: ahora,
    });

    await composicion.unidadDeTrabajo.ejecutar(async (tx) => {
      await composicion.repositorioTarifas.crear(borrador, tx);
      await composicion.repositorioTarifas.publicar(
        borrador.publicar({
          vigenteDesde: ahora,
          publicadaPorId: administrador.id,
          publicadaEn: ahora,
        }),
        tx,
      );
    });

    informar('tarifa inicial publicada (versión 1).');
  }

  if (!(await composicion.repositorioReglas.vigente(ahora))) {
    const borrador = new ReglaDeMultiplicador({
      id: composicion.generadorIds.generar(),
      umbralInferior: '0.5',
      umbralSuperior: '3',
      multiplicadorMinimo: '1',
      multiplicadorMaximo: '2',
      escalaMultiplicador: 2,
      creadaEn: ahora,
    });

    await composicion.unidadDeTrabajo.ejecutar(async (tx) => {
      await composicion.repositorioReglas.crear(borrador, tx);
      await composicion.repositorioReglas.publicar(
        borrador.publicar({
          vigenteDesde: ahora,
          motivo: 'Regla inicial de prueba del seed.',
          publicadaPorId: administrador.id,
          publicadaEn: ahora,
        }),
        tx,
      );
    });

    informar('regla de multiplicador inicial publicada (versión 1).');
  }

  if ((await composicion.repositorioZonas.listar({ activa: true })).length === 0) {
    const zona = new ZonaDeDemanda({
      id: composicion.generadorIds.generar(),
      nombre: ZONA_SEED.nombre,
      criterio: ZONA_SEED.criterio,
      activa: true,
      creadaEn: ahora,
    });

    await composicion.unidadDeTrabajo.ejecutar(async (tx) => {
      await composicion.repositorioZonas.crear(zona, tx);
    });

    informar(`zona ${zona.nombre} creada.`);
  }
}

async function asegurarUbicacionesChoferes(composicion) {
  const ahora = composicion.reloj.ahora();
  const choferes = await composicion.repositorioChoferes.listarElegibles();

  for (const [indice, chofer] of choferes.entries()) {
    const existente = await composicion.repositorioUbicaciones.buscarPorChoferId(chofer.usuarioId);

    if (existente) continue;

    const ubicacion = new UbicacionChofer({
      choferId: chofer.usuarioId,
      punto: new PuntoGeografico({
        lat: -34.6037 + indice * 0.001,
        lng: -58.3816 + indice * 0.001,
      }),
      actualizadaEn: ahora,
    });

    await composicion.repositorioUbicaciones.guardar(ubicacion);
    informar(`ubicación inicial registrada para ${chofer.usuarioId}.`);
  }
}

async function principal() {
  const entorno = loadEnv();

  if (entorno.ADAPTERS_MODE !== 'real') {
    throw new Error('La carga de datos de prueba requiere ADAPTERS_MODE=real y DATABASE_URL.');
  }

  const composicion = composeApplication(entorno);

  try {
    for (const cuenta of CUENTAS) {
      const usuario = await asegurarCuenta(composicion, cuenta);

      if (cuenta.vehiculo) {
        await asegurarVehiculo(composicion, usuario, cuenta.vehiculo);
      }
    }

    await asegurarConfiguracion(composicion);
    await asegurarUbicacionesChoferes(composicion);

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
