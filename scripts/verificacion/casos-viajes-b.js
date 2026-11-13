/**
 * Casos PM-06 a PM-09: finalización atómica, cobro simulado, replay,
 * conflictos de idempotencia y autorización del cobro.
 */

import { aceptarViaje, crearViaje, finalizarViaje } from './flujos.js';
import { usuario } from './contexto.js';
import {
  afirmar,
  afirmarCodigo,
  afirmarEstado,
  afirmarIgual,
  claveDePrueba,
  evidencia,
} from './utilidades.js';

function cantidadDeCobrosSimulados(contexto) {
  const cantidad = contexto.dependencias.simuladorDeCobro?.cantidadLlamadas;
  return typeof cantidad === 'number' ? cantidad : null;
}

export const casosViajesB = [
  {
    id: 'PM-06',
    titulo: 'Finalizar viaje, cobrar y liberar al chofer',
    async ejecutar(contexto) {
      const antes = cantidadDeCobrosSimulados(contexto);
      const { id, viaje } = await crearViaje(contexto);

      await aceptarViaje(contexto, id, 'chofer1');
      const {
        respuesta,
        viaje: finalizado,
        cobro,
      } = await finalizarViaje(contexto, id, {
        clave: claveDePrueba(contexto, 'pm06-final'),
      });

      afirmarEstado(respuesta, 200, 'finalizar y cobrar');
      afirmar(finalizado.estado === 'FINALIZADO', 'El viaje no quedó FINALIZADO.');
      afirmar(finalizado.cerradoEn !== null, 'El viaje finalizado no tiene cerradoEn.');
      afirmar(finalizado.id === id, 'La finalización devolvió otro viaje.');
      afirmar(cobro.estado === 'COBRADO', 'El cobro no quedó COBRADO.');
      afirmar(cobro.viajeId === id, 'El cobro pertenece a otro viaje.');
      afirmar(
        cobro.montoCentavos === viaje.precioFijadoCentavos,
        'El monto cobrado no coincide con el precio fijado.',
      );
      afirmar(cobro.referencia === `SIM-${id}`, 'La referencia del cobro no es determinista.');
      afirmar(cobro.cobradoEn !== null, 'El cobro no tiene fecha de cobro.');
      afirmar(
        !respuesta.encabezados['idempotency-replayed'],
        'La primera finalización no debe marcarse como replay.',
      );

      const despues = cantidadDeCobrosSimulados(contexto);

      if (antes !== null && despues !== null) {
        afirmarIgual(despues, antes + 1, 'El simulador debe ejecutarse una sola vez');
      }

      const perfil = await contexto.solicitar('/choferes/yo', {
        token: usuario(contexto, 'chofer1').token,
      });
      afirmarEstado(perfil, 200, 'perfil del chofer después de finalizar');
      afirmar(perfil.datos.chofer.estado === 'DISPONIBLE', 'El chofer no volvió a DISPONIBLE.');
      afirmar(
        perfil.datos.chofer.viajeActivoId === null,
        'El chofer conserva el viaje activo después de finalizar.',
      );

      const consulta = await contexto.solicitar(`/viajes/${id}/cobro`, {
        token: usuario(contexto, 'pasajero').token,
      });
      afirmarEstado(consulta, 200, 'consultar cobro como pasajero');
      afirmar(consulta.datos.cobro.id === cobro.id, 'La consulta devolvió otro cobro.');
      afirmar(
        consulta.datos.cobro.referencia === `SIM-${id}`,
        'La consulta devolvió otra referencia.',
      );

      evidencia(
        contexto,
        `Cobro ${cobro.id}: ${cobro.montoCentavos} centavos, ${cobro.referencia}`,
      );
    },
  },
  {
    id: 'PM-07',
    titulo: 'Replay de la finalización sin un segundo cobro',
    async ejecutar(contexto) {
      const { id } = await crearViaje(contexto);
      await aceptarViaje(contexto, id, 'chofer1');
      const clave = claveDePrueba(contexto, 'pm07-final');
      const primera = await finalizarViaje(contexto, id, { clave });
      const antesDelReplay = cantidadDeCobrosSimulados(contexto);

      const segunda = await finalizarViaje(contexto, id, { clave });

      afirmarEstado(segunda.respuesta, 200, 'replay de finalización');
      afirmar(
        segunda.respuesta.encabezados['idempotency-replayed'] === 'true',
        'El replay de finalización no devolvió Idempotency-Replayed: true.',
      );
      afirmar(segunda.cobro.id === primera.cobro.id, 'El replay devolvió otro cobro.');
      afirmar(segunda.viaje.id === id, 'El replay devolvió otro viaje.');

      const despuesDelReplay = cantidadDeCobrosSimulados(contexto);

      if (antesDelReplay !== null && despuesDelReplay !== null) {
        afirmarIgual(
          despuesDelReplay,
          antesDelReplay,
          'El replay no debe ejecutar otra vez el simulador',
        );
      }

      const viaje = await contexto.solicitar(`/viajes/${id}`, {
        token: usuario(contexto, 'pasajero').token,
      });
      afirmarEstado(viaje, 200, 'consultar viaje después del replay');
      afirmar(viaje.datos.viaje.estado === 'FINALIZADO', 'El viaje perdió el estado final.');

      evidencia(contexto, `Replay de ${clave} -> mismo cobro ${primera.cobro.id}, sin recobro`);
    },
  },
  {
    id: 'PM-08',
    titulo: 'Conflictos de idempotencia y unicidad del cobro',
    async ejecutar(contexto) {
      const pasajero = usuario(contexto, 'pasajero');
      const antesTotales = cantidadDeCobrosSimulados(contexto);
      const claveA = claveDePrueba(contexto, 'pm08-a');
      const claveB = claveDePrueba(contexto, 'pm08-b');
      const claveC = claveDePrueba(contexto, 'pm08-c');

      const viajeA = await crearViaje(contexto);
      await aceptarViaje(contexto, viajeA.id, 'chofer1');
      await finalizarViaje(contexto, viajeA.id, { clave: claveA });

      const otraClave = await contexto.solicitar(`/viajes/${viajeA.id}/finalizar`, {
        metodo: 'POST',
        token: usuario(contexto, 'chofer1').token,
        headers: { 'idempotency-key': claveDePrueba(contexto, 'pm08-otra') },
      });
      afirmarEstado(otraClave, 409, 'finalizar un viaje ya finalizado con otra clave');
      afirmarCodigo(otraClave, 'TRANSICION_INVALIDA', 'viaje ya finalizado');

      const viajeB = await crearViaje(contexto);
      await aceptarViaje(contexto, viajeB.id, 'chofer1');

      const cobroAntes = await contexto.solicitar(`/viajes/${viajeB.id}/cobro`, {
        token: pasajero.token,
      });
      afirmarEstado(cobroAntes, 404, 'cobro antes de finalizar');
      afirmarCodigo(cobroAntes, 'NO_ENCONTRADO', 'cobro antes de finalizar');

      const claveReutilizada = await contexto.solicitar(`/viajes/${viajeB.id}/finalizar`, {
        metodo: 'POST',
        token: usuario(contexto, 'chofer1').token,
        headers: { 'idempotency-key': claveA },
      });
      afirmarEstado(claveReutilizada, 409, 'misma clave de finalización para otro viaje');
      afirmarCodigo(
        claveReutilizada,
        'CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO',
        'clave de finalización reutilizada',
      );

      const bSigueAsignado = await contexto.solicitar(`/viajes/${viajeB.id}`, {
        token: pasajero.token,
      });
      afirmarEstado(bSigueAsignado, 200, 'viaje B después del conflicto');
      afirmar(
        bSigueAsignado.datos.viaje.estado === 'ASIGNADO',
        'El conflicto de clave no debía modificar el segundo viaje.',
      );

      const bSinCobro = await contexto.solicitar(`/viajes/${viajeB.id}/cobro`, {
        token: pasajero.token,
      });
      afirmarEstado(bSinCobro, 404, 'cobro de B después del conflicto');

      const finalB = await finalizarViaje(contexto, viajeB.id, { clave: claveB });
      afirmar(finalB.cobro.estado === 'COBRADO', 'El segundo viaje no quedó cobrado.');

      const viajeC = await crearViaje(contexto);
      await aceptarViaje(contexto, viajeC.id, 'chofer1');
      const antesConcurrente = cantidadDeCobrosSimulados(contexto);
      const [concurrenteA, concurrenteB] = await Promise.all([
        contexto.solicitar(`/viajes/${viajeC.id}/finalizar`, {
          metodo: 'POST',
          token: usuario(contexto, 'chofer1').token,
          headers: { 'idempotency-key': claveC },
        }),
        contexto.solicitar(`/viajes/${viajeC.id}/finalizar`, {
          metodo: 'POST',
          token: usuario(contexto, 'chofer1').token,
          headers: { 'idempotency-key': claveC },
        }),
      ]);

      afirmar(
        [concurrenteA, concurrenteB].every((respuesta) => respuesta.estado === 200),
        'Las finalizaciones concurrentes no devolvieron 200.',
      );
      afirmar(
        concurrenteA.datos.cobro.id === concurrenteB.datos.cobro.id,
        'Las finalizaciones concurrentes generaron dos cobros.',
      );
      afirmarIgual(
        [concurrenteA, concurrenteB].filter(
          (respuesta) => respuesta.encabezados['idempotency-replayed'] === 'true',
        ).length,
        1,
        'La finalización concurrente debe tener exactamente un replay',
      );

      const despuesConcurrente = cantidadDeCobrosSimulados(contexto);

      if (antesConcurrente !== null && despuesConcurrente !== null) {
        afirmarIgual(
          despuesConcurrente,
          antesConcurrente + 1,
          'La finalización concurrente debe ejecutar un solo cobro',
        );
      }

      if (antesTotales !== null && despuesConcurrente !== null) {
        afirmarIgual(despuesConcurrente, antesTotales + 3, 'Deben existir tres cobros nuevos');
      }

      for (const viaje of [viajeA, viajeB, viajeC]) {
        const cobro = await contexto.dependencias.repositorioCobros.buscarPorViajeId(viaje.id);
        afirmar(cobro !== null, `El viaje ${viaje.id} no tiene exactamente un cobro persistido.`);
        afirmar(cobro.referencia === `SIM-${viaje.id}`, 'La referencia persistida no coincide.');
      }

      evidencia(contexto, '3 viajes -> 3 cobros; conflictos y concurrencia sin duplicados');
    },
  },
  {
    id: 'PM-09',
    titulo: 'Autorización del cobro',
    async ejecutar(contexto) {
      const { id } = await crearViaje(contexto);
      await aceptarViaje(contexto, id, 'chofer1');
      const { cobro } = await finalizarViaje(contexto, id, {
        clave: claveDePrueba(contexto, 'pm09-final'),
      });

      const permitidos = ['pasajero', 'chofer1', 'admin', 'soporte'];

      for (const clave of permitidos) {
        const respuesta = await contexto.solicitar(`/viajes/${id}/cobro`, {
          token: usuario(contexto, clave).token,
        });
        afirmarEstado(respuesta, 200, `GET cobro como ${clave}`);
        afirmar(respuesta.datos.cobro.id === cobro.id, `El cobro cambió para ${clave}.`);
      }

      for (const clave of ['pasajero2', 'chofer2']) {
        const respuesta = await contexto.solicitar(`/viajes/${id}/cobro`, {
          token: usuario(contexto, clave).token,
        });
        afirmarEstado(respuesta, 403, `GET cobro como ${clave}`);
        afirmarCodigo(respuesta, 'NO_AUTORIZADO', `GET cobro como ${clave}`);
      }

      const sinToken = await contexto.solicitar(`/viajes/${id}/cobro`);
      afirmarEstado(sinToken, 401, 'GET cobro sin token');
      afirmarCodigo(sinToken, 'NO_AUTENTICADO', 'GET cobro sin token');

      const inexistente = await contexto.solicitar(
        '/viajes/22222222-2222-4222-8222-222222222222/cobro',
        { token: usuario(contexto, 'pasajero').token },
      );
      afirmarEstado(inexistente, 404, 'GET cobro de viaje inexistente');
      afirmarCodigo(inexistente, 'NO_ENCONTRADO', 'cobro de viaje inexistente');

      evidencia(contexto, 'Cobro visible para participantes y staff; ajenos 403; sin token 401');
    },
  },
];
