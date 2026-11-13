/**
 * Cliente HTTP y aserciones mínimas compartidas por los casos.
 *
 * No se usa ninguna librería de testing: el verificador debe poder correrse
 * como un script común, sin cargar el runner de Node ni depender de utilidades
 * internas de los tests.
 */

export function afirmar(condicion, mensaje) {
  if (!condicion) {
    throw new Error(mensaje);
  }
}

export function afirmarIgual(actual, esperado, mensaje) {
  if (!Object.is(actual, esperado)) {
    throw new Error(
      `${mensaje}: esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(actual)}.`,
    );
  }
}

export function afirmarIncluye(coleccion, valor, mensaje) {
  if (!coleccion.includes(valor)) {
    throw new Error(`${mensaje}: no se encontró ${JSON.stringify(valor)}.`);
  }
}

export function afirmarEstado(respuesta, esperado, descripcion) {
  if (respuesta.estado !== esperado) {
    throw new Error(
      `${descripcion}: esperado HTTP ${esperado}, obtenido ${respuesta.estado}. ` +
        `Cuerpo: ${respuesta.texto.slice(0, 400)}`,
    );
  }
}

export function afirmarCodigo(respuesta, codigo, descripcion) {
  const obtenido = respuesta.datos?.error?.codigo;

  if (obtenido !== codigo) {
    throw new Error(
      `${descripcion}: esperado código ${codigo}, obtenido ${JSON.stringify(obtenido)}. ` +
        `Cuerpo: ${respuesta.texto.slice(0, 400)}`,
    );
  }
}

export function evidencia(contexto, linea) {
  contexto.evidencia.push(linea);
}

export function claveDePrueba(contexto, etiqueta) {
  return `verif-${contexto.sufijo}-${etiqueta}`;
}

/**
 * Ejecuta un pedido HTTP y devuelve estado, encabezados y cuerpo parseado.
 * Los errores de red se convierten en un mensaje con la ruta para facilitar el
 * diagnóstico desde la terminal.
 */
export async function solicitar(
  baseUrl,
  ruta,
  { metodo = 'GET', token, cuerpo, texto, headers = {}, timeoutMs = 15000 } = {},
) {
  const cabeceras = { accept: 'application/json', ...headers };

  if (token) {
    cabeceras.authorization = `Bearer ${token}`;
  }

  let cuerpoEnviado;

  if (texto !== undefined) {
    cuerpoEnviado = texto;
    cabeceras['content-type'] ??= 'application/json';
  } else if (cuerpo !== undefined) {
    cuerpoEnviado = JSON.stringify(cuerpo);
    cabeceras['content-type'] ??= 'application/json';
  }

  let respuesta;

  try {
    respuesta = await fetch(new URL(ruta, baseUrl), {
      method: metodo,
      headers: cabeceras,
      body: cuerpoEnviado,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new Error(`No se pudo completar ${metodo} ${ruta}: ${error.message}`, {
      cause: error,
    });
  }

  const textoRespuesta = await respuesta.text();
  let datos = null;

  if (textoRespuesta.length > 0) {
    try {
      datos = JSON.parse(textoRespuesta);
    } catch {
      datos = null;
    }
  }

  const encabezados = {};
  respuesta.headers.forEach((valor, nombre) => {
    encabezados[nombre.toLowerCase()] = valor;
  });

  return {
    estado: respuesta.status,
    datos,
    texto: textoRespuesta,
    encabezados,
  };
}
