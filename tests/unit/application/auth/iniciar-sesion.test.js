import assert from 'node:assert/strict';
import test from 'node:test';

import { crearKitAuth } from '../../../helpers/auth-kit.js';

const REGISTRO = {
  email: 'ana@example.com',
  nombre: 'Ana',
  contrasena: 'Segura123',
  rol: 'PASAJERO',
};

test('inicia sesión y emite un token con la identidad del usuario', async () => {
  const kit = crearKitAuth();
  const registrado = await kit.registrarUsuario(REGISTRO);

  const sesion = await kit.iniciarSesion({
    email: 'ANA@example.com',
    contrasena: 'Segura123',
  });

  assert.equal(sesion.usuario.id, registrado.id);
  assert.equal(typeof sesion.token, 'string');
  assert.equal(sesion.expiraEn, '2026-01-01T01:00:00.000Z');

  const identidad = await kit.servicioDeTokens.verificar(sesion.token);
  assert.deepEqual(identidad, { usuarioId: registrado.id, rol: 'PASAJERO' });
});

test('devuelve el mismo error para email inexistente y contraseña incorrecta', async () => {
  const kit = crearKitAuth();
  await kit.registrarUsuario(REGISTRO);

  const casos = [
    { email: 'no-existe@example.com', contrasena: 'Segura123' },
    { email: 'ana@example.com', contrasena: 'Incorrecta123' },
  ];

  for (const caso of casos) {
    await assert.rejects(
      () => kit.iniciarSesion(caso),
      (error) =>
        error.codigo === 'CREDENCIALES_INVALIDAS' &&
        error.message === 'El email o la contraseña son incorrectos.',
    );
  }
});

test('no emite token cuando la credencial es inválida', async () => {
  const kit = crearKitAuth();
  await kit.registrarUsuario(REGISTRO);

  await assert.rejects(
    () => kit.iniciarSesion({ email: 'ana@example.com', contrasena: 'OtraClave123' }),
    (error) => error.codigo === 'CREDENCIALES_INVALIDAS',
  );
});
