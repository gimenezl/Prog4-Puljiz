/**
 * Convierte un error en un objeto seguro para logs.
 *
 * Solo conserva datos de diagnóstico. Nunca copia propiedades como `body`,
 * `headers` o `params`, que pueden contener credenciales o datos personales.
 * El stack trace se conserva únicamente en el log del servidor; nunca se
 * envía al cliente.
 */
export function serializarErrorParaLog(error) {
  if (!(error instanceof Error)) {
    return { mensaje: String(error) };
  }

  return {
    tipo: error.name,
    mensaje: error.message,
    ...(error.stack ? { stack: error.stack } : {}),
    ...(error.codigo ? { codigo: error.codigo } : {}),
    ...(Number.isInteger(error.status) ? { status: error.status } : {}),
  };
}
