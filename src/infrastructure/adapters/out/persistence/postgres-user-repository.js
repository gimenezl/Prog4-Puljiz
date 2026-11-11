import { Usuario } from '../../../../domain/entities/usuario.js';
import { ErrorDeDominio } from '../../../../domain/errors/error-de-dominio.js';

/**
 * Adaptador real del puerto RepositorioUsuarios sobre PostgreSQL.
 * Mantiene las consultas SQL fuera del dominio y de los casos de uso.
 * Todas las operaciones aceptan un ejecutor opcional para participar de una
 * transacción abierta por la unidad de trabajo.
 */
export class PostgresUserRepository {
  #baseDeDatos;

  constructor({ baseDeDatos }) {
    this.#baseDeDatos = baseDeDatos;
  }

  async buscarPorId(id, ejecutor) {
    const { rows } = await this.#ejecutor(ejecutor).query(
      'SELECT id, email, nombre, credencial, rol, creado_en FROM usuarios WHERE id = $1',
      [id],
    );

    return rows[0] ? mapearUsuario(rows[0]) : null;
  }

  async buscarPorEmail(email, ejecutor) {
    const { rows } = await this.#ejecutor(ejecutor).query(
      'SELECT id, email, nombre, credencial, rol, creado_en FROM usuarios WHERE LOWER(email) = LOWER($1)',
      [email],
    );

    return rows[0] ? mapearUsuario(rows[0]) : null;
  }

  async crear(usuario, ejecutor) {
    try {
      await this.#ejecutor(ejecutor).query(
        `INSERT INTO usuarios (id, email, nombre, credencial, rol, creado_en)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          usuario.id,
          usuario.email,
          usuario.nombre,
          usuario.credencial,
          usuario.rol,
          usuario.creadoEn,
        ],
      );
    } catch (error) {
      // 23505 = unique_violation. Cubre la carrera de dos registros simultáneos.
      if (error?.code === '23505') {
        throw new ErrorDeDominio('EMAIL_YA_REGISTRADO', 'Ya existe una cuenta con ese email.');
      }

      throw error;
    }
  }

  async actualizar(usuario, ejecutor) {
    const resultado = await this.#ejecutor(ejecutor).query(
      'UPDATE usuarios SET email = $2, nombre = $3 WHERE id = $1',
      [usuario.id, usuario.email, usuario.nombre],
    );

    if (resultado.rowCount === 0) {
      throw new ErrorDeDominio('NO_ENCONTRADO', 'El usuario no existe.');
    }
  }

  async verificarDisponibilidad() {
    try {
      await this.#baseDeDatos.query('SELECT 1 FROM usuarios LIMIT 1');
      return true;
    } catch {
      return false;
    }
  }

  #ejecutor(ejecutor) {
    return ejecutor ?? this.#baseDeDatos;
  }
}

function mapearUsuario(fila) {
  return new Usuario({
    id: fila.id,
    email: fila.email,
    nombre: fila.nombre,
    credencial: fila.credencial,
    rol: fila.rol,
    creadoEn: fila.creado_en,
  });
}
