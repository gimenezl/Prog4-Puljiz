import assert from 'node:assert/strict';
import test from 'node:test';

import { FixedClock } from '../../../src/infrastructure/adapters/out/clock/fixed-clock.js';
import { SystemClock } from '../../../src/infrastructure/adapters/out/clock/system-clock.js';
import { InMemoryTokenService } from '../../../src/infrastructure/adapters/out/security/in-memory-token-service.js';
import { JwtTokenService } from '../../../src/infrastructure/adapters/out/security/jwt-token-service.js';

const SECRETO = 'secreto-de-prueba-con-mas-de-32-caracteres';

test('JWT firma y verifica la identidad del usuario', async () => {
  const servicio = new JwtTokenService({
    secreto: SECRETO,
    minutosDeVida: 10,
    reloj: new SystemClock(),
  });

  const { token, expiraEn } = await servicio.firmar({
    usuarioId: '00000000-0000-4000-8000-000000000001',
    rol: 'PASAJERO',
  });

  assert.equal(typeof token, 'string');
  assert.equal(new Date(expiraEn).getTime() > Date.now(), true);

  assert.deepEqual(await servicio.verificar(token), {
    usuarioId: '00000000-0000-4000-8000-000000000001',
    rol: 'PASAJERO',
  });
});

test('JWT rechaza un token manipulado y un secreto demasiado corto', async () => {
  assert.throws(
    () => new JwtTokenService({ secreto: 'corto', reloj: new SystemClock() }),
    /32 caracteres/i,
  );

  const servicio = new JwtTokenService({
    secreto: SECRETO,
    minutosDeVida: 10,
    reloj: new SystemClock(),
  });
  const { token } = await servicio.firmar({ usuarioId: 'usuario-1', rol: 'CHOFER' });

  await assert.rejects(() => servicio.verificar(`${token}manipulado`));
});

test('JWT rechaza un token vencido', async () => {
  const reloj = new FixedClock(new Date(Date.now() - 2 * 60 * 60_000));
  const servicio = new JwtTokenService({
    secreto: SECRETO,
    minutosDeVida: 1,
    reloj,
  });
  const { token } = await servicio.firmar({ usuarioId: 'usuario-1', rol: 'CHOFER' });

  await assert.rejects(() => servicio.verificar(token), /exp/i);
});

test('el servicio de tokens en memoria vence según el reloj inyectado', async () => {
  const reloj = new FixedClock(new Date('2026-01-01T00:00:00.000Z'));
  const servicio = new InMemoryTokenService({ minutosDeVida: 30, reloj });

  const { token } = await servicio.firmar({ usuarioId: 'usuario-1', rol: 'CHOFER' });

  assert.deepEqual(await servicio.verificar(token), {
    usuarioId: 'usuario-1',
    rol: 'CHOFER',
  });

  reloj.avanzar(31 * 60_000);

  await assert.rejects(() => servicio.verificar(token));
});
