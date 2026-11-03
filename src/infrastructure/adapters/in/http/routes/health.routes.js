import { Router } from 'express';

import { asyncHandler } from '../async-handler.js';

/**
 * Endpoints de infraestructura:
 * - /health: liveness. Solo confirma que el proceso responde.
 * - /ready: readiness. Comprueba las dependencias externas necesarias.
 */
export function createHealthRouter({ readinessCheck }) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.status(200).json({
      estado: 'ok',
      tipo: 'liveness',
      fecha: new Date().toISOString(),
    });
  });

  router.get(
    '/ready',
    asyncHandler(async (_req, res) => {
      const chequeos = await readinessCheck();
      const listo = Object.values(chequeos).every((chequeo) => chequeo?.ok === true);

      res.status(listo ? 200 : 503).json({
        estado: listo ? 'listo' : 'no_listo',
        tipo: 'readiness',
        chequeos,
        fecha: new Date().toISOString(),
      });
    }),
  );

  return router;
}
