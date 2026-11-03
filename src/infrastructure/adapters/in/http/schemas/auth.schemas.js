import { z } from 'zod';

const email = z
  .string()
  .trim()
  .min(1, 'El email es obligatorio.')
  .max(254, 'El email es demasiado largo.')
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'El email no es válido.');

const nombre = z
  .string()
  .trim()
  .min(1, 'El nombre es obligatorio.')
  .max(100, 'El nombre no puede superar los 100 caracteres.');

const contrasenaRegistro = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres.')
  .max(72, 'La contraseña no puede superar los 72 caracteres.')
  .regex(/[A-Za-z]/, 'La contraseña debe incluir al menos una letra.')
  .regex(/\d/, 'La contraseña debe incluir al menos un número.');

export const esquemaRegistro = z
  .object({
    email,
    nombre,
    contrasena: contrasenaRegistro,
    rol: z.enum(['PASAJERO', 'CHOFER'], {
      message: 'El rol debe ser PASAJERO o CHOFER.',
    }),
  })
  .strict();

export const esquemaLogin = z
  .object({
    email,
    contrasena: z.string().min(1, 'La contraseña es obligatoria.').max(72),
  })
  .strict();

export const esquemaActualizarPerfil = z.object({ nombre }).strict();

export const esquemaId = z.string().uuid('El identificador no es válido.');
