import { ErrorDeDominio } from '../../../domain/errors/error-de-dominio.js';
import { Viaje } from '../../../domain/entities/viaje.js';
import { calcularPrecioBase } from '../../../domain/services/precio-base.js';
import { PuntoGeografico } from '../../../domain/value-objects/punto-geografico.js';
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
 * Caso de uso: crear un viaje (pedido) de forma idempotente.
 *
 * La clave de idempotencia se registra en la misma transacción que el viaje.
 * Un reintento con la misma clave y el mismo cuerpo devuelve la respuesta
 * original; con otro cuerpo se rechaza.
 */
export function crearCrearViaje({
  repositorioViajes,
  repositorioClavesIdempotencia,
  unidadDeTrabajo,
  reloj,
  generadorIds,
  tarifa,
  ttlIdempotenciaMs = 24 * 60 * 60_000,
}) {
  return async function crearViaje({ pasajeroId, origen, destino, claveIdempotencia }) {
    if (typeof claveIdempotencia !== 'string' || claveIdempotencia.trim().length === 0) {
      throw new ErrorDeDominio(
        'CLAVE_DE_IDEMPOTENCIA_REQUERIDA',
        'La cabecera Idempotency-Key es obligatoria para crear un viaje.',
      );
    }

    const origenVO = new PuntoGeografico(origen);
    const destinoVO = new PuntoGeografico(destino);
    const distanciaEstimadaM = Math.round(origenVO.distanciaA(destinoVO));

    if (distanciaEstimadaM <= 0) {
      throw new ErrorDeDominio('DATOS_INVALIDOS', 'El destino debe ser distinto del origen.');
    }

    const precioFijadoCentavos = calcularPrecioBase({
      distanciaM: distanciaEstimadaM,
      tarifa,
    });
    const alcance = `viaje:crear:${pasajeroId}`;
    const huella = huellaContenido({
      origen: origenVO.aJSON(),
      destino: destinoVO.aJSON(),
    });
    const ahora = reloj.ahora();

    try {
      return await unidadDeTrabajo.ejecutar(async (tx) => {
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

        const viaje = new Viaje({
          id: generadorIds.generar(),
          pasajeroId,
          origen: origenVO,
          destino: destinoVO,
          distanciaEstimadaM,
          precioFijadoCentavos,
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

        if (!registrada) {
          // Otra transacción ganó la carrera por la clave. Se deshace esta
          // operación completa y se devuelve la respuesta ganadora.
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
