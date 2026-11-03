import assert from 'node:assert/strict';
import test from 'node:test';

import { crearKitAuth } from '../../../helpers/auth-kit.js';

const REGISTRO = {
  email: '  Ana.Perez@Example.COM ',
  nombre: ' Ana Pérez ',
  contrasena: 'Segura123',
  rol: 'PASAJERO',
};

test('registra un usuario con email normalizado y credencial hasheada', async () => {
  const kit = crearKitAuth();
  const usuario = await kit.registrarUsuario(REGISTRO);

  assert.equal(usuario.email, 'ana.perez@example.com');
  assert.equal(usuario.nombre, 'Ana Pérez');
  assert.equal(usuario.rol, 'PASAJERO');
  assert.equal(usuario.creadoEn.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.notEqual(usuario.credencial, REGISTRO.contrasena);
  assert.equal(usuario.credencial.startsWith('fake$'), true);

  const guardado = await kit.repositorioUsuarios.buscarPorEmail('ANA.PEREZ@example.com');
  assert.equal(guardado?.id, usuario.id);
});

test('rechaza un email ya registrado sin distinguir mayúsculas', async () => {
  const kit = crearKitAuth();
  await kit.registrarUsuario(REGISTRO);

  await assert.rejects(
    () => kit.registrarUsuario({ ...REGISTRO, email: 'ANA.PEREZ@EXAMPLE.COM' }),
    (error) => error.codigo === 'EMAIL_YA_REGISTRADO',
  );
});

test('no permite auto-registrarse como administrador u operador', async () => {
  const kit = crearKitAuth();

  for (const rol of ['ADMINISTRADOR', 'OPERADOR_SOPORTE']) {
    await assert.rejects(
      () => kit.registrarUsuario({ ...REGISTRO, rol }),
      (error) => error.codigo === 'DATOS_INVALIDOS',
      rol,
    );
  }
});

test('valida la política de contraseñas antes de persistir', async () => {
  const kit = crearKitAuth();

  await assert.rejects(
    () => kit.registrarUsuario({ ...REGISTRO, contrasena: 'corta1' }),
    (error) => error.codigo === 'DATOS_INVALIDOS',
  );
});

test('crea el perfil operativo inhabilitado cuando el rol es CHOFER', async () => {
  const kit = crearKitAuth();
  const chofer = await kit.registrarUsuario({ ...REGISTRO, rol: 'CHOFER' });

  const perfil = await kit.repositorioChoferes.buscarPorUsuarioId(chofer.id);

  assert.equal(perfil?.usuarioId, chofer.id);
  assert.equal(perfil?.habilitado, false);
  assert.equal(perfil?.disponible, false);
  assert.equal(perfil?.estado, 'INHABILITADO');
});

test('no crea perfil operativo para un pasajero', async () => {
  const kit = crearKitAuth();
  const pasajero = await kit.registrarUsuario(REGISTRO);

  assert.equal(await kit.repositorioChoferes.buscarPorUsuarioId(pasajero.id), null);
});
