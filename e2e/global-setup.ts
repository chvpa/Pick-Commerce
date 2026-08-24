import { execSync } from 'node:child_process';

/**
 * `astro preview` se demoniza y devuelve el control, así que el `webServer` de
 * Playwright lo daría por muerto apenas arranca. Se lo levanta acá y se lo baja
 * en el teardown.
 */
function silencioso(comando: string): void {
  try {
    execSync(comando, { stdio: 'ignore' });
  } catch {
    // No estaba corriendo, o ya se detuvo.
  }
}

export default function setup(): void {
  // Parar ANTES de construir: en Windows el preview mantiene `dist` abierto y
  // `astro build`, que lo vacía, muere con un fallo de handle.
  silencioso('pnpm --filter @pick/demo exec astro preview stop');

  execSync('pnpm --filter @pick/demo run build', { stdio: 'inherit' });

  execSync('pnpm --filter @pick/demo exec astro preview --host 127.0.0.1 --port 4321', {
    stdio: 'ignore',
  });
  execSync('npx --yes wait-on -t 120000 http-get://127.0.0.1:4321/', { stdio: 'ignore' });
}
