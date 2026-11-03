import assert from 'node:assert/strict';
import test from 'node:test';

import { Usuario } from '../../../src/domain/entities/usuario.js';
import { InMemoryUserRepository } from '../../../src/infrastructure/adapters/out/persistence/in-memory-user-repository.js';

function crearUsuario(sobrescrituras = {}) {
  return new Usuario({
    id: '00000000-0000-4000-8000-000000000001',
    email: 'ana@example.com',
    nombre: 'Ana',
    credencial: 'hash',
    rol: 'PASAJERO',
    creadoEn: new Date('2026-01-01T00:00:00.000Z'),
    ...sobrescrituras,
  });
}

test('busca por id y por email sin distinguir mayúsculas', async () => {
  const repositorio = new InMemoryUserRepository();
  const usuario = crearUsuario();
  await repositorio.crear(usuario);

  assert.equal((await repositorio.buscarPorId(usuario.id))?.id, usuario.id);
  assert.equal((await repositorio.buscarPorEmail('ANA@EXAMPLE.COM'))?.id, usuario.id);
  assert.equal(await repositorio.buscarPorEmail('otra@example.com'), null);
});

test('rechaza emails duplicados y actualiza el nombre', async () => {
  const repositorio = new InMemoryUserRepository();
  const usuario = crearUsuario();
  await repositorio.crear(usuario);

  await assert.rejects(
    () => repositorio.crear(crearUsuario({ id: '00000000-0000-4000-8000-000000000002' })),
    (error) => error.codigo === 'EMAIL_YA_REGISTRADO',
  );

  const actualizado = usuario.conNombre('Ana Actualizada');
  await repositorio.actualizar(actualizado);

  assert.equal((await repositorio.buscarPorId(usuario.id))?.nombre, 'Ana Actualizada');
  assert.equal(await repositorio.verificarDisponibilidad(), true);
});
