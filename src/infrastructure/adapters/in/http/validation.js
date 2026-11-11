import { ErrorDeDominio } from '../../../../domain/errors/error-de-dominio.js';
import { esquemaId as esquemaIdSeguro } from './schemas/auth.schemas.js';

function describirIssue(issue) {
  if (issue.code === 'unrecognized_keys') {
    return `campos no permitidos: ${issue.keys.join(', ')}`;
  }

  const campo = issue.path.length > 0 ? issue.path.join('.') : 'cuerpo';
  return `${campo}: ${issue.message}`;
}

/**
 * Valida el cuerpo con un esquema Zod estricto. El mensaje de error describe
 * los campos inválidos sin repetir los valores recibidos.
 */
export function validarCuerpo(esquema, valor) {
  const resultado = esquema.safeParse(valor ?? {});

  if (resultado.success) {
    return resultado.data;
  }

  const detalle = resultado.error.issues.slice(0, 5).map(describirIssue).join('; ');

  throw new ErrorDeDominio('DATOS_INVALIDOS', `Datos inválidos: ${detalle}`);
}

export function validarIdentificador(valor) {
  const resultado = esquemaIdSeguro.safeParse(valor);

  if (!resultado.success) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', 'El identificador no es válido.');
  }

  return resultado.data;
}
