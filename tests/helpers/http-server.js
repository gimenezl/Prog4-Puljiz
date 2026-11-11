import { once } from 'node:events';

export async function iniciarServidor(app) {
  const servidor = app.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  const { port } = servidor.address();

  return { servidor, urlBase: `http://127.0.0.1:${port}` };
}

export async function detenerServidor(servidor) {
  const cerrado = once(servidor, 'close');
  servidor.close();
  await cerrado;
}
