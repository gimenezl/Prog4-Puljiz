import assert from 'node:assert/strict';
import test from 'node:test';

import { serializarErrorParaLog } from '../../../src/infrastructure/logging/error-serializer.js';

test('conserva solo datos de diagnóstico del error', () => {
  const error = Object.assign(new Error('JSON inválido'), {
    codigo: 'CUERPO_INVALIDO',
    status: 400,
    body: '{token: "secreto"}',
    headers: { authorization: 'Bearer secreto' },
  });

  const serializado = serializarErrorParaLog(error);

  assert.equal(serializado.tipo, 'Error');
  assert.equal(serializado.mensaje, 'JSON inválido');
  assert.equal(serializado.codigo, 'CUERPO_INVALIDO');
  assert.equal(serializado.status, 400);
  assert.equal(typeof serializado.stack, 'string');
  assert.equal('body' in serializado, false);
  assert.equal('headers' in serializado, false);
  assert.equal(JSON.stringify(serializado).includes('secreto'), false);
});

test('serializa valores que no son Error sin romper el logger', () => {
  assert.deepEqual(serializarErrorParaLog('fallo de texto'), {
    mensaje: 'fallo de texto',
  });
});
