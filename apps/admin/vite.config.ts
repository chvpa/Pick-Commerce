import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { manejar, type Env } from './worker/index.ts';

const raiz = fileURLToPath(new URL('../../', import.meta.url));

/**
 * El Worker del Admin, dentro del dev server.
 *
 * En producción y en el e2e las rutas `/api/*` las sirve workerd. `vite dev`
 * sirve assets y nada más, así que sin esto una ruta nueva daría 404 en
 * desarrollo y funcionaría al desplegar — la divergencia al revés de la
 * habitual, y por eso más difícil de notar.
 *
 * Monta **la misma función** `manejar`, no una copia: lo único que cambia entre
 * los dos caminos es el runtime y de dónde salen las variables. El handler usa
 * sólo APIs web estándar —`Request`, `Response`, `crypto.subtle`— que Node tiene.
 *
 * ponytail: es Node y no workerd, así que una API exclusiva de Workers en el
 * handler pasaría desapercibida acá. Lo cubre el e2e, que corre sobre workerd.
 */
function workerDelAdmin(env: Env): Plugin {
  return {
    name: 'pick:worker-del-admin',
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        if (!req.url?.startsWith('/api/')) return next();

        const cuerpo: Buffer[] = [];
        for await (const trozo of req) cuerpo.push(trozo as Buffer);

        const peticion = new Request(new URL(req.url, 'http://127.0.0.1'), {
          method: req.method,
          headers: req.headers as Record<string, string>,
          ...(cuerpo.length > 0 ? { body: Buffer.concat(cuerpo) } : {}),
        });

        const respuesta = await manejar(peticion, env);
        res.statusCode = respuesta.status;
        respuesta.headers.forEach((valor, clave) => res.setHeader(clave, valor));
        res.end(Buffer.from(await respuesta.arrayBuffer()));
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  /*
   * Las del Worker, no las del bundle: van sin el prefijo `VITE_` a propósito,
   * porque no se hornean en el JavaScript que baja al navegador. Salen del mismo
   * `.env` de la raíz que ya usan el seed y los scripts de base.
   */
  const entorno = loadEnv(mode, raiz, '');

  return {
    plugins: [
      react(),
      tailwindcss(),
      workerDelAdmin({
        SUPABASE_URL: entorno.SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY: entorno.SUPABASE_PUBLISHABLE_KEY,
        PICK_AI_MASTER_KEY: entorno.PICK_AI_MASTER_KEY,
      }),
    ],
    resolve: {
      /*
       * Mismo alias que `paths` en tsconfig. Va con `fileURLToPath` y no con
       * `.pathname`: en Windows, con espacios en la ruta del repo, `.pathname`
       * devuelve "/C:/.../Pick%20commerce" y el build falla con os error 123.
       */
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    /*
     * El `.env` vive en la raíz del monorepo, no en esta app: es el mismo que
     * usan el seed y los scripts de base. Sin esto, `pnpm dev` levantaría el
     * Admin mostrando "falta configuración" con las variables ya definidas.
     */
    envDir: raiz,
    server: { port: 5273 },
  };
});
