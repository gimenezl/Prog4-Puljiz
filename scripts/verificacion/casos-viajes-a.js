/**
 * Casos PM-03, PM-04 y PM-05: idempotencia de creación, aceptación y
 * autorización por recurso sobre viajes, usuarios y perfiles de chofer.
 */

import {
  DESTINO_ALTERNATIVO,
  aceptarViaje,
  cancelarViaje,
  crearViaje,
  perfilChofer,
  solicitarCrearViaje,
} from './flujos.js';
import { usuario } from './contexto.js';
import {
  afirmar,
  afirmarCodigo,
  afirmarEstado,
  afirmarIgual,
  claveDePrueba,
  evidencia,
} from './utilidades.js';

export const casosViajesA = [
  {
    id: 'PM-03',
    titulo: 'Creación idempotente de viaje y conflictos de clave',
    async ejecutar(contexto) {
      const clave = claveDePrueba(contexto, 'pm03-crear');
      const { respuesta: primera } = await solicitarCrearViaje(contexto, { clave });

      afirmarEstado(primera, 201, 'primera creación de viaje');
      afirmar(primera.datos?.viaje?.estado === 'SOLICITADO', 'El viaje no quedó SOLICITADO.');
      afirmar(
        Number.isInteger(primera.datos?.viaje?.precioFijadoCentavos) &&
          primera.datos.viaje.precioFijadoCentavos > 0,
        'El viaje no tiene un precio fijado positivo.',
      );
      afirmar(
        !primera.encabezados['idempotency-replayed'],
        'La primera creación no debe marcarse como replay.',
      );

      const viajeId = primera.datos.viaje.id;
      const precio = primera.datos.viaje.precioFijadoCentavos;
      evidencia(contexto, `POST /viajes -> 201, ${viajeId}, precio ${precio}`);

      const { respuesta: replay } = await solicitarCrearViaje(contexto, { clave });
      afirmarEstado(replay, 200, 'replay de creación');
      afirmar(
        replay.encabezados['idempotency-replayed'] === 'true',
        'El replay no devolvió Idempotency-Replayed: true.',
      );
      afirmar(
        replay.datos?.viaje?.id === viajeId,
        'El replay devolvió un viaje distinto al original.',
      );
      evidencia(contexto, 'Replay con la misma clave -> 200, mismo viaje, cabecera de replay');

      const { respuesta: conflicto } = await solicitarCrearViaje(contexto, {
        clave,
        destino: DESTINO_ALTERNATIVO,
      });
      afirmarEstado(conflicto, 409, 'misma clave con otro contenido');
      afirmarCodigo(
        conflicto,
        'CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO',
        'conflicto de contenido de idempotencia',
      );

      const pasajero = usuario(contexto, 'pasajero');
      const sinClave = await contexto.solicitar('/viajes', {
        metodo: 'POST',
        token: pasajero.token,
        cuerpo: {
          origen: { lat: -34.6037, lng: -58.3816 },
          destino: { lat: -34.6083, lng: -58.3712 },
        },
      });
      afirmarEstado(sinClave, 400, 'creación sin Idempotency-Key');
      afirmarCodigo(sinClave, 'CLAVE_DE_IDEMPOTENCIA_REQUERIDA', 'creación sin clave');

      const claveConcurrente = claveDePrueba(contexto, 'pm03-concurrente');
      const [a, b] = await Promise.all([
        solicitarCrearViaje(contexto, { clave: claveConcurrente }),
        solicitarCrearViaje(contexto, { clave: claveConcurrente }),
      ]);

      afirmar(
        [a.respuesta.estado, b.respuesta.estado].every(
          (estado) => estado === 200 || estado === 201,
        ),
        `La creación concurrente devolvió estados inesperados: ${a.respuesta.estado}/${b.respuesta.estado}.`,
      );
      afirmar(
        a.respuesta.datos?.viaje?.id === b.respuesta.datos?.viaje?.id,
        'La creación concurrente generó dos viajes distintos.',
      );
      afirmarIgual(
        [a.respuesta, b.respuesta].filter(
          (respuesta) => respuesta.encabezados['idempotency-replayed'] === 'true',
        ).length,
        1,
        'La creación concurrente debe tener exactamente un replay',
      );
      evidencia(contexto, 'Dos creaciones simultáneas con la misma clave -> un solo viaje');
    },
  },
  {
    id: 'PM-04',
    titulo: 'Aceptación del viaje y estado del chofer',
    async ejecutar(contexto) {
      const chofer1 = usuario(contexto, 'chofer1');
      const chofer2 = usuario(contexto, 'chofer2');
      const { id } = await crearViaje(contexto);

      const antes = await contexto.solicitar('/viajes/disponibles', { token: chofer2.token });
      afirmarEstado(antes, 200, 'listar viajes disponibles antes de aceptar');
      afirmar(
        antes.datos.viajes.some((viaje) => viaje.id === id),
        'El viaje solicitado no aparece en la lista del chofer.',
      );

      const asignado = await aceptarViaje(contexto, id, 'chofer1');
      afirmar(asignado.estado === 'ASIGNADO', 'El viaje no quedó ASIGNADO.');
      afirmar(asignado.choferId === chofer1.id, 'El viaje quedó asignado a otro chofer.');

      const perfil = await perfilChofer(contexto, 'chofer1');
      afirmar(perfil.estado === 'OCUPADO', 'El chofer no quedó OCUPADO.');
      afirmar(perfil.viajeActivoId === id, 'El chofer no registra el viaje activo.');

      const despues = await contexto.solicitar('/viajes/disponibles', { token: chofer2.token });
      afirmarEstado(despues, 200, 'listar viajes disponibles después de aceptar');
      afirmar(
        !despues.datos.viajes.some((viaje) => viaje.id === id),
        'El viaje aceptado sigue apareciendo como disponible.',
      );

      const ajeno = await contexto.solicitar(`/viajes/${id}/aceptar`, {
        metodo: 'POST',
        token: chofer2.token,
      });
      afirmarEstado(ajeno, 409, 'segundo chofer intenta aceptar el mismo viaje');
      afirmarCodigo(ajeno, 'VIAJE_NO_DISPONIBLE', 'viaje ya asignado');

      const cancelado = await cancelarViaje(contexto, id);
      afirmar(
        cancelado.estado === 'CANCELADO_POR_PASAJERO',
        'El viaje no quedó cancelado por el pasajero.',
      );

      const liberado = await perfilChofer(contexto, 'chofer1');
      afirmar(liberado.estado === 'DISPONIBLE', 'El chofer no volvió a DISPONIBLE.');
      afirmar(liberado.viajeActivoId === null, 'El chofer conserva un viaje activo.');

      evidencia(contexto, 'Aceptar -> ASIGNADO/OCUPADO; cancelar -> chofer liberado');
    },
  },
  {
    id: 'PM-05',
    titulo: 'Autorización por recurso y por rol',
    async ejecutar(contexto) {
      const pasajero = usuario(contexto, 'pasajero');
      const chofer1 = usuario(contexto, 'chofer1');
      const chofer2 = usuario(contexto, 'chofer2');
      const { id } = await crearViaje(contexto);

      await aceptarViaje(contexto, id, 'chofer1');

      const matrizViaje = [
        ['pasajero', 200],
        ['chofer1', 200],
        ['pasajero2', 403],
        ['chofer2', 403],
        ['admin', 200],
        ['soporte', 200],
      ];

      for (const [clave, esperado] of matrizViaje) {
        const respuesta = await contexto.solicitar(`/viajes/${id}`, {
          token: usuario(contexto, clave).token,
        });
        afirmarEstado(respuesta, esperado, `GET viaje como ${clave}`);

        if (esperado === 403) {
          afirmarCodigo(respuesta, 'NO_AUTORIZADO', `GET viaje como ${clave}`);
        }
      }

      evidencia(contexto, 'GET viaje: dueño/chofer/admin/soporte 200; ajenos 403');

      const aceptarProhibido = await contexto.solicitar(`/viajes/${id}/aceptar`, {
        metodo: 'POST',
        token: pasajero.token,
      });
      afirmarEstado(aceptarProhibido, 403, 'pasajero intenta aceptar un viaje');
      afirmarCodigo(aceptarProhibido, 'NO_AUTORIZADO', 'pasajero acepta viaje');

      const aceptarAdmin = await contexto.solicitar(`/viajes/${id}/aceptar`, {
        metodo: 'POST',
        token: usuario(contexto, 'admin').token,
      });
      afirmarEstado(aceptarAdmin, 403, 'administrador intenta aceptar un viaje');

      const finalizarAjeno = await contexto.solicitar(`/viajes/${id}/finalizar`, {
        metodo: 'POST',
        token: chofer2.token,
        headers: { 'idempotency-key': claveDePrueba(contexto, 'pm05-final-ajeno') },
      });
      afirmarEstado(finalizarAjeno, 403, 'chofer ajeno intenta finalizar');
      afirmarCodigo(finalizarAjeno, 'NO_AUTORIZADO', 'finalización por chofer ajeno');

      const matrizCancelar = ['chofer1', 'pasajero2', 'admin', 'soporte'];

      for (const clave of matrizCancelar) {
        const respuesta = await contexto.solicitar(`/viajes/${id}/cancelar`, {
          metodo: 'POST',
          token: usuario(contexto, clave).token,
          cuerpo: { motivo: 'Intento no autorizado' },
        });
        afirmarEstado(respuesta, 403, `cancelar como ${clave}`);
        afirmarCodigo(respuesta, 'NO_AUTORIZADO', `cancelar como ${clave}`);
      }

      evidencia(contexto, 'Cancelar: solo el pasajero dueño; resto 403');

      for (const [clave, esperado] of [
        ['pasajero', 200],
        ['pasajero2', 403],
        ['chofer1', 403],
        ['admin', 200],
        ['soporte', 403],
      ]) {
        const respuesta = await contexto.solicitar(`/usuarios/${pasajero.id}`, {
          token: usuario(contexto, clave).token,
        });
        afirmarEstado(respuesta, esperado, `GET usuario como ${clave}`);
      }

      const patchAjeno = await contexto.solicitar(`/usuarios/${pasajero.id}`, {
        metodo: 'PATCH',
        token: usuario(contexto, 'admin').token,
        cuerpo: { nombre: 'Admin no edita' },
      });
      afirmarEstado(patchAjeno, 403, 'administrador edita un perfil ajeno');
      afirmarCodigo(patchAjeno, 'NO_AUTORIZADO', 'PATCH ajeno por administrador');
      evidencia(contexto, 'GET usuario: dueño/admin 200; PATCH ajeno 403');

      for (const [clave, esperado] of [
        ['chofer1', 200],
        ['chofer2', 200],
        ['pasajero', 403],
        ['admin', 403],
        ['soporte', 403],
      ]) {
        const respuesta = await contexto.solicitar('/choferes/yo', {
          token: usuario(contexto, clave).token,
        });
        afirmarEstado(respuesta, esperado, `GET /choferes/yo como ${clave}`);
      }

      const habilitarChofer = await contexto.solicitar(`/choferes/${chofer2.id}/habilitacion`, {
        metodo: 'PATCH',
        token: chofer1.token,
        cuerpo: { habilitado: true },
      });
      afirmarEstado(habilitarChofer, 403, 'chofer intenta habilitar a otro chofer');
      afirmarCodigo(habilitarChofer, 'NO_AUTORIZADO', 'habilitación por chofer');

      const habilitarAdmin = await contexto.solicitar(`/choferes/${chofer2.id}/habilitacion`, {
        metodo: 'PATCH',
        token: usuario(contexto, 'admin').token,
        cuerpo: { habilitado: true },
      });
      afirmarEstado(habilitarAdmin, 200, 'administrador habilita a un chofer');
      afirmar(
        habilitarAdmin.datos?.chofer?.habilitado === true,
        'La habilitación no quedó aplicada.',
      );
      evidencia(contexto, 'Perfil de chofer: propio 200; admin habilita 200; resto 403');

      const cancelado = await cancelarViaje(contexto, id);
      afirmar(cancelado.estado === 'CANCELADO_POR_PASAJERO', 'No se canceló el viaje de prueba.');
    },
  },
];
