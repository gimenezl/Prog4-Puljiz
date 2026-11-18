import { z } from 'zod';

const texto = (campo) =>
  z
    .string({ message: `${campo} debe ser texto.` })
    .trim()
    .min(1, `${campo} es obligatorio.`)
    .max(50, `${campo} no puede superar los 50 caracteres.`);

/**
 * Cuerpo de PUT /choferes/yo/vehiculo. El formato de la patente y el rango del
 * año los valida la entidad Vehiculo; aquí solo se acotan tipos y tamaños.
 */
export const esquemaVehiculo = z
  .object({
    patente: z
      .string({ message: 'La patente debe ser texto.' })
      .max(20, 'La patente es demasiado larga.'),
    marca: texto('La marca'),
    modelo: texto('El modelo'),
    anio: z
      .number({ message: 'El año debe ser un número.' })
      .int('El año debe ser entero.')
      .nullish(),
    color: texto('El color').nullish(),
  })
  .strict();
