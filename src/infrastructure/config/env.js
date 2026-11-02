import dotenv from 'dotenv';
import { z } from 'zod';

const booleano = z
  .enum(['true', 'false'])
  .default('false')
  .transform((valor) => valor === 'true');

const corsOrigin = z
  .string()
  .default('*')
  .transform((valor) => {
    const normalizado = valor.trim();
    if (normalizado === '*') return '*';
    return normalizado
      .split(',')
      .map((origen) => origen.trim())
      .filter(Boolean);
  });

const esquemaEntorno = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    // Selecciona el juego de adaptadores. El composition root es el único lugar que lo lee.
    ADAPTERS_MODE: z.enum(['real', 'fake']).default('real'),

    // PostgreSQL
    DATABASE_URL: z.string().min(1).optional(),
    DATABASE_SSL: booleano,
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),
    DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),

    // HTTP
    CORS_ORIGIN: corsOrigin,
    BODY_LIMIT: z
      .string()
      .regex(/^\d+(kb|mb)$/i, 'Debe tener el formato 100kb o 1mb')
      .default('100kb'),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
  })
  .superRefine((entorno, contexto) => {
    if (entorno.ADAPTERS_MODE === 'real' && !entorno.DATABASE_URL) {
      contexto.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'Es obligatoria cuando ADAPTERS_MODE=real',
      });
    }
  });

/**
 * Carga y valida las variables de entorno una sola vez al arrancar.
 * No se imprimen valores sensibles: solo las claves inválidas.
 */
export function loadEnv(fuente = process.env) {
  dotenv.config({ quiet: true });

  const resultado = esquemaEntorno.safeParse(fuente);

  if (!resultado.success) {
    const detalle = resultado.error.issues
      .map((issue) => `${issue.path.join('.') || 'entorno'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuración de entorno inválida: ${detalle}`);
  }

  return resultado.data;
}
