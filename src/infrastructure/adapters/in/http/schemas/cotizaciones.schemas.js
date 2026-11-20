import { z } from 'zod';

export const coordenada = z
  .object({
    lat: z.number().min(-90, 'La latitud debe estar entre -90 y 90.'),
    lng: z.number().min(-180, 'La longitud debe estar entre -180 y 180.'),
  })
  .strict();

export const esquemaCotizar = z
  .object({
    origen: coordenada,
    destino: coordenada,
  })
  .strict();
