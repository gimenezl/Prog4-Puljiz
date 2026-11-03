/**
 * Arranca el servidor HTTP y resuelve cuando está escuchando.
 * Si el puerto no está disponible, rechaza con el error original.
 */
export function startHttpServer({ app, host, port, logger }) {
  return new Promise((resolve, reject) => {
    const servidor = app.listen(port, host);

    const alFallar = (error) => {
      servidor.off('listening', alEscuchar);
      reject(error);
    };

    const alEscuchar = () => {
      servidor.off('error', alFallar);
      logger?.info({ host, puerto: servidor.address().port }, 'Servidor HTTP escuchando');
      resolve(servidor);
    };

    servidor.once('error', alFallar);
    servidor.once('listening', alEscuchar);
  });
}

/**
 * Deja de aceptar conexiones nuevas, cierra las conexiones inactivas y
 * espera a que terminen las solicitudes en curso.
 */
export async function closeHttpServer(servidor) {
  if (!servidor.listening) return;

  servidor.closeIdleConnections?.();

  await new Promise((resolve, reject) => {
    servidor.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
