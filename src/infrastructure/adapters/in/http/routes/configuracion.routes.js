import { Router } from 'express';

import { ROLES } from '../../../../../domain/entities/usuario.js';
import { asyncHandler } from '../async-handler.js';
import { crearAutorizacionPorRol } from '../middlewares/authorization.js';
import {
  esquemaActualizarRegla,
  esquemaActualizarTarifa,
  esquemaActualizarZona,
  esquemaCrearZona,
  esquemaPublicarRegla,
  esquemaRegla,
  esquemaTarifa,
} from '../schemas/configuracion.schemas.js';
import { validarCuerpo, validarIdentificador } from '../validation.js';

/**
 * Configuración administrativa. El middleware rechaza a quien no sea
 * ADMINISTRADOR y el caso de uso vuelve a comprobar el rol.
 */
export function createConfiguracionRouter({
  crearZona,
  actualizarZona,
  listarZonas,
  crearTarifa,
  editarTarifa,
  publicarTarifa,
  listarTarifas,
  crearRegla,
  editarRegla,
  publicarRegla,
  listarReglas,
  autenticacionRequerida,
  limitadorViajes,
}) {
  const router = Router();
  const soloAdministrador = crearAutorizacionPorRol(ROLES.ADMINISTRADOR);

  router.use(autenticacionRequerida, soloAdministrador);

  router.get(
    '/zonas',
    asyncHandler(async (req, res) => {
      res.json({ zonas: await listarZonas({ actor: actorDe(req) }) });
    }),
  );

  router.post(
    '/zonas',
    limitadorViajes,
    asyncHandler(async (req, res) => {
      const datos = validarCuerpo(esquemaCrearZona, req.body);
      res.status(201).json({ zona: await crearZona({ ...datos, actor: actorDe(req) }) });
    }),
  );

  router.patch(
    '/zonas/:id',
    limitadorViajes,
    asyncHandler(async (req, res) => {
      const datos = validarCuerpo(esquemaActualizarZona, req.body);
      const zona = await actualizarZona({
        ...datos,
        zonaId: validarIdentificador(req.params.id),
        actor: actorDe(req),
      });

      res.json({ zona });
    }),
  );

  router.get(
    '/tarifas',
    asyncHandler(async (req, res) => {
      res.json({ tarifas: await listarTarifas({ actor: actorDe(req) }) });
    }),
  );

  router.post(
    '/tarifas',
    limitadorViajes,
    asyncHandler(async (req, res) => {
      const datos = validarCuerpo(esquemaTarifa, req.body);
      res.status(201).json({ tarifa: await crearTarifa({ ...datos, actor: actorDe(req) }) });
    }),
  );

  router.patch(
    '/tarifas/:id',
    limitadorViajes,
    asyncHandler(async (req, res) => {
      const datos = validarCuerpo(esquemaActualizarTarifa, req.body);
      const tarifa = await editarTarifa({
        ...datos,
        tarifaId: validarIdentificador(req.params.id),
        actor: actorDe(req),
      });

      res.json({ tarifa });
    }),
  );

  router.post(
    '/tarifas/:id/publicar',
    limitadorViajes,
    asyncHandler(async (req, res) => {
      const tarifa = await publicarTarifa({
        tarifaId: validarIdentificador(req.params.id),
        actor: actorDe(req),
      });

      res.json({ tarifa });
    }),
  );

  router.get(
    '/reglas',
    asyncHandler(async (req, res) => {
      res.json({ reglas: await listarReglas({ actor: actorDe(req) }) });
    }),
  );

  router.post(
    '/reglas',
    limitadorViajes,
    asyncHandler(async (req, res) => {
      const datos = validarCuerpo(esquemaRegla, req.body);
      res.status(201).json({ regla: await crearRegla({ ...datos, actor: actorDe(req) }) });
    }),
  );

  router.patch(
    '/reglas/:id',
    limitadorViajes,
    asyncHandler(async (req, res) => {
      const datos = validarCuerpo(esquemaActualizarRegla, req.body);
      const regla = await editarRegla({
        ...datos,
        reglaId: validarIdentificador(req.params.id),
        actor: actorDe(req),
      });

      res.json({ regla });
    }),
  );

  router.post(
    '/reglas/:id/publicar',
    limitadorViajes,
    asyncHandler(async (req, res) => {
      const { motivo } = validarCuerpo(esquemaPublicarRegla, req.body ?? {});
      const regla = await publicarRegla({
        reglaId: validarIdentificador(req.params.id),
        motivo,
        actor: actorDe(req),
      });

      res.json({ regla });
    }),
  );

  return router;
}

function actorDe(req) {
  return { id: req.autenticacion.usuarioId, rol: req.autenticacion.rol };
}
