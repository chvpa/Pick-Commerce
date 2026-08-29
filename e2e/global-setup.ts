import { execSync, spawn } from 'node:child_process';
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

  // ---------------------------------------------------------------------------
  // El Admin
  // ---------------------------------------------------------------------------

  // Un usuario y una segunda tienda: sin la segunda, el selector dibuja su
  // variante inerte y el smoke pasaría sin abrir el menú que se rompió.
  execSync('node scripts/preparar-admin-e2e.ts', { stdio: 'inherit' });

  /*
   * El Admin hornea su configuración al construir, y las variables se llaman
   * distinto de las del servidor. En CI sólo existen `SUPABASE_URL` y
   * `SUPABASE_PUBLISHABLE_KEY`, así que se traducen acá en vez de pedirle al
   * workflow que conozca el prefijo de Vite.
   *
   * Sin esto el build sale con la pantalla de "falta configuración" y el smoke
   * ni siquiera llega al login — que es, literalmente, lo que produce hoy el
   * `pnpm build` del CI sin que nadie se entere.
   */
  const publishable =
    process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!publishable) {
    throw new Error(
      'Falta SUPABASE_PUBLISHABLE_KEY: el Admin no puede construirse sin su clave pública.',
    );
  }

  silencioso('npx --yes kill-port 4322');

  if (process.env.PLAYWRIGHT_SKIP_BUILD !== '1') {
    execSync('pnpm --filter @pick/admin run build', {
      stdio: 'inherit',
      env: { ...process.env, VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: publishable },
    });
  }

  /*
   * `vite preview` no tiene bandera de segundo plano, así que se lanza suelto y
   * se mata por puerto en el teardown. Sirve `dist`, que es el artefacto que se
   * despliega, con el fallback a `index.html` que necesita el router del SPA.
   */
  spawn(
    // El comando entero en una cadena, no en un array: con `shell: true` los
    // argumentos sueltos se concatenan mal en Windows y el proceso muere sin
    // dejar rastro, que fue exactamente lo que pasó la primera vez.
    'pnpm --filter @pick/admin exec vite preview --port 4322 --strictPort --host 127.0.0.1',
    { detached: true, stdio: 'ignore', shell: true, windowsHide: true },
  ).unref();

  execSync('npx --yes wait-on -t 120000 http-get://127.0.0.1:4322/', { stdio: 'ignore' });
}
