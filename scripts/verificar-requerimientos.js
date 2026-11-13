#!/usr/bin/env node
/**
 * Verificador local de requerimientos del backend.
 *
 * Levanta la aplicación real (con adaptadores en memoria o PostgreSQL) en un
 * puerto efímero y recorre por HTTP los casos PM-01 a PM-16 de la guía manual.
 * Los casos PM-17 y PM-18 son opcionales.
 *
 * Uso rápido:
 *   pnpm verificar
 *   pnpm verificar --postgres --detallado
 *   pnpm verificar --solo=PM-03,PM-06,PM-08 --reporte=/tmp/verificacion.json
 *
 * No modifica datos existentes en PostgreSQL: crea usuarios con el prefijo
 * `verif-<sufijo>-` y elimina únicamente esos datos al terminar.
 */

import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

import { CASOS_DISPONIBLES, mostrarAyuda, parsearArgumentos } from './verificacion/argumentos.js';
import { casosBasicos } from './verificacion/casos-basicos.js';
import { casosOpcionales } from './verificacion/casos-opcionales.js';
import { casosSeguridad } from './verificacion/casos-seguridad.js';
import { casosViajesA } from './verificacion/casos-viajes-a.js';
import { casosViajesB } from './verificacion/casos-viajes-b.js';
import {
  USUARIOS_PRINCIPALES,
  cerrarContexto,
  crearContexto,
  describirBaseDeDatos,
  sembrarUsuarios,
  urlPostgres,
} from './verificacion/contexto.js';

const TODOS_LOS_CASOS = [
  ...casosBasicos,
  ...casosViajesA,
  ...casosViajesB,
  ...casosSeguridad,
  ...casosOpcionales,
].sort((a, b) => Number(a.id.slice(3)) - Number(b.id.slice(3)));

const SIMBOLOS = Object.freeze({
  OK: '[OK]     ',
  FALLA: '[FALLA]  ',
  OMITIDO: '[OMITIDO]',
});

function informar(mensaje) {
  process.stdout.write(`${mensaje}\n`);
}

function advertir(mensaje) {
  process.stderr.write(`${mensaje}\n`);
}

function formatearDuracion(milisegundos) {
  if (milisegundos < 1000) return `${milisegundos} ms`;
  return `${(milisegundos / 1000).toFixed(2)} s`;
}

function describirModo(opciones) {
  return opciones.postgres ? 'PostgreSQL real' : 'fake (adaptadores en memoria)';
}

function motivoDeOmision(caso, opciones) {
  if (caso.requierePostgres && !opciones.postgres) {
    return 'requiere --postgres';
  }

  if (caso.requiereAuditoria && !opciones.auditoria) {
    return 'requiere --auditoria';
  }

  if (caso.requiereSuite && !opciones.suite) {
    return 'requiere --suite';
  }

  return null;
}

async function ejecutarCaso(caso, contexto) {
  const inicio = Date.now();
  contexto.evidencia = [];

  try {
    await caso.ejecutar(contexto);

    return {
      id: caso.id,
      titulo: caso.titulo,
      estado: 'OK',
      duracionMs: Date.now() - inicio,
      evidencia: [...contexto.evidencia],
    };
  } catch (error) {
    return {
      id: caso.id,
      titulo: caso.titulo,
      estado: 'FALLA',
      duracionMs: Date.now() - inicio,
      error: error.message,
      evidencia: [...contexto.evidencia],
    };
  }
}

function imprimirResultado(resultado, opciones) {
  const duracion =
    resultado.estado === 'OMITIDO' ? '' : ` (${formatearDuracion(resultado.duracionMs)})`;
  const motivo = resultado.motivo ? ` - ${resultado.motivo}` : '';
  informar(`${SIMBOLOS[resultado.estado]} ${resultado.id} ${resultado.titulo}${duracion}${motivo}`);

  const mostrarEvidencia =
    resultado.estado === 'FALLA' || (opciones.detallado && resultado.evidencia.length > 0);

  if (mostrarEvidencia) {
    for (const linea of resultado.evidencia) {
      informar(`            - ${linea}`);
    }
  }

  if (resultado.error) {
    informar(`            Error: ${resultado.error}`);
  }
}

