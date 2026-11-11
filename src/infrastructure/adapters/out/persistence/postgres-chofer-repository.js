import { Chofer } from '../../../../domain/entities/chofer.js';
import { ErrorDeDominio } from '../../../../domain/errors/error-de-dominio.js';

const CAMPOS = 'usuario_id, habilitado, disponible, viaje_activo_id';

/**
 * Adaptador real del puerto RepositorioChoferes sobre PostgreSQL.
 *
 * `buscarPorUsuarioIdParaActualizar` bloquea la fila del chofer. La aceptación
 * de un viaje toma primero el viaje y después el chofer, en ese orden global.
 */
export class PostgresChoferRepository {
  #baseDeDatos;

  constructor({ baseDeDatos }) {
    this.#baseDeDatos = baseDeDatos;
  }

  async crear(chofer, ejecutor) {
    await this.#ejecutor(ejecutor).query(
      `INSERT INTO choferes (usuario_id, habilitado, disponible, viaje_activo_id)
       VALUES ($1, $2, $3, $4)`,
      [chofer.usuarioId, chofer.habilitado, chofer.disponible, chofer.viajeActivoId],
    );
  }

  async buscarPorUsuarioId(usuarioId, ejecutor) {
    const { rows } = await this.#ejecutor(ejecutor).query(
      `SELECT ${CAMPOS} FROM choferes WHERE usuario_id = $1`,
      [usuarioId],
    );

    return rows[0] ? mapearChofer(rows[0]) : null;
  }

  async buscarPorUsuarioIdParaActualizar(usuarioId, ejecutor) {
    const { rows } = await this.#ejecutor(ejecutor).query(
      `SELECT ${CAMPOS} FROM choferes WHERE usuario_id = $1 FOR UPDATE`,
      [usuarioId],
    );

    return rows[0] ? mapearChofer(rows[0]) : null;
  }

  async actualizar(chofer, ejecutor) {
    const resultado = await this.#ejecutor(ejecutor).query(
      `UPDATE choferes
          SET habilitado = $2,
              disponible = $3,
              viaje_activo_id = $4
        WHERE usuario_id = $1`,
      [chofer.usuarioId, chofer.habilitado, chofer.disponible, chofer.viajeActivoId],
    );

    if (resultado.rowCount === 0) {
      throw new ErrorDeDominio('NO_ENCONTRADO', 'El perfil de chofer no existe.');
    }
  }

  async verificarDisponibilidad() {
    try {
      await this.#baseDeDatos.query('SELECT 1 FROM choferes LIMIT 1');
      return true;
    } catch {
      return false;
    }
  }

  #ejecutor(ejecutor) {
    return ejecutor ?? this.#baseDeDatos;
  }
}

function mapearChofer(fila) {
  return new Chofer({
    usuarioId: fila.usuario_id,
    habilitado: fila.habilitado,
    disponible: fila.disponible,
    viajeActivoId: fila.viaje_activo_id,
  });
}
