import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { init, parse } from 'es-module-lexer';

const RAIZ_SRC = path.resolve(import.meta.dirname, '../../src');
const COMPOSITION_ROOT = path.join(RAIZ_SRC, 'composition-root.js');

await init;

const PROHIBIDOS_DOMINIO = [
  /^express$/,
  /^express-/,
  /^pg$/,
  /^pino$/,
  /^pino-/,
  /^dotenv$/,
  /^helmet$/,
  /^cors$/,
  /^express-rate-limit$/,
  /(^|\/)infrastructure\//,
  /(^|\/)application\//,
];

const PROHIBIDOS_APLICACION = [
  /^express$/,
  /^express-/,
  /^pg$/,
  /^pino$/,
  /^pino-/,
  /^dotenv$/,
  /^helmet$/,
  /^cors$/,
  /^express-rate-limit$/,
  /(^|\/)infrastructure\//,
];

async function listarArchivosJs(directorio) {
  let entradas;

  try {
    entradas = await readdir(directorio, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const listas = await Promise.all(
    entradas.map(async (entrada) => {
      const ruta = path.join(directorio, entrada.name);
      if (entrada.isDirectory()) return listarArchivosJs(ruta);
      return entrada.isFile() && entrada.name.endsWith('.js') ? [ruta] : [];
    }),
  );

  return listas.flat();
}

async function especificadoresDe(archivo) {
  const contenido = await readFile(archivo, 'utf8');
  const [imports] = parse(contenido);

  return {
    contenido,
    especificadores: imports.map((importacion) => importacion.n).filter(Boolean),
  };
}

function rutaRelativa(archivo) {
  return path.relative(RAIZ_SRC, archivo);
}

test('el dominio no importa frameworks, drivers ni capas externas', async () => {
  const archivos = await listarArchivosJs(path.join(RAIZ_SRC, 'domain'));

  for (const archivo of archivos) {
    const { especificadores } = await especificadoresDe(archivo);

    for (const especificador of especificadores) {
      assert.equal(
        PROHIBIDOS_DOMINIO.some((patron) => patron.test(especificador)),
        false,
        `${rutaRelativa(archivo)} importa "${especificador}"`,
      );
    }
  }
});

test('la aplicación no importa frameworks, drivers ni adaptadores concretos', async () => {
  const archivos = await listarArchivosJs(path.join(RAIZ_SRC, 'application'));

  for (const archivo of archivos) {
    const { especificadores } = await especificadoresDe(archivo);

    for (const especificador of especificadores) {
      assert.equal(
        PROHIBIDOS_APLICACION.some((patron) => patron.test(especificador)),
        false,
        `${rutaRelativa(archivo)} importa "${especificador}"`,
      );
    }
  }
});

test('solo el composition root importa adaptadores de salida', async () => {
  const archivos = await listarArchivosJs(RAIZ_SRC);

  for (const archivo of archivos) {
    if (archivo === COMPOSITION_ROOT) continue;

    const { especificadores } = await especificadoresDe(archivo);
    const importaAdaptador = especificadores.some((especificador) =>
      /(^|\/)adapters\/out\//.test(especificador),
    );

    assert.equal(
      importaAdaptador,
      false,
      `${rutaRelativa(archivo)} debe recibir el adaptador por inyección`,
    );
  }
});

test('el código fuente usa ESM estricto y no CommonJS', async () => {
  const archivos = await listarArchivosJs(RAIZ_SRC);

  for (const archivo of archivos) {
    const { contenido } = await especificadoresDe(archivo);

    assert.equal(
      /(^|[^\w.$])require\s*\(/m.test(contenido),
      false,
      `${rutaRelativa(archivo)} usa require()`,
    );
    assert.equal(
      /(^|[^\w.])module\.exports\b|(^|[^\w.])exports\./m.test(contenido),
      false,
      `${rutaRelativa(archivo)} usa exports de CommonJS`,
    );
  }
});
