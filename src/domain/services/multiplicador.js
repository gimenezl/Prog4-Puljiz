import { ErrorDeDominio } from '../errors/error-de-dominio.js';
import {
  ESCALA_DECIMAL,
  aEnteroEscalado,
  cambiarEscala,
  desdeEnteroEscalado,
  redondearMitadArriba,
} from './decimal-exacto.js';

const CIEN_POR_CIEN = 10000n;

function validarRegla(regla) {
  if (regla?.formula !== 'LINEAL_POR_TRAMOS') {
    throw new ErrorDeDominio('DATOS_INVALIDOS', 'La fórmula del multiplicador no es válida.');
  }

  if (
    !Number.isInteger(regla.escalaMultiplicador) ||
    regla.escalaMultiplicador < 0 ||
    regla.escalaMultiplicador > 4
  ) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', 'La escala del multiplicador no es válida.');
  }

  const umbralInferior = aEnteroEscalado(regla.umbralInferior, ESCALA_DECIMAL);
  const umbralSuperior = aEnteroEscalado(regla.umbralSuperior, ESCALA_DECIMAL);
  const minimo = aEnteroEscalado(regla.multiplicadorMinimo, ESCALA_DECIMAL);
  const maximo = aEnteroEscalado(regla.multiplicadorMaximo, ESCALA_DECIMAL);

  if (umbralInferior < 0n || umbralSuperior <= umbralInferior) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', 'Los umbrales de la regla no son válidos.');
  }

  if (minimo < CIEN_POR_CIEN || maximo < minimo) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', 'El rango del multiplicador no es válido.');
  }

  return { umbralInferior, umbralSuperior, minimo, maximo };
}

function validarConteo(valor, nombre) {
  if (!Number.isInteger(valor) || valor < 0) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', `La cantidad de ${nombre} no es válida.`);
  }

  return BigInt(valor);
}

/**
 * Multiplicador LINEAL_POR_TRAMOS (docs/modelo.md §7.1).
 *
 * Todo se calcula con BigInt sobre decimales de escala 4. La relación se
 * compara por producto cruzado para no dividir nunca por cero. El único
 * redondeo es el final, a la escala configurada en la regla, mitad hacia
 * arriba; después se acota entre mínimo y máximo.
 */
export function calcularMultiplicador({ regla, solicitudes, choferesDisponibles }) {
  const { umbralInferior, umbralSuperior, minimo, maximo } = validarRegla(regla);
  const solicitudesBig = validarConteo(solicitudes, 'solicitudes');
  const choferesBig = validarConteo(choferesDisponibles, 'choferes disponibles');
  const escala = regla.escalaMultiplicador;

  let numerador;
  let denominador;

  if (choferesBig === 0n) {
    numerador = solicitudesBig > 0n ? maximo : minimo;
    denominador = 1n;
  } else {
    const relacionNumerador = solicitudesBig * CIEN_POR_CIEN;

    if (relacionNumerador <= choferesBig * umbralInferior) {
      numerador = minimo;
      denominador = 1n;
    } else if (relacionNumerador >= choferesBig * umbralSuperior) {
      numerador = maximo;
      denominador = 1n;
    } else {
      const excedente = relacionNumerador - choferesBig * umbralInferior;
      const rango = choferesBig * (umbralSuperior - umbralInferior);
      denominador = rango;
      numerador = minimo * rango + (maximo - minimo) * excedente;
    }
  }

  const factor = 10n ** BigInt(escala);
  const divisor = denominador * 10n ** BigInt(ESCALA_DECIMAL);
  const elevado = redondearMitadArriba(numerador * factor, divisor);
  const minimoEscalado = cambiarEscala(minimo, ESCALA_DECIMAL, escala);
  const maximoEscalado = cambiarEscala(maximo, ESCALA_DECIMAL, escala);
  const acotado =
    elevado < minimoEscalado ? minimoEscalado : elevado > maximoEscalado ? maximoEscalado : elevado;

  return desdeEnteroEscalado(acotado, escala);
}
