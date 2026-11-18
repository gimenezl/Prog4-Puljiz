import { CobroSimulado } from '../../../domain/entities/cobro-simulado.js';
import { ESTADOS_VIAJE } from '../../../domain/entities/viaje.js';
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

  return {
    viaje: registro.respuesta.viaje,
    cobro: registro.respuesta.cobro,
    reutilizada: true,
  };
}

/**
 * Caso de uso: finalizar un viaje y ejecutar su cobro simulado.
 *
 * La finalización, la liberación del chofer, el cobro y la clave de
 * idempotencia se guardan en una sola operación atómica. El cobro tiene además
 * la clave natural `viajeId` (UNIQUE), por lo que no puede duplicarse.
 *
 * La clave que envía el cliente se aísla por chofer
 * (`viaje:finalizar:<choferId>`). Un reintento simultáneo con la misma clave
 * espera el bloqueo del viaje y devuelve la respuesta original.
 */
export function crearFinalizarViaje({
  repositorioViajes,
  repositorioChoferes,
  repositorioCobros,
  repositorioClavesIdempotencia,
  simuladorDeCobro,
  unidadDeTrabajo,
  reloj,
  generadorIds,
  ttlIdempotenciaMs = 24 * 60 * 60_000,
}) {
  return async function finalizarViaje({ viajeId, choferId, claveIdempotencia }) {
    if (typeof claveIdempotencia !== 'string' || claveIdempotencia.trim().length === 0) {
      throw new ErrorDeDominio(
        'CLAVE_DE_IDEMPOTENCIA_REQUERIDA',
        'La cabecera Idempotency-Key es obligatoria para finalizar un viaje y cobrar.',
      );
    }

    const alcance = `viaje:finalizar:${choferId}`;
    const huella = huellaContenido({ viajeId });
    const ahora = reloj.ahora();

    try {
      return await unidadDeTrabajo.ejecutar(async (tx) => {
        const viaje = await repositorioViajes.buscarPorIdParaActualizar(viajeId, tx);

        if (!viaje) {
          throw new ErrorDeDominio('NO_ENCONTRADO', 'El viaje no existe.');
        }

        // La clave se busca después de bloquear el viaje. Así, si otra
        // petición con la misma clave acaba de finalizar, este reintento ve el
        // registro ya confirmado y devuelve la misma respuesta.
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

        if (viaje.choferId !== choferId) {
          throw new ErrorDeDominio(
            'NO_AUTORIZADO',
            'Solo el chofer asignado puede finalizar este viaje.',
          );
        }

        if (viaje.estado !== ESTADOS_VIAJE.ASIGNADO) {
          throw new ErrorDeDominio(
            'TRANSICION_INVALIDA',
            'Solo un viaje asignado puede finalizarse.',
          );
        }

        const finalizado = viaje.finalizar(ahora);
        const pendiente = new CobroSimulado({
          id: generadorIds.generar(),
          viajeId: viaje.id,
          montoCentavos: finalizado.precioFijadoCentavos,
          creadoEn: ahora,
        });

        const cobroCreado = await repositorioCobros.crear(pendiente, tx);

        if (!cobroCreado) {
          throw new ErrorDeDominio('TRANSICION_INVALIDA', 'El viaje ya tiene un cobro registrado.');
        }

        // El simulador es local y determinista por viaje. Se ejecuta dentro de
        // la transacción para que el cobro quede confirmado solo si todo el
        // efecto se confirma; un fallo posterior revierte viaje, cobro y clave.
        const simulacion = await simuladorDeCobro.cobrar({
          viajeId: viaje.id,
          montoCentavos: pendiente.montoCentavos,
        });
        const cobrado = pendiente.cobrar(reloj.ahora(), simulacion.referencia);

        await repositorioCobros.actualizar(cobrado, tx);
        await repositorioViajes.actualizar(finalizado, tx);

        const chofer = await repositorioChoferes.buscarPorUsuarioIdParaActualizar(choferId, tx);

        if (chofer) {
          await repositorioChoferes.actualizar(chofer.liberar(viaje.id), tx);
        }

        const respuesta = {
          viaje: finalizado.aVistaPublica(),
          cobro: cobrado.aVistaPublica(),
        };
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

        if (!registrada) {
          // Otra transacción ganó la carrera por la clave. Se revierte todo y
          // se recupera la respuesta ganadora.
          throw new ConflictoDeIdempotencia();
        }

        return { ...respuesta, reutilizada: false };
      });
    } catch (error) {
      if (!(error instanceof ConflictoDeIdempotencia)) {
        throw error;
      }

      const ganadora = await repositorioClavesIdempotencia.buscar(alcance, claveIdempotencia);

      if (!ganadora) {
        throw error;
      }

      return respuestaReutilizada(ganadora, huella);
    }
  };
}
