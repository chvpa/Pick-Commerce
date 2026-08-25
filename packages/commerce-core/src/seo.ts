import type { Product } from '@pick/commerce-types';
import { toMajorUnits } from './money.ts';

/**
 * Generación de JSON-LD para schema.org.
 *
 * Vive en el core y no en un componente `.astro` por dos motivos: se testea, y
 * el mismo dato lo van a necesitar el sitemap, el feed de producto y el
 * `llms.txt`. Un objeto plano es más fácil de verificar que markup.
 *
 * Regla que no se negocia: **el JSON-LD no puede afirmar lo que no sabemos.**
 * Un `availability` inventado o un precio desactualizado son una promesa falsa
 * a un motor de búsqueda, y en comercio eso se paga con el cliente enojado.
 */

export interface SeoContexto {
  /** Origen absoluto del storefront, sin barra final. */
  readonly siteUrl: string;
  readonly storeName: string;
  /**
   * Si las URLs del sitio llevan barra final. Tiene que coincidir con lo que
   * emite el framework: Astro con `build.format: 'directory'` —su default—
   * genera `/productos/x/`, y el canonical, el og:url y el sitemap también.
   * Si el JSON-LD dijera `/productos/x`, serían dos URLs distintas para la
   * misma página y el buscador recibe señales contradictorias.
   */
  readonly trailingSlash?: boolean;
}

const SCHEMA = 'https://schema.org';

function absoluta(ctx: SeoContexto, ruta: string): string {
  const url = new URL(ruta, ctx.siteUrl);

  // Ni la raíz, ni un archivo con extensión, ni una ruta con query llevan
  // barra final: `/products/x.jpg/` no existe y `/catalogo/?c=1` no es lo que
  // emite el framework.
  const agregar =
    ctx.trailingSlash !== false &&
    url.pathname !== '/' &&
    !url.pathname.endsWith('/') &&
    !/\.[a-z0-9]+$/i.test(url.pathname) &&
    url.search === '';

  if (agregar) url.pathname += '/';
  return url.href;
}

/** schema.org sólo distingue disponible, agotado y preventa. */
function disponibilidad(cantidad: number): string {
  return cantidad > 0 ? `${SCHEMA}/InStock` : `${SCHEMA}/OutOfStock`;
}

export function productJsonLd(product: Product, ctx: SeoContexto): Record<string, unknown> {
  const url = absoluta(ctx, `/productos/${product.handle}`);

  // Una oferta por variante, con su SKU y su precio real. Es más preciso que un
  // rango: si una talla cuesta distinto o está agotada, se dice.
  const offers = product.variants.map((variant) => ({
    '@type': 'Offer',
    sku: variant.sku,
    price: String(toMajorUnits(variant.price)),
    priceCurrency: variant.price.currency,
    availability: disponibilidad(variant.availableQuantity),
    itemCondition: `${SCHEMA}/NewCondition`,
    url,
    ...(variant.barcode ? { gtin: variant.barcode } : {}),
  }));

  return {
    '@context': SCHEMA,
    '@type': 'Product',
    name: product.title,
    url,
    ...(product.description ? { description: product.description } : {}),
    ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
    ...(product.images.length > 0
      ? { image: product.images.map((img) => absoluta(ctx, img.url)) }
      : {}),
    // El SKU del producto es el de su primera variante sólo si hay una sola;
    // con varias, el SKU vive en cada oferta.
    ...(product.variants.length === 1 && product.variants[0]
      ? { sku: product.variants[0].sku }
      : {}),
    offers,
  };
}

/** Listado de productos de una PLP. Ayuda a un motor a entender la colección. */
export function itemListJsonLd(
  products: readonly Product[],
  ctx: SeoContexto,
  nombre: string,
): Record<string, unknown> {
  return {
    '@context': SCHEMA,
    '@type': 'ItemList',
    name: nombre,
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: absoluta(ctx, `/productos/${product.handle}`),
      name: product.title,
    })),
  };
}

