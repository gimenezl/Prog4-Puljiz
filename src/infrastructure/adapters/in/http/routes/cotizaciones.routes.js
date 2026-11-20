import { Router } from 'express';

import { ROLES } from '../../../../../domain/entities/usuario.js';
import { asyncHandler } from '../async-handler.js';
import { crearAutorizacionPorRol } from '../middlewares/authorization.js';
import { esquemaCotizar } from '../schemas/cotizaciones.schemas.js';
import { validarCuerpo, validarIdentificador } from '../validation.js';

/** Rutas de cotización: el precio siempre lo calcula el servidor. */
export function createCotizacionesRouter({
  cotizar,
  confirmarCotizacion,
  obtenerCotizacion,
  listarCotizaciones,
  autenticacionRequerida,
  limitadorViajes,
}) {
  const router = Router();
  const soloPasajero = crearAutorizacionPorRol(ROLES.PASAJERO);

  router.use(autenticacionRequerida);

  router.post(
    '/',
    limitadorViajes,
    soloPasajero,
    asyncHandler(async (req, res) => {
      const { origen, destino } = validarCuerpo(esquemaCotizar, req.body);
      const cotizacion = await cotizar({
        pasajeroId: req.autenticacion.usuarioId,
        origen,
        destino,
      });

      res.status(201).json({ cotizacion });
    }),
  );

  router.get(
    '/',
    soloPasajero,
    asyncHandler(async (req, res) => {
      const cotizaciones = await listarCotizaciones({
        pasajeroId: req.autenticacion.usuarioId,
        actor: actorDe(req),
      });

      res.json({ cotizaciones });
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const cotizacion = await obtenerCotizacion({
        cotizacionId: validarIdentificador(req.params.id),
        actor: actorDe(req),
      });

      res.json({ cotizacion });
    }),
  );

  router.post(
    '/:id/confirmar',
    limitadorViajes,
    soloPasajero,
    asyncHandler(async (req, res) => {
      const { viaje, reutilizada } = await confirmarCotizacion({
        cotizacionId: validarIdentificador(req.params.id),
        pasajeroId: req.autenticacion.usuarioId,
        claveIdempotencia: req.get('idempotency-key'),
      });

      if (reutilizada) res.set('Idempotency-Replayed', 'true');

      res.status(reutilizada ? 200 : 201).json({ viaje });
    }),
  );

  return router;
}

function actorDe(req) {
  return { id: req.autenticacion.usuarioId, rol: req.autenticacion.rol };
}
