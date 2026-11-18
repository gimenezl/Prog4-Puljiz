/**
 * Casos PM-01, PM-02, PM-15 y PM-16: salud, autenticación, hardening HTTP y
 * apagado ordenado con una conexión keep-alive abierta.
 */

import http from 'node:http';

import {
  closeHttpServer,
  startHttpServer,
} from '../../src/infrastructure/lifecycle/http-server.js';
import { createShutdownHandler } from '../../src/infrastructure/lifecycle/shutdown.js';
import { afirmar, afirmarCodigo, afirmarEstado, afirmarIgual, evidencia } from './utilidades.js';
import { usuario } from './contexto.js';

const UUID_INEXISTENTE = '11111111-1111-4111-8111-111111111111';

export const casosBasicos = [
  {
    id: 'PM-01',
    titulo: 'Salud y readiness',
    async ejecutar(contexto) {
      const salud = await contexto.solicitar('/health');
      afirmarEstado(salud, 200, 'GET /health');
      afirmar(salud.datos?.estado === 'ok', 'La liveness no devolvió estado ok.');
      afirmar(salud.datos?.tipo === 'liveness', 'La liveness no se identificó como tal.');
      afirmar(
        salud.encabezados['x-request-id'],
        'La respuesta de /health no incluye x-request-id.',
      );
      evidencia(contexto, 'GET /health -> 200, estado ok, x-request-id presente');

      const listo = await contexto.solicitar('/ready');
      afirmarEstado(listo, 200, 'GET /ready');
      afirmar(listo.datos?.estado === 'listo', 'El readiness no devolvió estado listo.');
      afirmar(listo.datos?.tipo === 'readiness', 'El readiness no se identificó como tal.');

      const chequeos = Object.entries(listo.datos?.chequeos ?? {});
      afirmar(chequeos.length >= 6, 'El readiness no informó todos los chequeos esperados.');

      for (const [nombre, chequeo] of chequeos) {
        afirmar(chequeo?.ok === true, `El chequeo de readiness "${nombre}" no está ok.`);
      }

      evidencia(contexto, `GET /ready -> 200, ${chequeos.length} chequeos ok`);
    },
  },
  {
    id: 'PM-02',
    titulo: 'Registro, login, perfil y autorización por recurso',
    async ejecutar(contexto) {
      const nuevoEmail = `verif-${contexto.sufijo}-nuevo@prog4.test`;
      const registro = await contexto.solicitar('/auth/registro', {
        metodo: 'POST',
        cuerpo: {
          email: nuevoEmail,
          nombre: 'Usuario Nuevo',
          contrasena: contexto.password,
          rol: 'PASAJERO',
        },
      });

      afirmarEstado(registro, 201, 'registro de usuario nuevo');
      afirmar(registro.datos?.usuario?.id, 'El registro no devolvió el identificador.');
      afirmar(
        !Object.hasOwn(registro.datos.usuario, 'credencial'),
        'El registro expuso la credencial del usuario.',
      );
      evidencia(contexto, `POST /auth/registro -> 201, usuario ${registro.datos.usuario.id}`);

      const loginNuevo = await contexto.solicitar('/auth/login', {
        metodo: 'POST',
        cuerpo: { email: nuevoEmail, contrasena: contexto.password },
      });
      afirmarEstado(loginNuevo, 200, 'login del usuario nuevo');
      afirmar(loginNuevo.datos?.token, 'El login no devolvió token.');
      afirmar(loginNuevo.datos?.tipo === 'Bearer', 'El login no devolvió tipo Bearer.');
      evidencia(contexto, 'POST /auth/login (cuenta nueva) -> 200 con token Bearer');

      const pasajero = usuario(contexto, 'pasajero');
      const duplicado = await contexto.solicitar('/auth/registro', {
        metodo: 'POST',
        cuerpo: {
          email: pasajero.email,
          nombre: 'Duplicado',
          contrasena: contexto.password,
          rol: 'PASAJERO',
        },
      });
      afirmarEstado(duplicado, 409, 'registro con email duplicado');
      afirmarCodigo(duplicado, 'EMAIL_YA_REGISTRADO', 'email duplicado');

      const invalido = await contexto.solicitar('/auth/registro', {
        metodo: 'POST',
        cuerpo: {
          email: `verif-${contexto.sufijo}-corto@prog4.test`,
          nombre: 'Corto',
          contrasena: 'corta',
          rol: 'PASAJERO',
        },
      });
      afirmarEstado(invalido, 400, 'registro con contraseña inválida');
      afirmarCodigo(invalido, 'DATOS_INVALIDOS', 'contraseña inválida');

      const loginMalo = await contexto.solicitar('/auth/login', {
        metodo: 'POST',
        cuerpo: { email: pasajero.email, contrasena: 'Incorrecta123' },
      });
      afirmarEstado(loginMalo, 401, 'login con contraseña incorrecta');
      afirmarCodigo(loginMalo, 'CREDENCIALES_INVALIDAS', 'login incorrecto');

      const sinToken = await contexto.solicitar('/auth/yo');
      afirmarEstado(sinToken, 401, 'perfil sin token');
      afirmarCodigo(sinToken, 'NO_AUTENTICADO', 'perfil sin token');

      const propio = await contexto.solicitar('/auth/yo', { token: pasajero.token });
      afirmarEstado(propio, 200, 'perfil con token');
      afirmar(propio.datos?.usuario?.id === pasajero.id, 'El perfil devolvió otro usuario.');

      const registroId = registro.datos.usuario.id;
      const actualizado = await contexto.solicitar(`/usuarios/${registroId}`, {
        metodo: 'PATCH',
        token: loginNuevo.datos.token,
        cuerpo: { nombre: 'Usuario Actualizado' },
      });
      afirmarEstado(actualizado, 200, 'PATCH del perfil propio');
      afirmar(
        actualizado.datos?.usuario?.nombre === 'Usuario Actualizado',
        'El PATCH no actualizó el nombre.',
      );

      const ajeno = await contexto.solicitar(`/usuarios/${registroId}`, {
        token: usuario(contexto, 'pasajero2').token,
      });
      afirmarEstado(ajeno, 403, 'GET de un usuario ajeno');
      afirmarCodigo(ajeno, 'NO_AUTORIZADO', 'GET de un usuario ajeno');

      const admin = await contexto.solicitar(`/usuarios/${registroId}`, {
        token: usuario(contexto, 'admin').token,
      });
      afirmarEstado(admin, 200, 'GET de un usuario por administrador');

      const patchAdmin = await contexto.solicitar(`/usuarios/${registroId}`, {
        metodo: 'PATCH',
        token: usuario(contexto, 'admin').token,
        cuerpo: { nombre: 'Cambio Indebido' },
      });
      afirmarEstado(patchAdmin, 403, 'PATCH ajeno por administrador');
      afirmarCodigo(patchAdmin, 'NO_AUTORIZADO', 'PATCH ajeno por administrador');

      evidencia(contexto, 'Matriz de perfil: dueño 200, ajeno 403, admin 200/403');
    },
  },
  {
    id: 'PM-15',
    titulo: 'Trazabilidad, headers de seguridad y límites de cuerpo',
    async ejecutar(contexto) {
      const requestId = `verif-${contexto.sufijo}-trace`;
      const inexistente = await contexto.solicitar(`/no-existe-${UUID_INEXISTENTE}`, {
        headers: { 'x-request-id': requestId },
      });

      afirmarEstado(inexistente, 404, 'recurso inexistente');
      afirmarCodigo(inexistente, 'RECURSO_NO_ENCONTRADO', 'recurso inexistente');
      afirmar(
        inexistente.datos?.requestId === requestId,
        'El cuerpo del 404 no conservó el requestId enviado.',
      );
      afirmar(
        inexistente.encabezados['x-request-id'] === requestId,
        'El header x-request-id no conservó el identificador enviado.',
      );
      evidencia(contexto, `x-request-id ${requestId} presente en header y cuerpo 404`);

      const salud = await contexto.solicitar('/health');
      afirmar(
        Boolean(salud.encabezados['content-security-policy']),
        'Falta Content-Security-Policy.',
      );
      afirmar(
        salud.encabezados['x-content-type-options'] === 'nosniff',
        'Falta X-Content-Type-Options: nosniff.',
      );
      afirmar(Boolean(salud.encabezados['x-frame-options']), 'Falta X-Frame-Options.');
      afirmar(!salud.encabezados['x-powered-by'], 'La respuesta expone X-Powered-By.');
      afirmar(
        salud.encabezados['access-control-allow-origin'] === '*',
        'CORS no devolvió Access-Control-Allow-Origin: *.',
      );
      evidencia(contexto, 'Helmet y CORS presentes; X-Powered-By ausente');

      const cuerpoGrande = JSON.stringify({
        email: `${'a'.repeat(120_000)}@prog4.test`,
        nombre: 'Grande',
        contrasena: contexto.password,
        rol: 'PASAJERO',
      });
      const demasiadoGrande = await contexto.solicitar('/auth/registro', {
        metodo: 'POST',
        texto: cuerpoGrande,
      });
      afirmarEstado(demasiadoGrande, 413, 'cuerpo mayor al límite');
      afirmarCodigo(demasiadoGrande, 'CUERPO_DEMASIADO_GRANDE', 'cuerpo demasiado grande');

      const jsonMalo = await contexto.solicitar('/auth/login', {
        metodo: 'POST',
        texto: '{"email":',
      });
      afirmarEstado(jsonMalo, 400, 'JSON malformado');
      afirmarCodigo(jsonMalo, 'CUERPO_INVALIDO', 'JSON malformado');

      evidencia(contexto, '413 CUERPO_DEMASIADO_GRANDE y 400 CUERPO_INVALIDO verificados');
    },
  },
  {
    id: 'PM-16',
    titulo: 'Apagado ordenado con conexión keep-alive e idempotencia',
    async ejecutar(contexto) {
      const servidor = await startHttpServer({
        app: contexto.dependencias.app,
        host: '127.0.0.1',
        port: 0,
        logger: contexto.dependencias.logger,
      });
      const puerto = servidor.address().port;
      const agente = new http.Agent({ keepAlive: true });
      let recursosCerrados = 0;

      try {
        await new Promise((resolver, rechazar) => {
          const pedido = http.get(
            { host: '127.0.0.1', port: puerto, path: '/health', agent: agente },
            (respuesta) => {
              respuesta.resume();
              respuesta.on('end', resolver);
            },
          );

          pedido.on('error', rechazar);
        });

        const cerrar = createShutdownHandler({
          servidor,
          cerrarRecursos: async () => {
            recursosCerrados += 1;
          },
          logger: contexto.dependencias.logger,
          timeoutMs: 8000,
        });

        const inicio = Date.now();
        const primera = cerrar('SIGTERM');
        const segunda = cerrar('SIGINT');

        afirmar(primera === segunda, 'Dos señales de cierre no reutilizaron la misma promesa.');

        await primera;
        const duracionMs = Date.now() - inicio;

        afirmar(!servidor.listening, 'El servidor sigue escuchando después del cierre.');
        afirmarIgual(recursosCerrados, 1, 'Los recursos externos deben cerrarse una sola vez');
        afirmar(
          duracionMs < 3000,
          `El cierre con keep-alive tardó ${duracionMs} ms (se esperaban menos de 3000 ms).`,
        );

        evidencia(
          contexto,
          `SIGTERM con socket keep-alive -> cierre en ${duracionMs} ms, recursos=1`,
        );
      } finally {
        agente.destroy();

        if (servidor.listening) {
          await closeHttpServer(servidor);
        }
      }
    },
  },
];
