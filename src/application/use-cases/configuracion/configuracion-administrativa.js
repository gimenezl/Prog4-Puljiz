import { ReglaDeMultiplicador } from '../../../domain/entities/regla-de-multiplicador.js';
import { Tarifa } from '../../../domain/entities/tarifa.js';
import { ZonaDeDemanda } from '../../../domain/entities/zona-de-demanda.js';
import { ErrorDeDominio } from '../../../domain/errors/error-de-dominio.js';
import { validarAdministrador } from '../../services/validar-administrador.js';

function noEncontrado(entidad) {
  return new ErrorDeDominio('NO_ENCONTRADO', `La ${entidad} no existe.`);
}

/** Alta de zona. El administrador es el actor autenticado del request. */
export function crearCrearZona({ repositorioZonas, unidadDeTrabajo, reloj, generadorIds }) {
  return async function crearZona({ actor, nombre, criterio, activa = true }) {
    validarAdministrador(actor);

    return unidadDeTrabajo.ejecutar(async (tx) => {
      const zona = new ZonaDeDemanda({
        id: generadorIds.generar(),
        nombre,
        criterio,
        activa,
        creadaEn: reloj.ahora(),
      });

      await repositorioZonas.crear(zona, tx);
      return zona.aVistaPublica();
    });
  };
}

/** Edición de zona: el alta y el baja lógica se hacen con el mismo caso. */
export function crearActualizarZona({ repositorioZonas, unidadDeTrabajo }) {
  return async function actualizarZona({ actor, zonaId, nombre, criterio, activa }) {
    validarAdministrador(actor);

    return unidadDeTrabajo.ejecutar(async (tx) => {
      const zona = await repositorioZonas.buscarPorId(zonaId, tx);

      if (!zona) throw noEncontrado('zona');

      const actualizada = zona.conDatos({ nombre, criterio, activa });
      await repositorioZonas.actualizar(actualizada, tx);
      return actualizada.aVistaPublica();
    });
  };
}

export function crearListarZonas({ repositorioZonas }) {
  return async function listarZonas({ actor } = {}) {
    validarAdministrador(actor);

    const zonas = await repositorioZonas.listar();
    return zonas.map((zona) => zona.aVistaPublica());
  };
}

export function crearCrearTarifa({ repositorioTarifas, unidadDeTrabajo, reloj, generadorIds }) {
  return async function crearTarifa({
    actor,
    baseCentavos,
    porKmCentavos,
    porMinutoCentavos,
    precioMaximoCentavos,
  }) {
    validarAdministrador(actor);

    return unidadDeTrabajo.ejecutar(async (tx) => {
      const tarifa = new Tarifa({
        id: generadorIds.generar(),
        baseCentavos,
        porKmCentavos,
        porMinutoCentavos,
        precioMaximoCentavos,
        creadaEn: reloj.ahora(),
      });

      await repositorioTarifas.crear(tarifa, tx);
      return tarifa.aVistaPublica();
    });
  };
}

export function crearEditarTarifa({ repositorioTarifas, unidadDeTrabajo }) {
  return async function editarTarifa({
    actor,
    tarifaId,
    baseCentavos,
    porKmCentavos,
    porMinutoCentavos,
    precioMaximoCentavos,
  }) {
    validarAdministrador(actor);

    return unidadDeTrabajo.ejecutar(async (tx) => {
      const tarifa = await repositorioTarifas.buscarPorId(tarifaId, tx);

      if (!tarifa) throw noEncontrado('tarifa');

      const editada = tarifa.conDatos({
        baseCentavos,
        porKmCentavos,
        porMinutoCentavos,
        precioMaximoCentavos,
      });
      await repositorioTarifas.actualizar(editada, tx);
      return editada.aVistaPublica();
    });
  };
}

/**
 * Publica un borrador. `ahora` se obtiene una sola vez del Reloj: con esa
 * misma marca se registran la publicación y el inicio de vigencia.
 */
export function crearPublicarTarifa({ repositorioTarifas, unidadDeTrabajo, reloj }) {
  return async function publicarTarifa({ actor, tarifaId }) {
    validarAdministrador(actor);
    const ahora = reloj.ahora();

    return unidadDeTrabajo.ejecutar(async (tx) => {
      const tarifa = await repositorioTarifas.buscarPorId(tarifaId, tx);

      if (!tarifa) throw noEncontrado('tarifa');

      const publicada = tarifa.publicar({
        vigenteDesde: ahora,
        publicadaPorId: actor.id,
        publicadaEn: ahora,
      });
      const publicadaPersistida = await repositorioTarifas.publicar(publicada, tx);
      return publicadaPersistida.aVistaPublica();
    });
  };
}

export function crearListarTarifas({ repositorioTarifas }) {
  return async function listarTarifas({ actor } = {}) {
    validarAdministrador(actor);

    const tarifas = await repositorioTarifas.listar();
    return tarifas.map((tarifa) => tarifa.aVistaPublica());
  };
}

export function crearCrearRegla({ repositorioReglas, unidadDeTrabajo, reloj, generadorIds }) {
  return async function crearRegla({
    actor,
    umbralInferior,
    umbralSuperior,
    multiplicadorMinimo,
    multiplicadorMaximo,
    escalaMultiplicador,
  }) {
    validarAdministrador(actor);

    return unidadDeTrabajo.ejecutar(async (tx) => {
      const regla = new ReglaDeMultiplicador({
        id: generadorIds.generar(),
        umbralInferior,
        umbralSuperior,
        multiplicadorMinimo,
        multiplicadorMaximo,
        escalaMultiplicador,
        creadaEn: reloj.ahora(),
      });

      await repositorioReglas.crear(regla, tx);
      return regla.aVistaPublica();
    });
  };
}

export function crearEditarRegla({ repositorioReglas, unidadDeTrabajo }) {
  return async function editarRegla({
    actor,
    reglaId,
    umbralInferior,
    umbralSuperior,
    multiplicadorMinimo,
    multiplicadorMaximo,
    escalaMultiplicador,
  }) {
    validarAdministrador(actor);

    return unidadDeTrabajo.ejecutar(async (tx) => {
      const regla = await repositorioReglas.buscarPorId(reglaId, tx);

      if (!regla) throw noEncontrado('regla');

      const editada = regla.conDatos({
        umbralInferior,
        umbralSuperior,
        multiplicadorMinimo,
        multiplicadorMaximo,
        escalaMultiplicador,
      });
      await repositorioReglas.actualizar(editada, tx);
      return editada.aVistaPublica();
    });
  };
}

export function crearPublicarRegla({ repositorioReglas, unidadDeTrabajo, reloj }) {
  return async function publicarRegla({ actor, reglaId, motivo = null }) {
    validarAdministrador(actor);
    const ahora = reloj.ahora();

    return unidadDeTrabajo.ejecutar(async (tx) => {
      const regla = await repositorioReglas.buscarPorId(reglaId, tx);

      if (!regla) throw noEncontrado('regla');

      const publicada = regla.publicar({
        vigenteDesde: ahora,
        motivo,
        publicadaPorId: actor.id,
        publicadaEn: ahora,
      });
      const publicadaPersistida = await repositorioReglas.publicar(publicada, tx);
      return publicadaPersistida.aVistaPublica();
    });
  };
}

export function crearListarReglas({ repositorioReglas }) {
  return async function listarReglas({ actor } = {}) {
    validarAdministrador(actor);

    const reglas = await repositorioReglas.listar();
    return reglas.map((regla) => regla.aVistaPublica());
  };
}
