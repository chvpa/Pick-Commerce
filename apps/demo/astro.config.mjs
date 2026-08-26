// @ts-check
import { fileURLToPath } from 'node:url';
import { defineConfig, envField } from 'astro/config';
import preact from '@astrojs/preact';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

/**
 * Dirección pública del sitio.
 *
 * Acepta que `SITE_URL` venga como dominio suelto —que es como uno lo escribe—
 * y le agrega el esquema: `site` exige una URL completa, y sin ella el build
 * muere con un «Invalid URL» que no dice cuál. Una variable vacía cuenta como
 * ausente, porque en un `.env` es lo mismo que no haberla puesto.
 */
function direccionPublica() {
  const crudo = process.env.SITE_URL?.trim();
  if (!crudo) return 'https://pick-commerce.chvpa-contacto.workers.dev';
  return /^https?:\/\//.test(crudo) ? crudo : `https://${crudo}`;
}

// https://astro.build/config
export default defineConfig({
  /*
   * Sin `site` el canonical sale relativo —y un buscador lo ignora— y no se
   * puede generar el sitemap. Cada storefront declara el suyo; se puede
   * sobreescribir por entorno para los previews.
   *
   * Es la dirección **pública** del sitio, de donde salen el canonical, el
   * `og:url`, el JSON-LD y el sitemap. No confundir con `STOREFRONT_DOMAIN`, que
   * es la llave con la que el Worker busca la tienda en `stores.domain`: pueden
   * ser distintas y hoy lo son. Cuando la demo tenga dominio propio, se cambian
   * las dos.
   */
  site: direccionPublica(),
  // Estático por defecto: sólo las rutas que declaren `prerender = false`
  // se resuelven on-demand en el Worker. Ver ADR-001 y ADR-006.
  adapter: cloudflare(),
  /*
   * El sitemap ya no lo genera `@astrojs/sitemap`: esa integración sólo conoce
   * las rutas que existen al construir, y desde ADR-057 los productos se
   * resuelven on-demand. Un sitemap que no lista productos no sirve de nada, así
   * que se emite desde la base en `sitemap-0.xml.ts`.
   */
  integrations: [preact()],
  env: {
    schema: {
      /*
       * `secret` y no `public` aunque una URL no sea un secreto: las públicas se
       * incrustan al construir, y este mismo artefacto tiene que poder correr
       * contra el Supabase local del CI y contra el remoto sin reconstruirse.
       * Las secretas se leen en runtime.
       */
      /*
       * `optional` no porque puedan faltar —sin ellas el sitio no funciona—,
       * sino porque Astro valida **todos** los secretos declarados al cargar el
       * módulo `astro:env/server`, aunque nadie los importe. Con una ausente,
       * eso es un 500 con el cuerpo vacío, imposible de interceptar y que no
       * dice qué falta. Declaradas opcionales, la comprobación la hace
       * `src/middleware.ts`, que sí puede decirlo.
       */
      SUPABASE_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      /* Saltea RLS. Nunca en el bundle del cliente. Ver ADR-052. */
      SUPABASE_SECRET_KEY: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      /*
       * Qué tienda sirve este deploy. El default es el dominio de la demo, así
       * que `astro dev` y el CI funcionan sin configurar nada.
       */
      STOREFRONT_DOMAIN: envField.string({
        context: 'server',
        access: 'public',
        default: 'pick-demo.pages.dev',
      }),
    },
  },
  vite: {
    plugins: [tailwindcss()],
    /*
     * El `.env` vive en la raíz del monorepo, no en esta app: es el mismo que
     * usan el seed y los scripts de base. Sin esto, `astro dev` no encontraría
     * las credenciales y la home respondería 500.
     */
    envDir: fileURLToPath(new URL('../../', import.meta.url)),
  },
  server: { port: 4321 },
});
