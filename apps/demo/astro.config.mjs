// @ts-check
import { fileURLToPath } from 'node:url';
import { defineConfig, envField } from 'astro/config';
import preact from '@astrojs/preact';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  /*
   * Sin `site` el canonical sale relativo —y un buscador lo ignora— y no se
   * puede generar el sitemap. Cada storefront declara el suyo; se puede
   * sobreescribir por entorno para los previews.
   */
  site: process.env.SITE_URL ?? 'https://pick-demo.pages.dev',
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
      SUPABASE_URL: envField.string({ context: 'server', access: 'secret' }),
      /* Saltea RLS. Nunca en el bundle del cliente. Ver ADR-052. */
      SUPABASE_SECRET_KEY: envField.string({ context: 'server', access: 'secret' }),
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
