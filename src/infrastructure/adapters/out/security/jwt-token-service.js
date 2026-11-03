import { SignJWT, jwtVerify } from 'jose';

const EMISOR = 'prog4-puljiz';
const AUDIENCIA = 'prog4-puljiz-api';
const ALGORITMO = 'HS256';
const LONGITUD_MINIMA_SECRETO = 32;

/**
 * Adaptador real del puerto de tokens: JWT firmado con HS256.
 *
 * El token incluye el identificador del usuario y su rol. La verificación
 * valida firma, emisor, audiencia y vencimiento.
 */
export class JwtTokenService {
  #clave;
  #minutosDeVida;
  #reloj;

  constructor({ secreto, minutosDeVida = 60, reloj }) {
    if (typeof secreto !== 'string' || secreto.length < LONGITUD_MINIMA_SECRETO) {
      throw new Error(
        `JWT_SECRET debe tener al menos ${LONGITUD_MINIMA_SECRETO} caracteres para firmar tokens.`,
      );
    }

    if (!Number.isInteger(minutosDeVida) || minutosDeVida < 1) {
      throw new Error('La vida del token debe ser un entero positivo en minutos.');
    }

    this.#clave = new TextEncoder().encode(secreto);
    this.#minutosDeVida = minutosDeVida;
    this.#reloj = reloj;
  }

  async firmar({ usuarioId, rol }) {
    const ahora = this.#reloj.ahora();
    const expiraEn = new Date(ahora.getTime() + this.#minutosDeVida * 60_000);

    const token = await new SignJWT({ rol })
      .setProtectedHeader({ alg: ALGORITMO, typ: 'JWT' })
      .setSubject(usuarioId)
      .setIssuer(EMISOR)
      .setAudience(AUDIENCIA)
      .setIssuedAt(Math.floor(ahora.getTime() / 1000))
      .setExpirationTime(Math.floor(expiraEn.getTime() / 1000))
      .sign(this.#clave);

    return { token, expiraEn: expiraEn.toISOString() };
  }

  async verificar(token) {
    const { payload } = await jwtVerify(token, this.#clave, {
      algorithms: [ALGORITMO],
      issuer: EMISOR,
      audience: AUDIENCIA,
    });

    if (typeof payload.sub !== 'string' || typeof payload.rol !== 'string') {
      throw new Error('El token no contiene la identidad del usuario.');
    }

    return { usuarioId: payload.sub, rol: payload.rol };
  }
}
