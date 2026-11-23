/**
 * Medición de RF-06 (ADR-0006): búsqueda de choferes cercanos.
 *
 * Compara dos mecanismos del mismo puerto sobre PostgreSQL real:
 *   A. PostGIS: ST_DWithin + `<->` + LIMIT con índice GiST (lo que usa la app).
 *   D. JavaScript: traer todos los choferes elegibles y sus ubicaciones y
 *      calcular la distancia en Node (lo que hace hoy el medidor de demanda).
 *
 * Uso (con la base de pruebas levantada: pnpm test:db:up):
 *   TEST_DATABASE_URL=postgresql://admin:password@127.0.0.1:5433/proy_db_test \
 *     node scripts/medir-busqueda.js [--choferes 500,5000] [--busquedas 300] [--repeticiones 3]
 *
 * Los datos se crean con un prefijo propio y se borran al terminar. Se niega a
 * correr sin TEST_DATABASE_URL para no tocar la base de desarrollo.
 */
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';

import { JavaScriptBuscadorDeChoferes } from '../src/infrastructure/adapters/out/geografia/javascript-buscador-de-choferes.js';
import {
  CONSULTA_CHOFERES_CERCANOS,
  PostgisBuscadorDeChoferes,
} from '../src/infrastructure/adapters/out/geografia/postgis-buscador-de-choferes.js';
import { PostgresChoferRepository } from '../src/infrastructure/adapters/out/persistence/postgres-chofer-repository.js';
import { PostgresDatabase } from '../src/infrastructure/adapters/out/persistence/postgres-database.js';
import { PostgresUbicacionRepository } from '../src/infrastructure/adapters/out/persistence/postgres-ubicacion-repository.js';
import { aplicarMigraciones } from './migrate.js';

const PREFIJO = 'medicion-rf06-';
// Caja aproximada de la Ciudad de Buenos Aires.
const CIUDAD = { latMin: -34.7, latMax: -34.53, lngMin: -58.53, lngMax: -58.34 };
const CRITERIOS = { radioM: 5000, limite: 10, vigenciaUbicacionMs: 60_000 };

function opciones() {
  const { values } = parseArgs({
    options: {
      choferes: { type: 'string', default: '500,5000' },
      busquedas: { type: 'string', default: '300' },
      repeticiones: { type: 'string', default: '3' },
    },
  });

  return {
    tamanios: values.choferes.split(',').map(Number),
    busquedas: Number(values.busquedas),
    repeticiones: Number(values.repeticiones),
  };
}

// Generador pseudoaleatorio con semilla: las mismas coordenadas en cada corrida.
function crearAleatorio(semilla) {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado * 1664525 + 1013904223) >>> 0;
    return estado / 2 ** 32;
  };
}

function puntoAleatorio(aleatorio) {
  return {
    lat: CIUDAD.latMin + aleatorio() * (CIUDAD.latMax - CIUDAD.latMin),
    lng: CIUDAD.lngMin + aleatorio() * (CIUDAD.lngMax - CIUDAD.lngMin),
  };
}

function percentil(ordenados, p) {
  const indice = Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1);
  return ordenados[Math.max(0, indice)];
}

function resumir(tiempos) {
  const ordenados = [...tiempos].sort((a, b) => a - b);
  return {
    p50: percentil(ordenados, 50),
    p95: percentil(ordenados, 95),
    p99: percentil(ordenados, 99),
    max: ordenados.at(-1),
  };
}

async function limpiar(baseDeDatos) {
  // ubicaciones_vigentes y choferes se borran en cascada desde usuarios.
  await baseDeDatos.query('DELETE FROM usuarios WHERE email LIKE $1', [`${PREFIJO}%`]);
}

/** Crea `cantidad` choferes elegibles con ubicación vigente, en tres sentencias. */
async function sembrar(baseDeDatos, cantidad, aleatorio) {
  const puntos = Array.from({ length: cantidad }, () => puntoAleatorio(aleatorio));

  await baseDeDatos.query(
    `INSERT INTO usuarios (id, email, nombre, credencial, rol, creado_en)
     SELECT gen_random_uuid(), $1 || n || '@prog4.test', 'Chofer de medición', 'x', 'CHOFER', now()
       FROM generate_series(1, $2) AS n`,
    [PREFIJO, cantidad],
  );
  await baseDeDatos.query(
    `INSERT INTO choferes (usuario_id, habilitado, disponible)
     SELECT id, true, true FROM usuarios WHERE email LIKE $1`,
    [`${PREFIJO}%`],
  );
  await baseDeDatos.query(
    `INSERT INTO ubicaciones_vigentes (chofer_id, posicion, actualizada_en)
     SELECT u.id,
            ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326)::geography,
            now()
       FROM (SELECT id, row_number() OVER (ORDER BY id) AS n
               FROM usuarios WHERE email LIKE $1) AS u
       JOIN (SELECT ordinality AS n, (valor->>'lat')::float8 AS lat, (valor->>'lng')::float8 AS lng
               FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS t(valor, ordinality)) AS p
         ON p.n = u.n`,
    [`${PREFIJO}%`, JSON.stringify(puntos)],
  );
  await baseDeDatos.query('ANALYZE choferes; ANALYZE ubicaciones_vigentes');
}