export function organizationJsonLd(ctx: SeoContexto): Record<string, unknown> {
  return {
    '@context': SCHEMA,
    '@type': 'Organization',
    name: ctx.storeName,
    url: ctx.siteUrl,
  };
}

/**
 * Índice para agentes de IA, según llmstxt.org: un H1 con el nombre del sitio y
 * secciones H2 con links en markdown.
 *
 * No lista cada producto a propósito. Un catálogo grande haría un archivo
 * inmanejable, y el spec pide contenido curado, no un volcado. Las páginas de
 * catálogo y las categorías le dan al agente por dónde entrar.
 */
export function llmsTxt(options: {
  readonly ctx: SeoContexto;
  readonly resumen: string;
  readonly secciones: readonly {
    readonly titulo: string;
    readonly enlaces: readonly {
      readonly texto: string;
      readonly ruta: string;
      readonly nota?: string;
    }[];
  }[];
}): string {
  const { ctx, resumen, secciones } = options;
  const lineas = [`# ${ctx.storeName}`, '', `> ${resumen}`, ''];

  for (const seccion of secciones) {
    lineas.push(`## ${seccion.titulo}`, '');
    for (const enlace of seccion.enlaces) {
      const url = absoluta(ctx, enlace.ruta);
      lineas.push(`- [${enlace.texto}](${url})${enlace.nota ? `: ${enlace.nota}` : ''}`);
    }
    lineas.push('');
  }

  return lineas.join('\n');
}

/** Crawlers de IA que hoy declaran user-agent propio y respetan robots.txt. */
export const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ClaudeBot',
  'PerplexityBot',
  'Google-Extended',
  'Applebot-Extended',
  'meta-externalagent',
  'Bytespider',
] as const;

export interface RobotsOptions {
  readonly ctx: SeoContexto;
  /**
   * Si el comercio deja entrar a los crawlers de IA. Por defecto sí: un
   * comercio quiere que le encuentren los productos. Es decisión comercial, no
   * técnica, así que va por feature flag del tenant.
   */
  readonly allowAiCrawlers?: boolean;
  /** Rutas que no deben indexarse: carrito, checkout, cuenta. */
  readonly disallow?: readonly string[];
}

export function robotsTxt({ ctx, allowAiCrawlers = true, disallow = [] }: RobotsOptions): string {
  const lineas = ['User-agent: *', 'Allow: /'];
  for (const ruta of disallow) lineas.push(`Disallow: ${ruta}`);

  if (!allowAiCrawlers) {
    // Un bloque por crawler: `User-agent: *` no alcanza, varios de estos sólo
    // obedecen una regla dirigida a su propio nombre.
    for (const bot of AI_CRAWLERS) {
      lineas.push('', `User-agent: ${bot}`, 'Disallow: /');
    }
  }

  lineas.push('', `Sitemap: ${new URL('/sitemap-index.xml', ctx.siteUrl).href}`);
  return lineas.join('\n') + '\n';
}

export interface Pregunta {
  readonly pregunta: string;
  readonly respuesta: string;
}

/**
 * `FAQPage` de schema.org.
 *
 * Es de los tipos que más aprovechan los motores generativos: entrega pares
 * pregunta/respuesta ya delimitados, sin que el modelo tenga que inferir dónde
 * termina una respuesta. Para un comercio, define qué se contesta sobre envíos,
 * cambios y pagos cuando alguien le pregunta a una IA en vez de al buscador.
 */
export function faqJsonLd(preguntas: readonly Pregunta[]): Record<string, unknown> {
  return {
    '@context': SCHEMA,
    '@type': 'FAQPage',
    mainEntity: preguntas.map((p) => ({
      '@type': 'Question',
      name: p.pregunta,
      acceptedAnswer: { '@type': 'Answer', text: p.respuesta },
    })),
  };
}
