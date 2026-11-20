import { Cotizacion } from '../../../domain/entities/cotizacion.js';
import { ErrorDeDominio } from '../../../domain/errors/error-de-dominio.js';
import { calcularMultiplicador } from '../../../domain/services/multiplicador.js';
import { calcularPrecio } from '../../../domain/services/precio.js';
import { PuntoGeografico } from '../../../domain/value-objects/punto-geografico.js';

/**
 * Caso de uso: cotizar un viaje nuevo.
 *
 * El precio y el multiplicador se calculan siempre en el servidor y se guardan
 * como foto inmutable. Los viajes confirmados con anterioridad no se recalculan:
 * esta operación solo crea una cotización nueva.
 */
export function crearCotizar({
  repositorioZonas,
  repositorioTarifas,
  repositorioReglas,
  repositorioCotizaciones,
  medidorDeDemanda,
  estimadorDeRecorrido,
  unidadDeTrabajo,
  reloj,
  generadorIds,
  vigenciaMs = 5 * 60_000,
}) {
  return async function cotizar({ pasajeroId, origen, destino }) {
    const ahora = reloj.ahora();
    const origenVO = new PuntoGeografico(origen);
    const destinoVO = new PuntoGeografico(destino);

    const zona = await repositorioZonas.zonaDe(origenVO, ahora);

    if (!zona) {
      throw new ErrorDeDominio(
        'FUERA_DE_COBERTURA',
        'El origen no pertenece a ninguna zona activa.',
      );
    }

    const [tarifa, regla] = await Promise.all([
      repositorioTarifas.vigente(ahora),
      repositorioReglas.vigente(ahora),
    ]);

    if (!tarifa || !regla) {
      throw new ErrorDeDominio(
        'CONFIGURACION_INCOMPLETA',
        'Falta una tarifa o una regla de multiplicador publicada y vigente.',
      );
    }

    const estimacion = await estimadorDeRecorrido.estimar(origenVO, destinoVO, ahora);
    const medicion = await medidorDeDemanda.medir(zona, ahora);
    const multiplicador = calcularMultiplicador({
      regla,
      solicitudes: medicion.solicitudes,
      choferesDisponibles: medicion.choferesDisponibles,
    });
    const precioCentavos = calcularPrecio({
      tarifa,
      distanciaM: estimacion.distanciaM,
      tiempoS: estimacion.tiempoS,
      multiplicador,
    });

    return unidadDeTrabajo.ejecutar(async (tx) => {
      const cotizacion = new Cotizacion({
        id: generadorIds.generar(),
        pasajeroId,
        origen: origenVO,
        destino: destinoVO,
        distanciaEstimadaM: estimacion.distanciaM,
        tiempoEstimadoS: estimacion.tiempoS,
        zonaId: zona.id,
        solicitudesUsadas: medicion.solicitudes,
        choferesDisponiblesUsados: medicion.choferesDisponibles,
        reglaId: regla.id,
        reglaVersion: regla.version,
        tarifaId: tarifa.id,
        tarifaVersion: tarifa.version,
        multiplicador,
        precioCentavos,
        parametrosConteo: {
          ...medicion.parametros,
          distanciaMetros: estimacion.distanciaM,
          tiempoSegundos: estimacion.tiempoS,
        },
        calculadaEn: ahora,
        venceEn: new Date(ahora.getTime() + vigenciaMs),
      });

      await repositorioCotizaciones.crear(cotizacion, tx);
      return cotizacion.aVistaPublica(ahora);
    });
  };
}
