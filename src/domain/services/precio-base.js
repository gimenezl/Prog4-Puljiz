import { ErrorDeDominio } from '../errors/error-de-dominio.js';

function validarEnteroNoNegativo(valor, mensaje) {
  if (!Number.isInteger(valor) || valor < 0) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', mensaje);
  }

  return valor;
}

/**
 * Calcula el precio base de un viaje a partir de la distancia.
 *
 * Esta tarifa fija es el punto de partida del bloque de viajes. El cálculo
 * dinámico por demanda se reemplaza cuando exista el módulo de cotizaciones;
 * el cliente nunca envía importes.
 */
export function calcularPrecioBase({ distanciaM, tarifa }) {
  validarEnteroNoNegativo(distanciaM, 'La distancia no es válida.');

  const baseCentavos = validarEnteroNoNegativo(
    tarifa?.baseCentavos,
    'La tarifa base no es válida.',
  );
  const porKmCentavos = validarEnteroNoNegativo(
    tarifa?.porKmCentavos,
    'La tarifa por kilómetro no es válida.',
  );
  const minimoCentavos = validarEnteroNoNegativo(
    tarifa?.minimoCentavos,
    'La tarifa mínima no es válida.',
  );
  const maximoCentavos = validarEnteroNoNegativo(
    tarifa?.maximoCentavos,
    'La tarifa máxima no es válida.',
  );

  if (minimoCentavos > maximoCentavos) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', 'La tarifa mínima supera a la máxima.');
  }

  const bruto = baseCentavos + Math.round((distanciaM / 1000) * porKmCentavos);

  return Math.min(Math.max(bruto, minimoCentavos), maximoCentavos);
}
