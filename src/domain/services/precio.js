import { ErrorDeDominio } from '../errors/error-de-dominio.js';
import { ESCALA_DECIMAL, aEnteroEscalado, redondearMitadArriba } from './decimal-exacto.js';

const DENOMINADOR_TIEMPO = 60000n; // mcm(1000 mm, 60 ss)

function validarEntero(valor, nombre) {
  if (!Number.isInteger(valor) || valor < 0) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', `El valor de ${nombre} no es válido.`);
  }

  return BigInt(valor);
}

/**
 * Precio estimado (docs/modelo.md §7.2).
 *
 * Base + por kilómetro + por minuto, multiplicado por el multiplicador fijado.
 * El denominador común mantiene el cálculo exacto hasta el final: se redondea
 * una sola vez, mitad hacia arriba, a la unidad menor (centavos). El tope se
 * aplica al total, después del multiplicador, y no altera el multiplicador.
 */
export function calcularPrecio({ tarifa, distanciaM, tiempoS, multiplicador }) {
  const base = validarEntero(tarifa?.baseCentavos, 'la tarifa base');
  const porKm = validarEntero(tarifa?.porKmCentavos, 'el importe por kilómetro');
  const porMinuto = validarEntero(tarifa?.porMinutoCentavos, 'el importe por minuto');
  const precioMaximo = validarEntero(tarifa?.precioMaximoCentavos, 'el precio máximo');
  const metros = validarEntero(distanciaM, 'la distancia');
  const segundos = validarEntero(tiempoS, 'el tiempo');
  const multiplicadorEscalado = aEnteroEscalado(multiplicador, ESCALA_DECIMAL);

  if (precioMaximo < base) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', 'El precio máximo no puede ser menor que la base.');
  }

  if (multiplicadorEscalado < 10000n) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', 'El multiplicador debe ser mayor o igual que 1.');
  }

  const subtotalNumerador =
    base * DENOMINADOR_TIEMPO + porKm * metros * 60n + porMinuto * segundos * 1000n;
  const brutoNumerador = subtotalNumerador * multiplicadorEscalado;
  const brutoDenominador = DENOMINADOR_TIEMPO * 10n ** BigInt(ESCALA_DECIMAL);
  const redondeado = redondearMitadArriba(brutoNumerador, brutoDenominador);

  return Number(redondeado < precioMaximo ? redondeado : precioMaximo);
}
