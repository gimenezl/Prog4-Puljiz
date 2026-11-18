import { Router } from 'express';

import { ROLES } from '../../../../../domain/entities/usuario.js';
import { asyncHandler } from '../async-handler.js';
import { crearAutorizacionPorRol } from '../middlewares/authorization.js';
import { esquemaCancelarViaje, esquemaCrearViaje } from '../schemas/viajes.schemas.js';
import { validarCuerpo, validarIdentificador } from '../validation.js';

/**
 * Rutas de viajes. El controlador solo traduce HTTP: la autorización por
 * recurso, el precio y las transiciones viven en los casos de uso.
 */
export function createViajesRouter({
  crearViaje,
  aceptarViaje,
  cancelarViaje,
  finalizarViaje,
  obtenerViaje,
  obtenerCobro,
  listarViajesDisponibles,
  autenticacionRequerida,
  limitadorViajes,
}) {
  const router = Router();
  const soloPasajero = crearAutorizacionPorRol(ROLES.PASAJERO);
  const soloChofer = crearAutorizacionPorRol(ROLES.CHOFER);

  router.use(autenticacionRequerida);

  router.post(
    '/',
    limitadorViajes,
    soloPasajero,
    asyncHandler(async (req, res) => {
      const { origen, destino } = validarCuerpo(esquemaCrearViaje, req.body);
      const { viaje, reutilizada } = await crearViaje({
        pasajeroId: req.autenticacion.usuarioId,
        origen,
        destino,
        claveIdempotencia: req.get('idempotency-key'),
      });

      if (reutilizada) {
        res.set('Idempotency-Replayed', 'true');
      }

      res.status(reutilizada ? 200 : 201).json({ viaje });
    }),
  );

  router.get(
    '/disponibles',
    soloChofer,
    asyncHandler(async (req, res) => {
      const viajes = await listarViajesDisponibles({
        choferId: req.autenticacion.usuarioId,
      });

      res.json({ viajes: viajes.map((viaje) => viaje.aVistaPublica()) });
    }),
  );

  router.get(
    '/:id/cobro',
    asyncHandler(async (req, res) => {
      const viajeId = validarIdentificador(req.params.id);
      const cobro = await obtenerCobro({
        viajeId,
        solicitante: req.autenticacion,
      });

      res.json({ cobro: cobro.aVistaPublica() });
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const viajeId = validarIdentificador(req.params.id);
      const viaje = await obtenerViaje({
        viajeId,
        solicitante: req.autenticacion,
      });

      res.json({ viaje: viaje.aVistaPublica() });
    }),
  );

  router.post(
    '/:id/aceptar',
    limitadorViajes,
    soloChofer,
    asyncHandler(async (req, res) => {
      const viajeId = validarIdentificador(req.params.id);
      const viaje = await aceptarViaje({
        viajeId,
        choferId: req.autenticacion.usuarioId,
      });

      res.json({ viaje: viaje.aVistaPublica() });
    }),
  );

  router.post(
    '/:id/finalizar',
    limitadorViajes,
    soloChofer,
    asyncHandler(async (req, res) => {
      const viajeId = validarIdentificador(req.params.id);
      const { viaje, cobro, reutilizada } = await finalizarViaje({
        viajeId,
        choferId: req.autenticacion.usuarioId,
        claveIdempotencia: req.get('idempotency-key'),
      });

      if (reutilizada) {
        res.set('Idempotency-Replayed', 'true');
      }

      res.json({ viaje, cobro });
    }),
  );

  router.post(
    '/:id/cancelar',
    limitadorViajes,
    soloPasajero,
    asyncHandler(async (req, res) => {
      const viajeId = validarIdentificador(req.params.id);
      const { motivo } = validarCuerpo(esquemaCancelarViaje, req.body);
      const viaje = await cancelarViaje({
        viajeId,
        pasajeroId: req.autenticacion.usuarioId,
        motivo,
      });

      res.json({ viaje: viaje.aVistaPublica() });
    }),
  );

  return router;
}
