import js from '@eslint/js';
import globals from 'globals';

const MENSAJE_INFRAESTRUCTURA =
  'Esta capa no puede depender de infraestructura. Use un puerto y un adaptador.';

const PAQUETES_DE_INFRAESTRUCTURA = [
  'express',
  'express-*',
  'pg',
  'pino',
  'pino-*',
  'dotenv',
  'helmet',
  'cors',
  'express-rate-limit',
];

const RUTAS_DE_INFRAESTRUCTURA = [
  '**/infrastructure/**',
  '../infrastructure/**',
  '../../infrastructure/**',
  '../../../infrastructure/**',
];

export default [
  {
    ignores: ['node_modules/**', 'coverage/**', 'dist/**', 'docs/**', 'db/**', 'pnpm-lock.yaml'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'warn',
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/domain/**/*.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: PAQUETES_DE_INFRAESTRUCTURA,
              message: 'El dominio debe ser puro: no puede importar librerías de infraestructura.',
            },
            {
              group: RUTAS_DE_INFRAESTRUCTURA,
              message: MENSAJE_INFRAESTRUCTURA,
            },
            {
              group: [
                '**/application/**',
                '../application/**',
                '../../application/**',
                '../../../application/**',
              ],
              message: 'El dominio no puede depender de la capa de aplicación.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'process',
          message: 'El dominio no accede al entorno: reciba los valores por parámetro.',
        },
      ],
    },
  },
  {
    files: ['src/application/**/*.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: PAQUETES_DE_INFRAESTRUCTURA,
              message: 'La aplicación solo puede depender de puertos, no de adaptadores.',
            },
            {
              group: RUTAS_DE_INFRAESTRUCTURA,
              message: MENSAJE_INFRAESTRUCTURA,
            },
          ],
        },
      ],
    },
  },
];
