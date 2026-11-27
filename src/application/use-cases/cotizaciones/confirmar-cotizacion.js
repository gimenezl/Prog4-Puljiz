import { Viaje } from '../../../domain/entities/viaje.js';
import { ErrorDeDominio } from '../../../domain/errors/error-de-dominio.js';
import { huellaContenido } from '../../services/idempotencia.js';

class ConflictoDeIdempotencia extends Error {}

function respuestaReutilizada(registro, huella) {
  if (registro.hashContenido !== huella) {
    throw new ErrorDeDominio(
      'CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO',
      'La clave de idempotencia ya fue usada con otro contenido.',
    );
  }

  return { viaje: registro.respuesta.viaje, reutilizada: true };
}

/**
 * Caso de uso: confirmar una cotización y crear el viaje con el precio fijado.
 *
 * El precio y el multiplicador se copian de la cotización; nunca se recalculan.
 * El estado se cambia con un UPDATE condicional y la clave de idempotencia se
 * registra en la misma transacción que el viaje.
 *
 * La fila de la cotización se bloquea ANTES de buscar la clave. Así, varias
 * confirmaciones simultáneas se ejecutan de a una: la que llega después ve la
 * clave y el estado que dejó la primera ya confirmados, y responde la misma
 * respuesta (misma clave) o COTIZACION_YA_CONFIRMADA (otra clave), nunca un
 * error ambiguo.
 */
export function crearConfirmarCotizacion({
  repositorioCotizaciones,
  repositorioViajes,
  repositorioClavesIdempotencia,
  unidadDeTrabajo,
  reloj,
  generadorIds,
  ttlIdempotenciaMs = 24 * 60 * 60_000,
}) {
  return async function confirmarCotizacion({ cotizacionId, pasajeroId, claveIdempotencia }) {
    if (typeof claveIdempotencia !== 'string' || claveIdempotencia.trim().length === 0) {
      throw new ErrorDeDominio(
        'CLAVE_DE_IDEMPOTENCIA_REQUERIDA',
        'La cabecera Idempotency-Key es obligatoria para confirmar una cotización.',
      );
    }

    const ahora = reloj.ahora();
    const alcance = `cotizacion:confirmar:${pasajeroId}`;
    const huella = huellaContenido({ cotizacionId, pasajeroId });

    try {
      return await unidadDeTrabajo.ejecutar(async (tx) => {
        const cotizacion = await repositorioCotizaciones.buscarPorIdParaActualizar(
          cotizacionId,
          tx,
        );

        const existente = await repositorioClavesIdempotencia.buscar(
          alcance,
          claveIdempotencia,
          tx,
        );

        if (existente) {
          if (existente.venceEn.getTime() > ahora.getTime()) {
            return respuestaReutilizada(existente, huella);
          }

          await repositorioClavesIdempotencia.eliminar(alcance, claveIdempotencia, tx);
        }

        if (!cotizacion || cotizacion.pasajeroId !== pasajeroId) {
          throw new ErrorDeDominio('NO_ENCONTRADO', 'La cotización no existe.');
        }

        const estado = cotizacion.estadoEfectivo(ahora);

        if (estado === 'VENCIDA') {
          throw new ErrorDeDominio('COTIZACION_VENCIDA', 'La cotización ya venció.');
        }

        if (estado !== 'VIGENTE') {
          throw new ErrorDeDominio('COTIZACION_YA_CONFIRMADA', 'La cotización ya fue confirmada.');
        }

        const confirmada = cotizacion.confirmar(ahora);
        const cambiada = await repositorioCotizaciones.marcarEstado(
          confirmada.id,
          confirmada.estado,
          ahora,
          tx,
        );

        if (!cambiada) {
          throw new ErrorDeDominio('TRANSICION_INVALIDA', 'La cotización ya no está vigente.');
        }

        const viaje = new Viaje({
          id: generadorIds.generar(),
          pasajeroId,
          origen: cotizacion.origen,
          destino: cotizacion.destino,
          distanciaEstimadaM: cotizacion.distanciaEstimadaM,
          precioFijadoCentavos: cotizacion.precioCentavos,
          cotizacionId: cotizacion.id,
          multiplicadorFijado: cotizacion.multiplicador,
          estado: 'SOLICITADO',
          solicitadoEn: ahora,
        });

        await repositorioViajes.crear(viaje, tx);

        const respuesta = { viaje: viaje.aVistaPublica() };
        const registrada = await repositorioClavesIdempotencia.crear(
          {
            alcance,
            clave: claveIdempotencia,
            hashContenido: huella,
            respuesta,
            creadaEn: ahora,
            venceEn: new Date(ahora.getTime() + ttlIdempotenciaMs),
          },
          tx,
        );

        if (!registrada) throw new ConflictoDeIdempotencia();

        return { ...respuesta, reutilizada: false };
      });
    } catch (error) {
      if (!(error instanceof ConflictoDeIdempotencia)) throw error;

      const ganadora = await repositorioClavesIdempotencia.buscar(alcance, claveIdempotencia);

      if (!ganadora) throw error;

      return respuestaReutilizada(ganadora, huella);
    }
  };
}
