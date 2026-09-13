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
  if (!crudo) return 'https://sontres.shop';
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
  /*
   * Qué hosts de imágenes se pueden optimizar.
   *
   * Astro **sólo** procesa imágenes remotas de hosts autorizados; las de otros
   * lados se sirven tal cual. Sin esta lista, el `<Image />` del catálogo emitía
   * un `srcset` de ocho candidatos que apuntaban todos al mismo archivo: la
   * apariencia de optimizar sin optimizar nada (ADR-079).
   *
   * El comodín cubre cualquier proyecto de Supabase porque la URL del bucket se
   * lee en runtime y acá se decide al construir. El `pathname` lo acota a los
   * objetos públicos de un bucket llamado `product-media`; el alcance de eso
   * está en ADR-082, y se cierra el día que haya un dominio de medios propio.
   */
  image: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/product-media/**',
      },
    ],
  },
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
       * La clave pública. No saltea RLS, y es la que usa el único camino de este
       * sitio donde RLS decide de verdad: la sesión del comprador (ADR-121).
       * `optional` por el mismo motivo que las otras: Astro valida todos los
       * secretos declarados al cargar el módulo, y una ausente sería un 500 con
       * el cuerpo vacío en vez de la pantalla que dice qué falta.
       */
      SUPABASE_PUBLISHABLE_KEY: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      /*
       * Qué tienda sirve este deploy.
       *
       * `secret` y no `public` **aunque un dominio no sea secreto**: en
       * `astro:env` lo público se incrusta al construir, y esta variable salía
       * en el bundle como `var STOREFRONT_DOMAIN = "pick-demo.pages.dev"`,
       * literal. Cargarla en el Worker no hacía nada, y el script `deploy` del
       * paquete no reconstruye: desplegar un segundo comercio con el `dist` del
       * primero le habría servido el catálogo del primero, y desde la Fase 5 le
       * habría escrito los pedidos **dentro del tenant equivocado**. Silencioso,
       * y RLS no lo ve porque este camino usa la secret key.
       *
       * `optional` para conservar lo que el default daba: `astro dev` y el CI
       * siguen funcionando sin configurar nada. El valor por defecto vive ahora
       * en `src/lib/db.ts`, que es quien la usa.
       */
      STOREFRONT_DOMAIN: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      /*
       * Correos transaccionales y cobro por gateway.
       *
       * `optional` como el resto, y además porque su ausencia **degrada** en vez
       * de romper: sin `RESEND_API_KEY` la cola de avisos crece y nadie recibe
       * correo, sin `PAYMENT_WEBHOOK_SECRET` el método de tarjeta no se ofrece.
       * En los dos casos se sigue pudiendo comprar, así que no van a las
       * variables que el middleware exige.
       */
      RESEND_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      /* Sin dominio verificado en Resend, sólo sirve el remitente de prueba. */
      EMAIL_FROM: envField.string({ context: 'server', access: 'secret', optional: true }),
      /* Firma los avisos del gateway simulado. Sin él, no hay pago con tarjeta. */
      PAYMENT_WEBHOOK_SECRET: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
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
  // 4321 lo tiene la demo, y `pnpm dev` corre las apps en paralelo.
  server: { port: 4322 },
});
