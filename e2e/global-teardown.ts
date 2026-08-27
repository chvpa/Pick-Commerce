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
}
