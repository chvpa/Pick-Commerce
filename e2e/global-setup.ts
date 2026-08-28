import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';

/**
 * Prepara el entorno de los tests de navegación.
 *
 * El storefront ya no es autosuficiente: lee el catálogo de Postgres, así que
 * antes de construir hay que darle credenciales y datos. En local salen de
 * `.env`; en CI, del stack de Supabase que levanta el runner. Ver ADR-058.
 */
/** El secreto con el que se firman los pagos de prueba. Lo comparte el spec. */
export const SECRETO_DE_PAGO = 'secreto-de-prueba-del-e2e';

function silencioso(comando: string): void {
  try {
    execSync(comando, { stdio: 'ignore' });
  } catch {
    // No estaba corriendo, o ya se detuvo.
  }
}

export default function setup(): void {
  if (existsSync('.env')) process.loadEnvFile('.env');

  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error(
      'Faltan SUPABASE_URL y SUPABASE_SECRET_KEY.\n' +
        'En local salen de .env; en CI, de `supabase status -o env`.',
    );
  }

  // Idempotente: restituye los datos que los tests dan por ciertos ("2
  // productos" en Negro, "Gs. 389.000" en la campera) sin borrar nada más.
  execSync('pnpm seed', { stdio: 'inherit' });

  /*
   * `--background` **no es opcional**: sin esa bandera `astro preview` corre en
   * primer plano y `execSync` no vuelve nunca. En una máquina donde el comando lo
   * lanza un agente de código, Astro lo detecta —`am-i-vibing`— y lo manda al
   * fondo solo, así que localmente parecía funcionar sin la bandera; en el runner
   * del CI, que no es ningún agente, la corrida quedaba colgada acá para siempre.
   * Ver `astro/dist/cli/preview/index.js`: `flags.background || agentDetected`.
   *
   * En background escribe un lockfile con el pid, que es lo que después usa
   * `astro preview stop` en el teardown.
   *
   * Parar ANTES de construir: en Windows el preview mantiene `dist` abierto y
   * `astro build`, que lo vacía, muere con un fallo de handle.
   */
  silencioso('pnpm --filter @pick/demo exec astro preview stop');

  // El CI ya construyó para medir el presupuesto; construir de nuevo son varios
  // minutos por nada.
  if (process.env.PLAYWRIGHT_SKIP_BUILD !== '1') {
    execSync('pnpm --filter @pick/demo run build', { stdio: 'inherit' });
  }

  /*
   * `astro preview` con el adapter de Cloudflare corre sobre workerd, que no ve
   * `process.env`: los secretos salen de un `.dev.vars` que wrangler busca
   * **junto a su archivo de configuración**, y el que usa el preview es el que
   * genera el build en `dist/server`. En la raíz del proyecto Astro no lo lee,
   * aunque la documentación del adapter diga eso.
   *
   * Va después de construir porque el build vacía `dist`. Es el mismo valor que
   * ya está en `.env`, no un segundo lugar donde configurarlo, y está ignorado
   * por git.
   */
  /*
   * `PAYMENT_WEBHOOK_SECRET` con un valor fijo: el flujo de pago simulado firma
   * y verifica con él, y los tests necesitan poder acuñar sus propios avisos
   * para probar el webhook repetido.
   *
   * `RESEND_API_KEY` **no** se pasa, a propósito. Sin proveedor de correo el
   * drenaje es un no-op, así que una corrida de tests no le manda nada a nadie;
   * lo que se encola queda pendiente y se va en cascada con los pedidos que
   * borra el teardown.
   */
  writeFileSync(
    'apps/demo/dist/server/.dev.vars',
    `SUPABASE_URL=${url}\nSUPABASE_SECRET_KEY=${secretKey}\n` +
      `PAYMENT_WEBHOOK_SECRET=${SECRETO_DE_PAGO}\n`,
    'utf8',
  );

  execSync(
    'pnpm --filter @pick/demo exec astro preview --background --host 127.0.0.1 --port 4321',
    { stdio: 'ignore' },
  );
  execSync('npx --yes wait-on -t 120000 http-get://127.0.0.1:4321/', { stdio: 'ignore' });
}
