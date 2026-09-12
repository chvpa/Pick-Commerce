import { execSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { PID_DEL_ADMIN } from './global-setup.ts';

export default function teardown(): void {
  try {
    execSync('pnpm --filter @pick/demo exec astro preview stop', { stdio: 'ignore' });
  } catch {
    // Ya estaba detenido.
  }

  /*
   * El setup escribe ahí la secret key en claro, tomada del `.env`. No se
   * despliega —`wrangler deploy` no sube `.dev.vars`, y los assets salen de
   * `dist/client`— pero quedaba en disco hasta el próximo build. Borrarla cuesta
   * una línea; dejar una credencial que saltea RLS tirada, no.
   */
  rmSync('apps/demo/dist/server/.dev.vars', { force: true });

  /*
   * El Worker del Admin, con su árbol.
   *
   * Matar por puerto alcanzaba con `vite preview`, que era un solo proceso. Con
   * `wrangler dev` hay dos —node y el workerd que lanza— y el segundo sobrevive
   * al primero: se queda con el 4322 y hace que la corrida siguiente falle
   * esperando un servidor que ya está escuchando, pero con el código viejo.
   */
  try {
    const pid = readFileSync(PID_DEL_ADMIN, 'utf8').trim();
    if (pid) {
      execSync(process.platform === 'win32' ? `taskkill /PID ${pid} /T /F` : `kill -- -${pid}`, {
        stdio: 'ignore',
      });
    }
  } catch {
    // Sin archivo de pid, o el proceso ya no está.
  }

  rmSync(PID_DEL_ADMIN, { force: true });
  rmSync('apps/admin/.dev.vars', { force: true });

  try {
    execSync('npx --yes kill-port 4322', { stdio: 'ignore' });
  } catch {
    // Ya estaba caído.
  }

  /*
   * Los pedidos que la corrida dejó en el proyecto de desarrollo.
   *
   * En un proceso aparte y no acá: el cliente de Supabase deja sockets abiertos
   * con keep-alive, y al salir Playwright justo después, Node en Windows se
   * caía con una aserción de libuv. La corrida terminaba en verde y el comando
   * devolvía error igual, de forma intermitente —tres corridas idénticas dieron
   * 127, 127 y 0—. Es exactamente la clase de fallo que enrojece el CI sin que
   * nada esté roto.
   */
  try {
    execSync('node scripts/limpiar-e2e.ts', { stdio: 'inherit' });
  } catch {
    // Sin credenciales, o con la red caída. No es motivo para tumbar la corrida.
  }
}
