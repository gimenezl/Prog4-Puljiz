import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { createErrorHandler } from './middlewares/error-handler.js';
import { notFoundHandler } from './middlewares/not-found.js';
import { createHealthRouter } from './routes/health.routes.js';

/**
 * Adaptador de entrada HTTP. Recibe todas sus dependencias ya construidas.
 * No conoce adaptadores concretos ni reglas de negocio.
 */
export function createHttpApp({
  logger,
  healthCheck,
  corsOrigin = '*',
  bodyLimit = '100kb',
  rateLimit: opcionesRateLimit = {},
}) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: corsOrigin }));
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => {
        const solicitado = req.headers['x-request-id'];
        return typeof solicitado === 'string' && solicitado.length <= 128
          ? solicitado
          : randomUUID();
      },
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );

  app.use(express.json({ limit: bodyLimit }));
  app.use(express.urlencoded({ extended: false, limit: bodyLimit }));

  app.use(
    rateLimit({
      windowMs: opcionesRateLimit.windowMs ?? 60_000,
      limit: opcionesRateLimit.limit ?? 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (req, res) => {
        res.status(429).json({
          error: {
            codigo: 'DEMASIADAS_SOLICITUDES',
            mensaje: 'Se superó el límite de solicitudes. Intente más tarde.',
          },
          requestId: req.id,
        });
      },
    }),
  );

  app.use('/health', createHealthRouter({ healthCheck }));

  app.use(notFoundHandler);
  app.use(createErrorHandler({ logger }));

  return app;
}
