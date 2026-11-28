import { z } from 'zod';

import { ESTADOS_VIAJE } from '../../../../../domain/entities/viaje.js';

const coordenada = z
  .object({
    lat: z.number().min(-90, 'La latitud debe estar entre -90 y 90.'),
    lng: z.number().min(-180, 'La longitud debe estar entre -180 y 180.'),
  })
  .strict();

export const esquemaCrearViaje = z
  .object({
    origen: coordenada,
    destino: coordenada,
  })
  .strict();

export const esquemaCancelarViaje = z
  .object({
    motivo: z
      .string()
      .trim()
      .min(1, 'El motivo es obligatorio.')
      .max(500, 'El motivo no puede superar los 500 caracteres.'),
  })
  .strict();

export const esquemaDisponibilidadChofer = z
  .object({
    disponible: z.boolean({ message: 'La disponibilidad debe ser booleana.' }),
  })
  .strict();

export const esquemaHabilitacionChofer = z
  .object({
    habilitado: z.boolean({ message: 'La habilitación debe ser booleana.' }),
  })
  .strict();

const limitePagina = z.coerce
  .number({ message: 'El límite debe ser un número.' })
  .int('El límite debe ser entero.')
  .min(1, 'El límite debe ser al menos 1.')
  .max(100, 'El límite no puede superar 100.')
  .default(20);

const cursor = z.string().max(200, 'El cursor no es válido.').optional();

/** Parámetros de GET /viajes (historial propio, RF-14). */
export const esquemaHistorial = z
  .object({
    limite: limitePagina,
    cursor,
    estado: z.enum(Object.values(ESTADOS_VIAJE), { message: 'El estado no es válido.' }).optional(),
  })
  .strict();

/** Parámetros de GET /viajes/activos (soporte, RF-15). */
export const esquemaViajesActivos = z.object({ limite: limitePagina, cursor }).strict();
