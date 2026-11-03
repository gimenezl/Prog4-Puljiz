import { Chofer } from '../../../domain/entities/chofer.js';
import { ROLES, ROLES_AUTORREGISTRO, Usuario } from '../../../domain/entities/usuario.js';
import { ErrorDeDominio } from '../../../domain/errors/error-de-dominio.js';
import { validarContrasena } from '../../../domain/value-objects/contrasena.js';
import { normalizarEmail } from '../../../domain/value-objects/email.js';

/**
 * Caso de uso: registrar una cuenta.
 *
 * Solo permite los roles que una persona puede elegir por su cuenta. Cuando el
 * rol es CHOFER, el perfil operativo se crea en la misma transacción que el
 * usuario. El perfil nace inhabilitado y no disponible: un administrador debe
 * habilitarlo antes de que pueda aceptar viajes.
 */
export function crearRegistrarUsuario({
  repositorioUsuarios,
  repositorioChoferes,
  unidadDeTrabajo,
  hasher,
  reloj,
  generadorIds,
}) {
  return async function registrarUsuario({ email, nombre, contrasena, rol }) {
    const emailNormalizado = normalizarEmail(email);
    validarContrasena(contrasena);

    if (!ROLES_AUTORREGISTRO.includes(rol)) {
      throw new ErrorDeDominio(
        'DATOS_INVALIDOS',
        'Solo es posible registrarse como PASAJERO o CHOFER.',
      );
    }

    const credencial = await hasher.hashear(contrasena);

    return unidadDeTrabajo.ejecutar(async (tx) => {
      const existente = await repositorioUsuarios.buscarPorEmail(emailNormalizado, tx);

      if (existente) {
        throw new ErrorDeDominio('EMAIL_YA_REGISTRADO', 'Ya existe una cuenta con ese email.');
      }

      const usuario = new Usuario({
        id: generadorIds.generar(),
        email: emailNormalizado,
        nombre,
        credencial,
        rol,
        creadoEn: reloj.ahora(),
      });

      await repositorioUsuarios.crear(usuario, tx);

      if (usuario.rol === ROLES.CHOFER) {
        await repositorioChoferes.crear(
          new Chofer({
            usuarioId: usuario.id,
            habilitado: false,
            disponible: false,
          }),
          tx,
        );
      }

      return usuario;
    });
  };
}
