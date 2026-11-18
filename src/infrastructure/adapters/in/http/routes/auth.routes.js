import { Router } from 'express';

import { asyncHandler } from '../async-handler.js';
import { esquemaLogin, esquemaRegistro } from '../schemas/auth.schemas.js';
import { validarCuerpo } from '../validation.js';

/**
 * Adaptador HTTP de autenticación. Traduce requests a casos de uso y respuestas
 * públicas; no contiene reglas de negocio.
 */
export function createAuthRouter({
  registrarUsuario,
  iniciarSesion,
  obtenerPerfilUsuario,
  autenticacionRequerida,
  limitadorLogin,
  limitadorRegistro,
}) {
  const router = Router();

  router.post(
    '/registro',
    limitadorRegistro,
    asyncHandler(async (req, res) => {
      const datos = validarCuerpo(esquemaRegistro, req.body);
      const usuario = await registrarUsuario(datos);

      res.status(201).json({ usuario: usuario.aVistaPublica() });
    }),
  );

  router.post(
    '/login',
    limitadorLogin,
    asyncHandler(async (req, res) => {
      const datos = validarCuerpo(esquemaLogin, req.body);
      const { token, expiraEn, usuario } = await iniciarSesion(datos);

      res.json({
        tipo: 'Bearer',
        token,
        expiraEn,
        usuario: usuario.aVistaPublica(),
      });
    }),
  );

  router.get(
    '/yo',
    autenticacionRequerida,
    asyncHandler(async (req, res) => {
      const usuario = await obtenerPerfilUsuario({
        usuarioId: req.autenticacion.usuarioId,
        solicitante: req.autenticacion,
      });

      res.json({ usuario: usuario.aVistaPublica() });
    }),
  );

  return router;
}
