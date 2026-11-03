/**
 * Traducción de motivos de rechazo del dominio a códigos HTTP.
 * El mapeo vive en el adaptador de entrada, no en el dominio.
 */
const ESTADOS_HTTP_POR_CODIGO = {
  DATOS_INVALIDOS: 400,
  CREDENCIALES_INVALIDAS: 401,
  NO_AUTENTICADO: 401,
  NO_AUTORIZADO: 403,
  NO_ENCONTRADO: 404,
  EMAIL_YA_REGISTRADO: 409,
  TRANSICION_INVALIDA: 409,
  VIAJE_NO_DISPONIBLE: 409,
  OFERTA_NO_PENDIENTE: 409,
  CHOFER_NO_ELEGIBLE: 409,
  CHOFER_OCUPADO: 409,
  COTIZACION_YA_CONFIRMADA: 409,
  CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO: 409,
  CLAVE_DE_IDEMPOTENCIA_REQUERIDA: 400,
  OFERTA_VENCIDA: 410,
  COTIZACION_VENCIDA: 410,
  FUERA_DE_COBERTURA: 422,
};

/**
 * Errores conocidos del adaptador HTTP (body-parser y similares). Se traducen
 * a mensajes seguros para no devolver detalles del parser ni el cuerpo crudo.
 */
const ERRORES_HTTP_CONOCIDOS = {
  'entity.parse.failed': {
    estado: 400,
    codigo: 'CUERPO_INVALIDO',
    mensaje: 'El cuerpo de la solicitud no es JSON válido.',
  },
  'entity.too.large': {
    estado: 413,
    codigo: 'CUERPO_DEMASIADO_GRANDE',
    mensaje: 'El cuerpo de la solicitud es demasiado grande.',
  },
  'encoding.unsupported': {
    estado: 415,
    codigo: 'CODIFICACION_NO_SOPORTADA',
    mensaje: 'La codificación del cuerpo no está soportada.',
  },
  'charset.unsupported': {
    estado: 415,
    codigo: 'CODIFICACION_NO_SOPORTADA',
    mensaje: 'La codificación del cuerpo no está soportada.',
  },
};

/**
 * Devuelve el mapeo HTTP de un error de dominio o null si el código no está
 * registrado (en ese caso se trata como error interno).
 */
export function mapearErrorDeDominio(error) {
  const estado = ESTADOS_HTTP_POR_CODIGO[error.codigo];

  if (!estado) return null;

  return {
    estado,
    codigo: error.codigo,
    mensaje: error.message,
  };
}

/**
 * Traduce errores técnicos del adaptador HTTP que sí conocemos. Cualquier otro
 * error no de dominio se responde con un mensaje genérico.
 */
export function mapearErrorHttp(error) {
  return ERRORES_HTTP_CONOCIDOS[error?.type] ?? null;
}
