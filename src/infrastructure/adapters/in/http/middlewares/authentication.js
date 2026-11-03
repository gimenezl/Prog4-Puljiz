import { ROLES } from '../../../../../domain/entities/usuario.js';
import { ErrorDeDominio } from '../../../../../domain/errors/error-de-dominio.js';
import { asyncHandler } from '../async-handler.js';

const PATRON_BEARER = /^Bearer\s+(\S+)$/i;

/**
 * Middleware de autenticación. Verifica el token Bearer y publica la identidad
 * en `req.autenticacion`. No consulta la base de datos: el token ya contiene la
 * identidad firmada y la autorización por recurso se valida en cada caso de uso.
 */
export function crearAutenticacionRequerida({ servicioDeTokens }) {
  return asyncHandler(async (req, _res, next) => {
    const encabezado = req.headers.authorization;
    const coincidencia = typeof encabezado === 'string' ? PATRON_BEARER.exec(encabezado) : null;

    if (!coincidencia) {
      throw new ErrorDeDominio('NO_AUTENTICADO', 'Se requiere un token Bearer.');
    }

    let sesion;

    try {
      sesion = await servicioDeTokens.verificar(coincidencia[1]);
    } catch {
      throw new ErrorDeDominio('NO_AUTENTICADO', 'El token no es válido o expiró.');
    }

    if (!sesion || typeof sesion.usuarioId !== 'string' || !Object.hasOwn(ROLES, sesion.rol)) {
      throw new ErrorDeDominio('NO_AUTENTICADO', 'El token no es válido o expiró.');
    }

    req.autenticacion = Object.freeze({
      usuarioId: sesion.usuarioId,
      rol: sesion.rol,
    });

    next();
  });
}
