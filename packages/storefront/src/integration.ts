import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';

/**
 * Lo que todas las tiendas comparten, servido en el dominio de cada una
 * (ADR-165).
 *
 * Hasta acá demo y Treeshop copiaban cada página del checkout y cada archivo de
 * `lib/`, byte a byte, y un arreglo tenía que entrar dos veces. Ahora el código
 * vive en este paquete y la integración **inyecta las rutas**: la app declara su
 * dominio y sus estilos, y nada más.
 *
 * `injectRoute` acepta un especificador de paquete como `entrypoint` siempre que
 * el `package.json` lo exporte, y `updateConfig` suma plugins de Vite al de la
 * app: es lo que arma los dos módulos virtuales. Los dos están en la doc de la
 * API de integraciones de Astro:
 * https://docs.astro.build/en/reference/integrations-reference/
 */
export interface OpcionesDelStorefront {
  /** `stores.domain` cuando no hay `STOREFRONT_DOMAIN`, para que `astro dev` ande solo. */
  readonly dominio: string;
  /** La hoja de estilos de la app —sus tokens y su preset—, como URL o ruta absoluta. */
  readonly estilos: string | URL;
}

/** Las rutas del checkout. El patrón es la URL; el archivo, el del paquete. */
const RUTAS = [
  ['/checkout', 'checkout/index.astro'],
  ['/checkout/confirmacion', 'checkout/confirmacion.astro'],
  ['/pago/simulado', 'pago/simulado.astro'],
  ['/api/checkout', 'api/checkout.ts'],
  ['/api/cart/validate', 'api/cart/validate.ts'],
  ['/api/webhooks/pago', 'api/webhooks/pago.ts'],
] as const;

const VIRTUAL = 'virtual:pick/storefront';
const ESTILOS = 'virtual:pick/estilos';

export default function pickStorefront(opciones: OpcionesDelStorefront): AstroIntegration {
  // `fileURLToPath` y no `pathname`: éste deja los espacios como «%20» —el build
  // no encontraba el archivo— y, en Windows, la unidad como «/C:/».
  const ruta = (
    opciones.estilos instanceof URL ? fileURLToPath(opciones.estilos) : opciones.estilos
  ).replaceAll('\\', '/');

  return {
    name: '@pick/storefront',
    hooks: {
      'astro:config:setup': ({ injectRoute, updateConfig }) => {
        for (const [pattern, archivo] of RUTAS) {
          // `prerender: false` acá y no como export en cada archivo: fuera de `pages/`
          // el lint lo rechaza, y la doc ofrece esta opción. Sin ella, con la salida
          // estática por defecto, el checkout se prerenderizaría al construir.
          injectRoute({
            pattern,
            entrypoint: `@pick/storefront/rutas/${archivo}`,
            prerender: false,
          });
        }
        updateConfig({
          vite: {
            plugins: [
              {
                name: 'pick-storefront-virtual',
                resolveId(id: string) {
                  if (id === VIRTUAL || id === ESTILOS) return `\0${id}`;
                  return undefined;
                },
                load(id: string) {
                  if (id === `\0${VIRTUAL}`) {
                    return `export const DOMINIO_POR_DEFECTO = ${JSON.stringify(opciones.dominio)};`;
                  }
                  if (id === `\0${ESTILOS}`) return `import ${JSON.stringify(ruta)};`;
                  return undefined;
                },
              },
            ],
          },
        });
      },
    },
  };
}
