import { execSync } from 'node:child_process';

export default function teardown(): void {
  try {
    execSync('pnpm --filter @pick/demo exec astro preview stop', { stdio: 'ignore' });
  } catch {
    // Ya estaba detenido.
  }
}
