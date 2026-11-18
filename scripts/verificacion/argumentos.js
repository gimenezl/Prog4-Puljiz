/**
 * Lectura de argumentos del verificador local.
 *
 * El parser es deliberadamente estricto: una opción desconocida corta la
 * ejecución para evitar que el usuario crea que corrió una verificación que en
 * realidad no se ejecutó.
 */

export const CASOS_DISPONIBLES = Object.freeze([
  'PM-01',
  'PM-02',
  'PM-03',
  'PM-04',
  'PM-05',
  'PM-06',
  'PM-07',
  'PM-08',
  'PM-09',
  'PM-10',
  'PM-11',
  'PM-12',
  'PM-13',
  'PM-14',
  'PM-15',
  'PM-16',
  'PM-17',
  'PM-18',
]);

const AYUDA = `Verificación local de requerimientos del backend.

Uso:
  node scripts/verificar-requerimientos.js [opciones]
  pnpm verificar [opciones]

Opciones:
  --postgres             Usa PostgreSQL real y valida PM-10. Por defecto usa
                         TEST_DATABASE_URL o la base de pruebas del puerto 5433.
  --auditoria            Ejecuta PM-17 (pnpm audit --prod). Requiere red.
  --suite                Ejecuta PM-18 (pnpm test). Puede tardar varios minutos.
  --solo=PM-01,PM-06     Ejecuta únicamente los casos indicados.
  --detallado            Muestra la evidencia de todos los casos, no solo fallas.
  --reporte=ruta.json    Guarda el resultado completo en un archivo JSON.
  --conservar-datos      No elimina los datos creados en PostgreSQL al terminar.
  --ayuda, -h            Muestra esta ayuda.

Ejemplos:
  pnpm verificar
  pnpm verificar --detallado
  pnpm verificar --postgres --detallado --reporte=/tmp/verificacion.json
  pnpm verificar --solo=PM-03,PM-06,PM-08
  pnpm verificar --auditoria --suite

Códigos de salida:
  0  Todos los casos ejecutados pasaron (puede haber omitidos).
  1  Al menos un caso falló.
  2  No se pudo iniciar la aplicación o la configuración es inválida.
`;

function exigirValor(argumentos, indice, opcion) {
  const valor = argumentos[indice + 1];

  if (!valor || valor.startsWith('--')) {
    throw new Error(`La opción ${opcion} requiere un valor.`);
  }

  return valor;
}

function separarValor(argumento, opcion) {
  if (argumento.startsWith(`${opcion}=`)) {
    return { encontrada: true, valor: argumento.slice(opcion.length + 1) };
  }

  return { encontrada: argumento === opcion, valor: null };
}

function normalizarSolo(valor) {
  const ids = valor
    .split(',')
    .map((id) => id.trim().toUpperCase())
    .filter(Boolean);

  if (ids.length === 0) {
    throw new Error('La opción --solo no contiene ningún caso.');
  }

  const desconocidos = ids.filter((id) => !CASOS_DISPONIBLES.includes(id));

  if (desconocidos.length > 0) {
    throw new Error(`Casos desconocidos en --solo: ${desconocidos.join(', ')}.`);
  }

  return new Set(ids);
}

/**
 * Devuelve una configuración inmutable con los valores por defecto.
 */
export function parsearArgumentos(argumentos = process.argv.slice(2)) {
  const opciones = {
    postgres: false,
    auditoria: false,
    suite: false,
    detallado: false,
    conservarDatos: false,
    reporte: null,
    solo: null,
    ayuda: false,
  };

  for (let indice = 0; indice < argumentos.length; indice += 1) {
    const argumento = argumentos[indice];

    if (argumento === '--ayuda' || argumento === '-h') {
      opciones.ayuda = true;
      continue;
    }

    if (argumento === '--postgres') {
      opciones.postgres = true;
      continue;
    }

    if (argumento === '--auditoria') {
      opciones.auditoria = true;
      continue;
    }

    if (argumento === '--suite') {
      opciones.suite = true;
      continue;
    }

    if (argumento === '--detallado') {
      opciones.detallado = true;
      continue;
    }

    if (argumento === '--conservar-datos') {
      opciones.conservarDatos = true;
      continue;
    }

    const solo = separarValor(argumento, '--solo');
    if (solo.encontrada) {
      opciones.solo = normalizarSolo(solo.valor ?? exigirValor(argumentos, indice, '--solo'));
      if (!solo.valor) indice += 1;
      continue;
    }

    const reporte = separarValor(argumento, '--reporte');
    if (reporte.encontrada) {
      opciones.reporte = reporte.valor ?? exigirValor(argumentos, indice, '--reporte');
      if (!reporte.valor) indice += 1;
      continue;
    }

    throw new Error(`Opción desconocida: ${argumento}. Usá --ayuda para ver las opciones.`);
  }

  return Object.freeze(opciones);
}

export function mostrarAyuda() {
  process.stdout.write(AYUDA);
}
