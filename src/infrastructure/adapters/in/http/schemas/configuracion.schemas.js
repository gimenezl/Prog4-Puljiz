import { z } from 'zod';

import { coordenada } from './cotizaciones.schemas.js';

const criterio = z
  .object({
    tipo: z.literal('POLIGONO'),
    puntos: z.array(coordenada).min(3, 'El polígono debe tener al menos tres puntos.'),
  })
  .strict();

const enteroNoNegativo = z.number().int().min(0);
const decimal = z.string().regex(/^\d+(\.\d{1,4})?$/, 'El decimal debe tener entre 0 y 4 lugares.');

export const esquemaCrearZona = z
  .object({
    nombre: z.string().trim().min(1).max(100),
    criterio,
    activa: z.boolean().default(true),
  })
  .strict();

export const esquemaActualizarZona = z
  .object({
    nombre: z.string().trim().min(1).max(100).optional(),
    criterio: criterio.optional(),
    activa: z.boolean().optional(),
  })
  .strict()
  .refine((valor) => Object.keys(valor).length > 0, 'Debe enviar al menos un campo.');

export const esquemaTarifa = z
  .object({
    baseCentavos: enteroNoNegativo,
    porKmCentavos: enteroNoNegativo,
    porMinutoCentavos: enteroNoNegativo,
    precioMaximoCentavos: enteroNoNegativo,
  })
  .strict();

export const esquemaActualizarTarifa = esquemaTarifa
  .partial()
  .refine((valor) => Object.keys(valor).length > 0, 'Debe enviar al menos un campo.');

export const esquemaRegla = z
  .object({
    umbralInferior: decimal,
    umbralSuperior: decimal,
    multiplicadorMinimo: decimal,
    multiplicadorMaximo: decimal,
    escalaMultiplicador: z.number().int().min(0).max(4),
  })
  .strict();

export const esquemaActualizarRegla = esquemaRegla
  .partial()
  .refine((valor) => Object.keys(valor).length > 0, 'Debe enviar al menos un campo.');

export const esquemaPublicarRegla = z
  .object({
    motivo: z.string().trim().min(1).max(500).optional().nullable(),
  })
  .strict();
