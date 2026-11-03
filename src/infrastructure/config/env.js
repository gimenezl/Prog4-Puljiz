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

    // Autenticación
    JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres.').optional(),
    JWT_EXPIRES_IN_MINUTES: z.coerce.number().int().min(1).max(1440).default(60),
    PASSWORD_HASH_COST: z.coerce.number().int().min(4).max(15).default(12),
    LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(900000),
    LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(5),

    // Viajes: tarifa provisional en centavos. El cliente nunca informa importes.
    TARIFA_BASE_CENTAVOS: z.coerce.number().int().min(0).default(100000),
    TARIFA_POR_KM_CENTAVOS: z.coerce.number().int().min(0).default(50000),
    TARIFA_MINIMO_CENTAVOS: z.coerce.number().int().min(0).default(150000),
    TARIFA_MAXIMO_CENTAVOS: z.coerce.number().int().min(0).default(1000000),
    IDEMPOTENCIA_TTL_MS: z.coerce
      .number()
      .int()
      .min(60000)
      .max(7 * 24 * 60 * 60_000)
      .default(24 * 60 * 60_000),

    // PostgreSQL
    DATABASE_URL: z
      .string()
      .min(1)
      .refine((valor) => {
        try {
          const url = new URL(valor);
          return url.protocol === 'postgres:' || url.protocol === 'postgresql:';
        } catch {
          return false;
        }
      }, 'Debe ser una URL PostgreSQL válida')
      .optional(),
    DATABASE_SSL: booleano,
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),
    DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),

    // Ciclo de vida y disponibilidad
    READINESS_TIMEOUT_MS: z.coerce.number().int().min(100).default(3000),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).default(10000),

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

    if (entorno.ADAPTERS_MODE === 'real' && !entorno.JWT_SECRET) {
      contexto.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'Es obligatorio cuando ADAPTERS_MODE=real',
      });
    }

    if (entorno.TARIFA_MINIMO_CENTAVOS > entorno.TARIFA_MAXIMO_CENTAVOS) {
      contexto.addIssue({
        code: 'custom',
        path: ['TARIFA_MINIMO_CENTAVOS'],
        message: 'No puede ser mayor que TARIFA_MAXIMO_CENTAVOS',
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
