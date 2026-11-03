import assert from 'node:assert/strict';
import test from 'node:test';

import { ROLES, Usuario } from '../../../../src/domain/entities/usuario.js';
import { crearKitAuth } from '../../../helpers/auth-kit.js';

async function prepararUsuarios() {
  const kit = crearKitAuth();
  const ana = await kit.registrarUsuario({
    email: 'ana@example.com',
    nombre: 'Ana',
    contrasena: 'Segura123',
    rol: ROLES.PASAJERO,
  });
  const bruno = await kit.registrarUsuario({
    email: 'bruno@example.com',
    nombre: 'Bruno',
    contrasena: 'Segura123',
    rol: ROLES.CHOFER,
  });

  const credencialAdmin = await kit.hasher.hashear('Admin1234');
  const admin = new Usuario({
    id: '11111111-1111-4111-8111-111111111111',
    email: 'admin@example.com',
    nombre: 'Admin',
    credencial: credencialAdmin,
    rol: ROLES.ADMINISTRADOR,
    creadoEn: kit.reloj.ahora(),
  });
  await kit.repositorioUsuarios.crear(admin);

  return { kit, ana, bruno, admin };
}

test('el propietario puede ver su propio perfil', async () => {
  const { kit, ana } = await prepararUsuarios();

  const usuario = await kit.obtenerPerfilUsuario({
    usuarioId: ana.id,
    solicitante: { usuarioId: ana.id, rol: ROLES.PASAJERO },
  });

  assert.equal(usuario.id, ana.id);
});

test('otro usuario recibe NO_AUTORIZADO al intentar leer un perfil ajeno', async () => {
  const { kit, ana, bruno } = await prepararUsuarios();

  await assert.rejects(
    () =>
      kit.obtenerPerfilUsuario({
        usuarioId: bruno.id,
        solicitante: { usuarioId: ana.id, rol: ROLES.PASAJERO },
      }),
    (error) => error.codigo === 'NO_AUTORIZADO',
  );
});

test('un administrador puede ver el perfil de otro usuario', async () => {
  const { kit, bruno, admin } = await prepararUsuarios();

  const usuario = await kit.obtenerPerfilUsuario({
    usuarioId: bruno.id,
    solicitante: { usuarioId: admin.id, rol: ROLES.ADMINISTRADOR },
  });

  assert.equal(usuario.id, bruno.id);
});

test('un identificador inexistente responde NO_ENCONTRADO', async () => {
  const { kit, ana } = await prepararUsuarios();

  await assert.rejects(
    () =>
      kit.obtenerPerfilUsuario({
        usuarioId: '99999999-9999-4999-8999-999999999999',
        solicitante: { usuarioId: ana.id, rol: ROLES.PASAJERO },
      }),
    (error) => error.codigo === 'NO_ENCONTRADO',
  );
});

test('el propietario puede actualizar su nombre', async () => {
  const { kit, ana } = await prepararUsuarios();

  const actualizado = await kit.actualizarPerfilUsuario({
    usuarioId: ana.id,
    solicitante: { usuarioId: ana.id, rol: ROLES.PASAJERO },
    nombre: 'Ana Actualizada',
  });

  assert.equal(actualizado.nombre, 'Ana Actualizada');
  const guardado = await kit.repositorioUsuarios.buscarPorId(ana.id);
  assert.equal(guardado?.nombre, 'Ana Actualizada');
});

test('ni otro usuario ni un administrador pueden editar una cuenta ajena', async () => {
  const { kit, ana, bruno, admin } = await prepararUsuarios();

  for (const solicitante of [
    { usuarioId: ana.id, rol: ROLES.PASAJERO },
    { usuarioId: admin.id, rol: ROLES.ADMINISTRADOR },
  ]) {
    await assert.rejects(
      () =>
        kit.actualizarPerfilUsuario({
          usuarioId: bruno.id,
          solicitante,
          nombre: 'Nombre Ajeno',
        }),
      (error) => error.codigo === 'NO_AUTORIZADO',
    );
  }
});
