const TIEMPO_LIMITE_POR_DEFECTO_MS = 3000;

async function conTiempoLimite(operacion, milisegundos) {
  let temporizador;

  const limite = new Promise((_, rechazar) => {
    temporizador = setTimeout(() => {
      rechazar(new Error('Tiempo de espera agotado en el chequeo de readiness'));
    }, milisegundos);
  });

  try {
    return await Promise.race([operacion, limite]);
  } finally {
    clearTimeout(temporizador);
  }
}

/**
 * Construye el chequeo de readiness a partir de funciones independientes.
 * Cada una se ejecuta en paralelo y tiene su propio timeout. Un fallo se
 * traduce en { ok: false } sin tumbar el proceso.
 */
export function createReadinessCheck({ checks, timeoutMs = TIEMPO_LIMITE_POR_DEFECTO_MS }) {
  return async function readinessCheck() {
    const resultados = await Promise.all(
      Object.entries(checks).map(async ([nombre, comprobar]) => {
        try {
          const resultado = await conTiempoLimite(
            Promise.resolve().then(() => comprobar()),
            timeoutMs,
          );
          return [nombre, { ok: resultado === true }];
        } catch {
          return [nombre, { ok: false }];
        }
      }),
    );

    return Object.fromEntries(resultados);
  };
}
