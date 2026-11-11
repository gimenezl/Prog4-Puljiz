import { z } from 'zod';

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
