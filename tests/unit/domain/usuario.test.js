import assert from 'node:assert/strict';
import test from 'node:test';

import { ROLES, Usuario } from '../../../src/domain/entities/usuario.js';

function crearUsuario(sobrescrituras = {}) {
  return new Usuario({
    id: '00000000-0000-4000-8000-000000000001',
    email: '  Ana@Example.COM ',
    nombre: '  Ana Pérez ',
    credencial: 'hash-de-prueba',
    rol: ROLES.PASAJERO,
    creadoEn: new Date('2026-01-01T00:00:00.000Z'),
    ...sobrescrituras,
  });
}

test('normaliza email y nombre al crear el usuario', () => {
  const usuario = crearUsuario();

  assert.equal(usuario.email, 'ana@example.com');
  assert.equal(usuario.nombre, 'Ana Pérez');
});

test('la vista pública y la serialización nunca incluyen la credencial', () => {
  const usuario = crearUsuario();
  const publica = usuario.aVistaPublica();

  assert.deepEqual(publica, {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'ana@example.com',
    nombre: 'Ana Pérez',
    rol: 'PASAJERO',
    creadoEn: '2026-01-01T00:00:00.000Z',
  });
  assert.equal('credencial' in publica, false);
  assert.equal(JSON.stringify(usuario).includes('hash-de-prueba'), false);
});

test('conNombre devuelve una copia sin mutar ni perder la credencial', () => {
  const original = crearUsuario();
  const actualizado = original.conNombre('Ana Actualizada');

  assert.equal(original.nombre, 'Ana Pérez');
  assert.equal(actualizado.nombre, 'Ana Actualizada');
  assert.equal(actualizado.credencial, original.credencial);
  assert.equal(actualizado.email, original.email);
});

test('rechaza emails, nombres, credenciales, roles y fechas inválidas', () => {
  assert.throws(() => crearUsuario({ email: 'no-es-un-email' }), /email no es válido/i);
  assert.throws(() => crearUsuario({ nombre: '   ' }), /nombre/i);
  assert.throws(() => crearUsuario({ credencial: '' }), /credencial/i);
  assert.throws(() => crearUsuario({ rol: 'SUPERUSUARIO' }), /rol/i);
  assert.throws(() => crearUsuario({ creadoEn: new Date('fecha-invalida') }), /fecha/i);
});

test('la fecha de creación se devuelve como copia', () => {
  const usuario = crearUsuario();
  const fecha = usuario.creadoEn;

  fecha.setFullYear(2030);

  assert.equal(usuario.creadoEn.toISOString(), '2026-01-01T00:00:00.000Z');
});
