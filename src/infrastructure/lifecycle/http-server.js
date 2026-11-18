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
 *
 * `closeIdleConnections` se repite mientras el cierre está pendiente porque una
 * conexión keep-alive puede quedar inactiva recién cuando termina el último
 * pedido en vuelo. Sin ese cierre diferido, `server.close` esperaría a que el
 * cliente cierre la conexión y el apagado terminaría forzado por timeout.
 */
export async function closeHttpServer(servidor) {
  if (!servidor.listening) return;

  servidor.closeIdleConnections?.();

  const intervalo = setInterval(() => {
    servidor.closeIdleConnections?.();
  }, 50);
  intervalo.unref?.();

  try {
    await new Promise((resolve, reject) => {
      servidor.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  } finally {
    clearInterval(intervalo);
  }
}
