// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
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
  integrations: [
    preact(),
    sitemap({
      // El catálogo se excluye: sus variantes filtradas son la misma colección
      // con otro orden, y listarlas dispersa la autoridad de la página.
      filter: (page) => !page.includes('/catalogo'),
    }),
  ],
  vite: { plugins: [tailwindcss()] },
  server: { port: 4321 },
});
