/**
 * Casos opcionales PM-17 (auditoría de dependencias) y PM-18 (suite completa).
 * Se ejecutan solamente con --auditoria y --suite para que la verificación
 * rápida no dependa de la red ni de varios minutos de tests.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';

import { afirmar, evidencia } from './utilidades.js';

const RAIZ = path.resolve(import.meta.dirname, '../..');

function ejecutarProceso(comando, argumentos, { timeoutMs }) {
  return new Promise((resolver) => {
    const proceso = spawn(comando, argumentos, {
      cwd: RAIZ,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let salida = '';
    let errores = '';
    let terminado = false;

    proceso.stdout.on('data', (fragmento) => {
      salida += fragmento.toString();
    });
    proceso.stderr.on('data', (fragmento) => {
      errores += fragmento.toString();
    });

    const finalizar = (resultado) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(temporizador);
      resolver({ ...resultado, stdout: salida, stderr: errores });
    };

    const temporizador = setTimeout(() => {
      proceso.kill('SIGKILL');
      finalizar({
        codigo: null,
        error: new Error(`El comando ${comando} superó el tiempo límite de ${timeoutMs} ms.`),
      });
    }, timeoutMs);

    proceso.once('error', (error) => finalizar({ codigo: null, error }));
    proceso.once('close', (codigo) => finalizar({ codigo }));
  });
}

function recortar(texto, limite = 1200) {
  return texto.length <= limite ? texto : texto.slice(-limite);
}

export const casosOpcionales = [
  {
    id: 'PM-17',
    titulo: 'Auditoría de dependencias de producción',
    requiereAuditoria: true,
    async ejecutar(contexto) {
      const resultado = await ejecutarProceso('pnpm', ['audit', '--prod', '--json'], {
        timeoutMs: 120_000,
      });

      afirmar(!resultado.error, resultado.error?.message ?? 'La auditoría no pudo ejecutarse.');

      let informe;

      try {
        informe = JSON.parse(resultado.stdout);
      } catch {
        // La salida no era JSON: se informa el error más abajo.
      }

      afirmar(
        informe !== undefined,
        `La auditoría no devolvió JSON válido. ¿Red disponible? Salida: ${recortar(
          resultado.stdout || resultado.stderr,
        )}`,
      );

      const avisos = Object.values(informe.advisories ?? {});
      const altos = avisos.filter(
        (aviso) => aviso.severity === 'high' || aviso.severity === 'critical',
      );
      const vulnerabilidades = informe.metadata?.vulnerabilities ?? {};
      const altosSegunMetadata = (vulnerabilidades.high ?? 0) + (vulnerabilidades.critical ?? 0);

      afirmar(
        altos.length === 0 && altosSegunMetadata === 0,
        `La auditoría encontró ${altos.length + altosSegunMetadata} hallazgo(s) alto(s)/crítico(s).`,
      );

      const dependencias = informe.metadata?.totalDependencies ?? 'desconocidas';
      evidencia(
        contexto,
        `pnpm audit --prod: 0 altos/críticos; ${dependencias} dependencias revisadas`,
      );

      if (Object.keys(vulnerabilidades).length > 0) {
        const resumen = Object.entries(vulnerabilidades)
          .map(([severidad, cantidad]) => `${severidad}=${cantidad}`)
          .join(', ');
        evidencia(contexto, `Resumen de auditoría: ${resumen}`);
      }
    },
  },
  {
    id: 'PM-18',
    titulo: 'Suite automatizada completa',
    requiereSuite: true,
    async ejecutar(contexto) {
      const resultado = await ejecutarProceso('pnpm', ['test'], { timeoutMs: 600_000 });

      afirmar(!resultado.error, resultado.error?.message ?? 'La suite no pudo ejecutarse.');
      afirmar(
        resultado.codigo === 0,
        `pnpm test terminó con código ${resultado.codigo}. Salida: ${recortar(
          `${resultado.stdout}\n${resultado.stderr}`,
          2000,
        )}`,
      );

      const lineas = `${resultado.stdout}\n${resultado.stderr}`
        .split('\n')
        .map((linea) => linea.trim())
        .filter((linea) => /\b(pass|fail|skipped|tests)\b/i.test(linea))
        .slice(-3);

      evidencia(
        contexto,
        `pnpm test -> código 0${lineas.length ? ` (${lineas.join(' | ')})` : ''}`,
      );
    },
  },
];
