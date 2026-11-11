import { Router } from 'express';

import { ROLES } from '../../../../../domain/entities/usuario.js';
import { asyncHandler } from '../async-handler.js';
import { crearAutorizacionPorRol } from '../middlewares/authorization.js';
import {
  esquemaDisponibilidadChofer,
  esquemaHabilitacionChofer,
} from '../schemas/viajes.schemas.js';
import { validarCuerpo, validarIdentificador } from '../validation.js';

/**
 * Rutas del perfil operativo del chofer.
 */
export function createChoferesRouter({
  obtenerPerfilChofer,
  actualizarDisponibilidadChofer,
  habilitarChofer,
  autenticacionRequerida,
}) {
  const router = Router();
  const soloChofer = crearAutorizacionPorRol(ROLES.CHOFER);
  const soloAdministrador = crearAutorizacionPorRol(ROLES.ADMINISTRADOR);

  router.use(autenticacionRequerida);

  router.get(
    '/yo',
    soloChofer,
    asyncHandler(async (req, res) => {
      const chofer = await obtenerPerfilChofer({
        usuarioId: req.autenticacion.usuarioId,
        solicitante: req.autenticacion,
      });

      res.json({ chofer: chofer.aVistaPublica() });
    }),
  );

  router.patch(
    '/yo',
    soloChofer,
    asyncHandler(async (req, res) => {
      const { disponible } = validarCuerpo(esquemaDisponibilidadChofer, req.body);
      const chofer = await actualizarDisponibilidadChofer({
        usuarioId: req.autenticacion.usuarioId,
        solicitante: req.autenticacion,
        disponible,
      });

      res.json({ chofer: chofer.aVistaPublica() });
    }),
  );

  router.patch(
    '/:usuarioId/habilitacion',
    soloAdministrador,
    asyncHandler(async (req, res) => {
      const usuarioId = validarIdentificador(req.params.usuarioId);
      const { habilitado } = validarCuerpo(esquemaHabilitacionChofer, req.body);
      const chofer = await habilitarChofer({
        usuarioId,
        solicitante: req.autenticacion,
        habilitado,
      });

      res.json({ chofer: chofer.aVistaPublica() });
    }),
  );

  return router;
}
