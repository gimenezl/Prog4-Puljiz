import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { normalizarRequestId } from '../../../context/request-id.js';
import { createErrorHandler } from './middlewares/error-handler.js';
import { crearAutenticacionRequerida } from './middlewares/authentication.js';
import { crearLimitadorLogin } from './middlewares/login-rate-limit.js';
import { notFoundHandler } from './middlewares/not-found.js';
import { crearLimitador } from './middlewares/rate-limit.js';
import { createRequestContextMiddleware } from './middlewares/request-context.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createChoferesRouter } from './routes/choferes.routes.js';
import { createHealthRouter } from './routes/health.routes.js';
import { createUsuariosRouter } from './routes/usuarios.routes.js';
import { createViajesRouter } from './routes/viajes.routes.js';

/**
 * Adaptador de entrada HTTP. Recibe todas sus dependencias ya construidas.
 * No conoce adaptadores concretos ni reglas de negocio.
 */
export function createHttpApp({
  logger,
  readinessCheck,
  auth,
  viajes,
  choferes,
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
      genReqId: (req) =>
        normalizarRequestId(req.headers['x-request-id'] ?? req.headers['x-correlation-id']),
      autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/ready' },
    }),
  );
  app.use(createRequestContextMiddleware({ logger }));

  app.use(express.json({ limit: bodyLimit }));
  app.use(express.urlencoded({ extended: false, limit: bodyLimit }));

  app.use(
    crearLimitador({
      windowMs: opcionesRateLimit.windowMs ?? 60_000,
      limit: opcionesRateLimit.limit ?? 300,
    }),
  );

  app.use(createHealthRouter({ readinessCheck }));

  if (auth) {
    const autenticacionRequerida = crearAutenticacionRequerida({
      servicioDeTokens: auth.servicioDeTokens,
    });
    const limitadorLogin = crearLimitadorLogin(auth.loginRateLimit);
    const limitadorRegistro = crearLimitador({
      windowMs: opcionesRateLimit.registro?.windowMs ?? 60_000,
      limit: opcionesRateLimit.registro?.limit ?? 10,
      mensaje: 'Se superó el límite de registros. Intente más tarde.',
    });
    const limitadorViajes = crearLimitador({
      windowMs: opcionesRateLimit.viajes?.windowMs ?? 60_000,
      limit: opcionesRateLimit.viajes?.limit ?? 30,
      mensaje: 'Se superó el límite de operaciones sobre viajes. Intente más tarde.',
    });

    app.use(
      '/auth',
      createAuthRouter({
        registrarUsuario: auth.registrarUsuario,
        iniciarSesion: auth.iniciarSesion,
        obtenerPerfilUsuario: auth.obtenerPerfilUsuario,
        autenticacionRequerida,
        limitadorLogin,
        limitadorRegistro,
      }),
    );

    app.use(
      '/usuarios',
      createUsuariosRouter({
        obtenerPerfilUsuario: auth.obtenerPerfilUsuario,
        actualizarPerfilUsuario: auth.actualizarPerfilUsuario,
        autenticacionRequerida,
      }),
    );

    if (viajes) {
      app.use(
        '/viajes',
        createViajesRouter({
          ...viajes,
          autenticacionRequerida,
          limitadorViajes,
        }),
      );
    }

    if (choferes) {
      app.use(
        '/choferes',
        createChoferesRouter({
          ...choferes,
          autenticacionRequerida,
        }),
      );
    }
  }

  app.use(notFoundHandler);
  app.use(createErrorHandler({ logger }));

  return app;
}