async function prepararContextos(opciones, seleccionados) {
  const necesitaAplicacion = seleccionados.some(
    (caso) => !caso.requiereAuditoria && !caso.requiereSuite,
  );

  if (!necesitaAplicacion) {
    return { principal: null, auxiliar: null };
  }

  const sufijo = `v${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
  let principal = null;
  let auxiliar = null;

  try {
    principal = await crearContexto({
      postgres: opciones.postgres,
      etiqueta: 'principal',
      sufijo,
      limites: {
        RATE_LIMIT_MAX: '1000',
        REGISTRO_RATE_LIMIT_MAX: '100',
        VIAJES_RATE_LIMIT_MAX: '1000',
        LOGIN_RATE_LIMIT_MAX: '100',
      },
    });
    await sembrarUsuarios(principal, USUARIOS_PRINCIPALES);

    const necesitaAuxiliar = seleccionados.some((caso) =>
      ['PM-11', 'PM-12', 'PM-13'].includes(caso.id),
    );

    if (necesitaAuxiliar) {
      auxiliar = await crearContexto({
        postgres: false,
        etiqueta: 'rate-limits',
        sufijo: `${sufijo}rl`,
        limites: {
          RATE_LIMIT_MAX: '1000',
          REGISTRO_RATE_LIMIT_MAX: '2',
          VIAJES_RATE_LIMIT_MAX: '3',
          LOGIN_RATE_LIMIT_MAX: '3',
          REGISTRO_RATE_LIMIT_WINDOW_MS: '60000',
          VIAJES_RATE_LIMIT_WINDOW_MS: '60000',
          LOGIN_RATE_LIMIT_WINDOW_MS: '60000',
        },
      });
      await sembrarUsuarios(auxiliar, [
        { clave: 'pasajero', nombre: 'Pasajero Rate Limit', rol: 'PASAJERO' },
      ]);
    }

    principal.auxiliar = auxiliar;
    return { principal, auxiliar };
  } catch (error) {
    await cerrarContexto(principal, { conservarDatos: opciones.conservarDatos });
    await cerrarContexto(auxiliar, { conservarDatos: opciones.conservarDatos });
    throw error;
  }
}

async function escribirReporte(ruta, informe) {
  await writeFile(ruta, `${JSON.stringify(informe, null, 2)}\n`, 'utf8');
}

async function principal() {
  let opciones;

  try {
    opciones = parsearArgumentos();
  } catch (error) {
    advertir(`Argumentos inválidos: ${error.message}`);
    advertir('Usá --ayuda para ver las opciones disponibles.');
    return 2;
  }

  if (opciones.ayuda) {
    mostrarAyuda();
    return 0;
  }

  const seleccionados = TODOS_LOS_CASOS.filter(
    (caso) => !opciones.solo || opciones.solo.has(caso.id),
  );

  if (seleccionados.length === 0) {
    advertir('No quedó ningún caso seleccionado.');
    return 2;
  }

  const inicio = Date.now();
  informar('Verificación local de requerimientos');
  informar(`Modo: ${describirModo(opciones)}`);

  if (opciones.postgres) {
    informar(`Base: ${describirBaseDeDatos(urlPostgres())}`);
  }

  informar(`Casos: ${seleccionados.map((caso) => caso.id).join(', ')}`);
  informar('');

  let contextos;

  try {
    contextos = await prepararContextos(opciones, seleccionados);
  } catch (error) {
    advertir(`No se pudo iniciar el entorno de verificación: ${error.message}`);

    if (opciones.postgres) {
      advertir(
        'Sugerencia: levantá la base de pruebas con `pnpm test:db:up` o definí TEST_DATABASE_URL.',
      );
    }

    return 2;
  }

  const { principal: contextoPrincipal, auxiliar } = contextos;
  const contexto = contextoPrincipal ?? { evidencia: [] };
  const resultados = [];

  try {
    for (const caso of seleccionados) {
      const motivo = motivoDeOmision(caso, opciones);

      if (motivo) {
        const omitido = {
          id: caso.id,
          titulo: caso.titulo,
          estado: 'OMITIDO',
          duracionMs: 0,
          motivo,
          evidencia: [],
        };
        resultados.push(omitido);
        imprimirResultado(omitido, opciones);
        continue;
      }

      const resultado = await ejecutarCaso(caso, contexto);
      resultados.push(resultado);
      imprimirResultado(resultado, opciones);
    }
  } finally {
    const advertencias = [];

    if (auxiliar) {
      advertencias.push(
        ...(await cerrarContexto(auxiliar, { conservarDatos: opciones.conservarDatos })),
      );
    }

    if (contextoPrincipal) {
      advertencias.push(
        ...(await cerrarContexto(contextoPrincipal, {
          conservarDatos: opciones.conservarDatos,
        })),
      );
    }

    if (advertencias.length > 0) {
      advertir('');
      for (const advertencia of advertencias) {
        advertir(`Advertencia de limpieza: ${advertencia}`);
      }
    }

    if (opciones.postgres && !opciones.conservarDatos && contextoPrincipal) {
      informar('');
      informar(
        `Datos de la ejecución eliminados de PostgreSQL (${contextoPrincipal.datosEliminados ?? 0} usuarios).`,
      );
    }

    if (opciones.postgres && opciones.conservarDatos) {
      informar('');
      informar('Datos conservados por --conservar-datos.');
    }

    const conteo = {
      ok: resultados.filter((resultado) => resultado.estado === 'OK').length,
      fallas: resultados.filter((resultado) => resultado.estado === 'FALLA').length,
      omitidos: resultados.filter((resultado) => resultado.estado === 'OMITIDO').length,
    };
    const duracionMs = Date.now() - inicio;

    informar('');
    informar(
      `Resumen: ${conteo.ok} OK, ${conteo.fallas} falla(s), ${conteo.omitidos} omitido(s) ` +
        `en ${formatearDuracion(duracionMs)}.`,
    );

    if (conteo.fallas > 0) {
      informar('Revisá el detalle de las fallas o ejecutá con --detallado.');
    }

    if (opciones.reporte) {
      const informe = {
        generadoEn: new Date().toISOString(),
        modo: describirModo(opciones),
        baseDeDatos: opciones.postgres ? describirBaseDeDatos(urlPostgres()) : null,
        casos: CASOS_DISPONIBLES,
        opciones: {
          postgres: opciones.postgres,
          auditoria: opciones.auditoria,
          suite: opciones.suite,
          detallado: opciones.detallado,
          conservarDatos: opciones.conservarDatos,
          solo: opciones.solo ? [...opciones.solo] : null,
        },
        resumen: { ...conteo, duracionMs },
        resultados,
        advertencias,
      };

      try {
        await escribirReporte(opciones.reporte, informe);
        informar(`Reporte JSON guardado en ${opciones.reporte}`);
      } catch (error) {
        advertir(`No se pudo guardar el reporte: ${error.message}`);
      }
    }

    process.exitCode = conteo.fallas > 0 ? 1 : 0;
  }
}

const codigo = await principal();

if (typeof codigo === 'number') {
  process.exitCode = codigo;
}
