import { Router } from 'express';

/**
 * Endpoint de infraestructura para verificar que el proceso y sus
 * dependencias externas estén disponibles.
 */
export function createHealthRouter({ healthCheck }) {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const chequeos = await healthCheck();
      const saludable = Object.values(chequeos).every((chequeo) => chequeo?.ok === true);

      res.status(saludable ? 200 : 503).json({
        estado: saludable ? 'ok' : 'degradado',
        chequeos,
        fecha: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
