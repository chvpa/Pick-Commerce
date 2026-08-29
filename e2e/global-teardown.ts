import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';

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

  // El preview del Admin se lanzó suelto —`vite preview` no tiene bandera de
  // segundo plano— y se mata por puerto, que es lo único que se conoce con
  // certeza desde acá.
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
