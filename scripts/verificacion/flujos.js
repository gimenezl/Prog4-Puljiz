/**
 * Flujos HTTP reutilizables. Mantienen las aserciones de estado en un solo
 * lugar para que cada caso se concentre en la regla que verifica.
 */

import { afirmarEstado, claveDePrueba, evidencia, solicitar } from './utilidades.js';
import { usuario } from './contexto.js';

export const ORIGEN = Object.freeze({ lat: -34.6037, lng: -58.3816 });
export const DESTINO = Object.freeze({ lat: -34.6083, lng: -58.3712 });
export const DESTINO_ALTERNATIVO = Object.freeze({ lat: -34.61, lng: -58.37 });

export function solicitarCrearViaje(
  contexto,
  { pasajero = 'pasajero', clave, origen = ORIGEN, destino = DESTINO } = {},
) {
  const sesion = usuario(contexto, pasajero);
  const claveFinal = clave ?? claveDePrueba(contexto, `crear-${Date.now()}-${Math.random()}`);

  return contexto
    .solicitar('/viajes', {
      metodo: 'POST',
      token: sesion.token,
      headers: { 'idempotency-key': claveFinal },
      cuerpo: { origen, destino },
    })
    .then((respuesta) => ({ respuesta, clave: claveFinal }));
}

export async function crearViaje(contexto, opciones = {}) {
  const { respuesta, clave } = await solicitarCrearViaje(contexto, opciones);
  afirmarEstado(respuesta, 201, `crear viaje (${opciones.pasajero ?? 'pasajero'})`);
  evidencia(contexto, `POST /viajes -> 201, viaje ${respuesta.datos.viaje.id}`);

  return { respuesta, clave, viaje: respuesta.datos.viaje, id: respuesta.datos.viaje.id };
}

export async function aceptarViaje(contexto, viajeId, chofer = 'chofer1') {
  const sesion = usuario(contexto, chofer);
  const respuesta = await contexto.solicitar(`/viajes/${viajeId}/aceptar`, {
    metodo: 'POST',
    token: sesion.token,
  });

  afirmarEstado(respuesta, 200, `aceptar viaje como ${chofer}`);
  evidencia(contexto, `POST /viajes/${viajeId}/aceptar (${chofer}) -> 200`);

  return respuesta.datos.viaje;
}

export async function finalizarViaje(contexto, viajeId, { chofer = 'chofer1', clave } = {}) {
  const sesion = usuario(contexto, chofer);
  const claveFinal = clave ?? claveDePrueba(contexto, `final-${viajeId}`);
  const respuesta = await contexto.solicitar(`/viajes/${viajeId}/finalizar`, {
    metodo: 'POST',
    token: sesion.token,
    headers: { 'idempotency-key': claveFinal },
  });

  afirmarEstado(respuesta, 200, `finalizar viaje ${viajeId} como ${chofer}`);
  evidencia(contexto, `POST /viajes/${viajeId}/finalizar (${chofer}) -> 200 cobrado`);

  return { respuesta, ...respuesta.datos, clave: claveFinal };
}

export async function cancelarViaje(
  contexto,
  viajeId,
  { pasajero = 'pasajero', motivo = 'Cancelado por la prueba automática' } = {},
) {
  const sesion = usuario(contexto, pasajero);
  const respuesta = await contexto.solicitar(`/viajes/${viajeId}/cancelar`, {
    metodo: 'POST',
    token: sesion.token,
    cuerpo: { motivo },
  });

  afirmarEstado(respuesta, 200, `cancelar viaje como ${pasajero}`);
  evidencia(contexto, `POST /viajes/${viajeId}/cancelar -> 200 ${respuesta.datos.viaje.estado}`);

  return respuesta.datos.viaje;
}

export async function crearYAsignarViaje(contexto, opciones = {}) {
  const viaje = await crearViaje(contexto, opciones);
  const asignado = await aceptarViaje(contexto, viaje.id, opciones.chofer ?? 'chofer1');

  return { ...viaje, viaje: asignado };
}

export async function perfilChofer(contexto, clave = 'chofer1') {
  const sesion = usuario(contexto, clave);
  const respuesta = await contexto.solicitar('/choferes/yo', {
    token: sesion.token,
  });

  afirmarEstado(respuesta, 200, `consultar perfil de ${clave}`);
  return respuesta.datos.chofer;
}

export function pedirComo(contexto, ruta, clave) {
  return solicitar(contexto.baseUrl, ruta, { token: usuario(contexto, clave).token });
}