async function medir(buscador, origenes) {
  const tiempos = [];
  let candidatos = 0;

  for (const origen of origenes) {
    const inicio = performance.now();
    const resultado = await buscador.buscar({ origen, ahora: new Date(), ...CRITERIOS });
    tiempos.push(performance.now() - inicio);
    candidatos += resultado.length;
  }

  return { ...resumir(tiempos), candidatosPromedio: candidatos / origenes.length };
}

// EXPLAIN sobre la MISMA sentencia que usa el adaptador, para que no diverjan.
async function explicar(baseDeDatos, origen) {
  const { rows } = await baseDeDatos.query(
    `EXPLAIN (ANALYZE, BUFFERS) ${CONSULTA_CHOFERES_CERCANOS}`,
    [
      origen.lng,
      origen.lat,
      new Date(Date.now() - CRITERIOS.vigenciaUbicacionMs),
      CRITERIOS.radioM,
      CRITERIOS.limite,
    ],
  );
  return rows.map((fila) => fila['QUERY PLAN']).join('\n');
}

const ms = (valor) => valor.toFixed(2);
const escribir = (texto = '') => process.stdout.write(`${texto}\n`);

async function principal() {
  const url = process.env.TEST_DATABASE_URL;

  if (!url) {
    throw new Error('Definí TEST_DATABASE_URL con una base descartable (pnpm test:db:up).');
  }

  const { tamanios, busquedas, repeticiones } = opciones();
  const baseDeDatos = new PostgresDatabase({
    connectionString: url,
    max: 4,
    connectionTimeoutMs: 5000,
    statementTimeoutMs: 60_000,
  });

  const postgis = new PostgisBuscadorDeChoferes({ baseDeDatos });
  const javascript = new JavaScriptBuscadorDeChoferes({
    repositorioChoferes: new PostgresChoferRepository({ baseDeDatos }),
    repositorioUbicaciones: new PostgresUbicacionRepository({ baseDeDatos }),
  });

  try {
    await aplicarMigraciones(baseDeDatos);
    const [{ version }] = (await baseDeDatos.query('SELECT version()')).rows;
    const [{ postgis_lib_version: versionPostgis }] = (
      await baseDeDatos.query('SELECT postgis_lib_version()')
    ).rows;

    escribir('# Medición RF-06: búsqueda de choferes cercanos\n');
    escribir(`- Fecha: ${new Date().toISOString()}`);
    escribir(
      `- Máquina: ${os.cpus()[0].model} (${os.cpus().length} núcleos), ${Math.round(os.totalmem() / 2 ** 30)} GB`,
    );
    escribir(`- SO: ${os.type()} ${os.release()} ${os.arch()}`);
    escribir(`- Node.js: ${process.version}`);
    escribir(`- Base: ${version.split(',')[0]} + PostGIS ${versionPostgis}`);
    escribir(
      `- Criterios: radio ${CRITERIOS.radioM} m, hasta ${CRITERIOS.limite} candidatos; ` +
        `${busquedas} búsquedas por corrida, ${repeticiones} corridas por mecanismo.\n`,
    );

    for (const cantidad of tamanios) {
      await limpiar(baseDeDatos);
      await sembrar(baseDeDatos, cantidad, crearAleatorio(42));
      const aleatorio = crearAleatorio(7);
      const origenes = Array.from({ length: busquedas }, () => puntoAleatorio(aleatorio));

      // Calentamiento: conexiones abiertas y planes en caché antes de medir.
      await medir(postgis, origenes.slice(0, 20));
      await medir(javascript, origenes.slice(0, 20));

      escribir(`## ${cantidad} choferes\n`);
      escribir(
        '| Mecanismo | Corrida | p50 (ms) | p95 (ms) | p99 (ms) | máx (ms) | Candidatos promedio |',
      );
      escribir('|---|---:|---:|---:|---:|---:|---:|');

      for (const [nombre, buscador] of [
        ['A. PostGIS (GiST)', postgis],
        ['D. Filtrar en JavaScript', javascript],
      ]) {
        for (let corrida = 1; corrida <= repeticiones; corrida += 1) {
          // Como un chofer real, cada ubicación se renueva antes de que venza
          // (la medición completa dura más que la vigencia de 60 s).
          await baseDeDatos.query(
            `UPDATE ubicaciones_vigentes SET actualizada_en = now()
              WHERE chofer_id IN (SELECT id FROM usuarios WHERE email LIKE $1)`,
            [`${PREFIJO}%`],
          );
          const r = await medir(buscador, origenes);
          escribir(
            `| ${nombre} | ${corrida} | ${ms(r.p50)} | ${ms(r.p95)} | ${ms(r.p99)} | ${ms(r.max)} | ${r.candidatosPromedio.toFixed(1)} |`,
          );
        }
      }

      escribir(
        `\n\`EXPLAIN (ANALYZE, BUFFERS)\` de una búsqueda PostGIS con ${cantidad} choferes:\n`,
      );
      escribir('```text');
      escribir(await explicar(baseDeDatos, origenes[0]));
      escribir('```\n');
    }
  } finally {
    await limpiar(baseDeDatos).catch(() => {});
    await baseDeDatos.cerrar();
  }
}

principal().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
