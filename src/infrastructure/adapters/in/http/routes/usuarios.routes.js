import { Router } from 'express';

import { asyncHandler } from '../async-handler.js';
import { esquemaActualizarPerfil } from '../schemas/auth.schemas.js';
import { validarCuerpo, validarIdentificador } from '../validation.js';

/**
 * Rutas de usuarios. Toda la autorización por recurso se resuelve en los casos
 * de uso: el controlador solo pasa la identidad autenticada.
 */
export function createUsuariosRouter({
  obtenerPerfilUsuario,
  actualizarPerfilUsuario,
  autenticacionRequerida,
}) {
  const router = Router();

  router.use(autenticacionRequerida);

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const usuarioId = validarIdentificador(req.params.id);
      const usuario = await obtenerPerfilUsuario({
        usuarioId,
        solicitante: req.autenticacion,
      });

      res.json({ usuario: usuario.aVistaPublica() });
    }),
  );

  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      const usuarioId = validarIdentificador(req.params.id);
      const { nombre } = validarCuerpo(esquemaActualizarPerfil, req.body);
      const usuario = await actualizarPerfilUsuario({
        usuarioId,
        solicitante: req.autenticacion,
        nombre,
      });

      res.json({ usuario: usuario.aVistaPublica() });
    }),
  );

  return router;
}
