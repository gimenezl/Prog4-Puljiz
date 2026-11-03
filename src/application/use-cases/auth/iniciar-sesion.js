import { ErrorDeDominio } from '../../../domain/errors/error-de-dominio.js';
import { normalizarEmail } from '../../../domain/value-objects/email.js';

// Hash bcrypt de una contraseña ficticia. Se usa cuando el email no existe
// para que el tiempo de respuesta sea similar al de una cuenta real.
const HASH_FICTICIO = '$2b$12$dKqtqow62SC1GfrdPKDqd.ABfhzUeI3N796zOzxloG3nehqAAoIUq';

/**
 * Caso de uso: iniciar sesión.
 *
 * Devuelve el mismo error para email inexistente y contraseña incorrecta para
 * no revelar qué cuentas existen.
 */
export function crearIniciarSesion({ repositorioUsuarios, hasher, servicioDeTokens }) {
  return async function iniciarSesion({ email, contrasena }) {
    const emailNormalizado = normalizarEmail(email);
    const usuario = await repositorioUsuarios.buscarPorEmail(emailNormalizado);

    const credencialValida = await hasher.verificar(
      contrasena,
      usuario?.credencial ?? HASH_FICTICIO,
    );

    if (!usuario || !credencialValida) {
      throw new ErrorDeDominio(
        'CREDENCIALES_INVALIDAS',
        'El email o la contraseña son incorrectos.',
      );
    }

    const { token, expiraEn } = await servicioDeTokens.firmar({
      usuarioId: usuario.id,
      rol: usuario.rol,
    });

    return { token, expiraEn, usuario };
  };
}
