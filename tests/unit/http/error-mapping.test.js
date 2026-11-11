import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mapearErrorDeDominio,
  mapearErrorHttp,
} from '../../../src/infrastructure/adapters/in/http/error-mapping.js';
import { ErrorDeDominio } from '../../../src/domain/errors/error-de-dominio.js';

test('mapea códigos de conflicto a 409', () => {
  for (const codigo of [
    'TRANSICION_INVALIDA',
    'VIAJE_NO_DISPONIBLE',
    'OFERTA_NO_PENDIENTE',
    'CHOFER_OCUPADO',
    'COTIZACION_YA_CONFIRMADA',
  ]) {
    const mapeo = mapearErrorDeDominio(new ErrorDeDominio(codigo, 'conflicto'));
    assert.equal(mapeo.estado, 409, codigo);
  }
});

test('mapea vencimientos a 410 y cobertura a 422', () => {
  assert.equal(mapearErrorDeDominio(new ErrorDeDominio('OFERTA_VENCIDA', 'vencida')).estado, 410);
  assert.equal(
    mapearErrorDeDominio(new ErrorDeDominio('COTIZACION_VENCIDA', 'vencida')).estado,
    410,
  );
  assert.equal(mapearErrorDeDominio(new ErrorDeDominio('FUERA_DE_COBERTURA', 'fuera')).estado, 422);
});

test('devuelve null para un código de dominio desconocido', () => {
  assert.equal(mapearErrorDeDominio(new ErrorDeDominio('CODIGO_NUEVO', 'sin mapeo')), null);
});

test('mapea los errores de autenticación y autorización', () => {
  assert.equal(
    mapearErrorDeDominio(new ErrorDeDominio('CREDENCIALES_INVALIDAS', 'credenciales')).estado,
    401,
  );
  assert.equal(mapearErrorDeDominio(new ErrorDeDominio('NO_AUTENTICADO', 'sin token')).estado, 401);
  assert.equal(mapearErrorDeDominio(new ErrorDeDominio('NO_AUTORIZADO', 'ajeno')).estado, 403);
  assert.equal(
    mapearErrorDeDominio(new ErrorDeDominio('EMAIL_YA_REGISTRADO', 'duplicado')).estado,
    409,
  );
});

test('mapea errores técnicos conocidos del adaptador HTTP', () => {
  assert.deepEqual(mapearErrorHttp({ type: 'entity.parse.failed' }), {
    estado: 400,
    codigo: 'CUERPO_INVALIDO',
    mensaje: 'El cuerpo de la solicitud no es JSON válido.',
  });

  assert.equal(mapearErrorHttp({ type: 'entity.too.large' }).estado, 413);
  assert.equal(mapearErrorHttp({ type: 'encoding.unsupported' }).estado, 415);
});

test('devuelve null para un error HTTP desconocido', () => {
  assert.equal(mapearErrorHttp({ type: 'error-desconocido' }), null);
  assert.equal(mapearErrorHttp(undefined), null);
});
