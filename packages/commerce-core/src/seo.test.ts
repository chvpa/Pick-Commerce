import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Product } from '@pick/commerce-types';
import {
  AI_CRAWLERS,
  faqJsonLd,
  itemListJsonLd,
  llmsTxt,
  organizationJsonLd,
  productJsonLd,
  robotsTxt,
} from './seo.ts';
import { money } from './money.ts';

const CTX = { siteUrl: 'https://tienda.example', storeName: 'Tienda' } as const;

const producto: Product = {
  tenantId: 't',
  storeId: 's',
  id: 'p1',
  handle: 'campera',
  title: 'Campera cortaviento',
  description: 'Liviana e impermeable',
  brand: 'Norte',
  status: 'active',
  images: [{ url: '/products/campera.jpg', alt: 'Campera', width: 900, height: 1200 }],
  variants: [
    {
      id: 'v1',
      sku: 'CAM-M',
      title: 'M',
      price: money(389000, 'PYG'),
      availableQuantity: 4,
      attributes: { size: 'M' },
    },
    {
      id: 'v2',
      sku: 'CAM-L',
      title: 'L',
      price: money(410000, 'PYG'),
      availableQuantity: 0,
      attributes: { size: 'L' },
    },
  ],
};

test('productJsonLd emite una oferta por variante con su precio y stock reales', () => {
  const ld = productJsonLd(producto, CTX);
  const offers = ld.offers as Record<string, unknown>[];

  assert.equal(ld['@type'], 'Product');
  assert.equal(offers.length, 2);

  assert.equal(offers[0]?.sku, 'CAM-M');
  assert.equal(offers[0]?.price, '389000');
  assert.equal(offers[0]?.priceCurrency, 'PYG');
  assert.equal(offers[0]?.availability, 'https://schema.org/InStock');

  // La variante agotada NO puede declararse disponible.
  assert.equal(offers[1]?.availability, 'https://schema.org/OutOfStock');
});

test('las URLs del JSON-LD son absolutas', () => {
  const ld = productJsonLd(producto, CTX);
  assert.equal(ld.url, 'https://tienda.example/productos/campera/');
  assert.deepEqual(ld.image, ['https://tienda.example/products/campera.jpg']);
});

test('el precio va en unidades mayores, no en la unidad mínima', () => {
  const usd: Product = {
    ...producto,
    variants: [{ ...producto.variants[0]!, price: money(19.99, 'USD') }],
  };
  const offers = productJsonLd(usd, CTX).offers as Record<string, unknown>[];
  // 1999 centavos deben salir como "19.99", no como "1999".
  assert.equal(offers[0]?.price, '19.99');
});

test('no inventa campos que el producto no tiene', () => {
  const pelado: Product = {
    ...producto,
    description: undefined,
    brand: undefined,
    images: [],
  };
  const ld = productJsonLd(pelado, CTX);
  assert.ok(!('description' in ld));
  assert.ok(!('brand' in ld));
  assert.ok(!('image' in ld));
});

test('el SKU de producto sólo aparece cuando hay una sola variante', () => {
  assert.ok(!('sku' in productJsonLd(producto, CTX)));

  const unica: Product = { ...producto, variants: [producto.variants[0]!] };
  assert.equal(productJsonLd(unica, CTX).sku, 'CAM-M');
});

test('itemListJsonLd numera desde 1 y usa URLs absolutas', () => {
  const ld = itemListJsonLd([producto, producto], CTX, 'Catálogo');
  const items = ld.itemListElement as Record<string, unknown>[];
  assert.equal(ld.numberOfItems, 2);
  assert.equal(items[0]?.position, 1);
  assert.equal(items[1]?.position, 2);
  assert.equal(items[0]?.url, 'https://tienda.example/productos/campera/');
});

test('organizationJsonLd usa el nombre y la URL del store', () => {
  const ld = organizationJsonLd(CTX);
  assert.equal(ld.name, 'Tienda');
  assert.equal(ld.url, 'https://tienda.example');
});

test('llmsTxt respeta el formato del spec y no vuelca el catálogo', () => {
  const txt = llmsTxt({
    ctx: CTX,
    resumen: 'Ropa técnica',
    secciones: [
      {
        titulo: 'Catálogo',
        enlaces: [{ texto: 'Todos los productos', ruta: '/catalogo', nota: 'con filtros' }],
      },
    ],
  });

  const lineas = txt.split('\n');
  // El H1 con el nombre del sitio es lo único obligatorio del spec.
  assert.equal(lineas[0], '# Tienda');
  assert.equal(lineas[2], '> Ropa técnica');
  assert.ok(txt.includes('## Catálogo'));
  assert.ok(txt.includes('- [Todos los productos](https://tienda.example/catalogo/): con filtros'));
});

test('robotsTxt permite crawlers de IA por defecto', () => {
  const txt = robotsTxt({ ctx: CTX });
  assert.ok(txt.startsWith('User-agent: *\nAllow: /'));
  // Ninguno bloqueado: el default es dejar entrar.
  for (const bot of AI_CRAWLERS) assert.ok(!txt.includes(`User-agent: ${bot}`), bot);
  assert.ok(txt.includes('Sitemap: https://tienda.example/sitemap-index.xml'));
});

test('robotsTxt bloquea cada crawler por nombre cuando el flag está apagado', () => {
  const txt = robotsTxt({ ctx: CTX, allowAiCrawlers: false });
  // Un `User-agent: *` no alcanza: varios sólo obedecen su propio nombre.
  for (const bot of AI_CRAWLERS) {
    assert.ok(txt.includes(`User-agent: ${bot}\nDisallow: /`), `falta bloquear ${bot}`);
  }
});

test('robotsTxt excluye las rutas privadas que se le indiquen', () => {
  const txt = robotsTxt({ ctx: CTX, disallow: ['/carrito', '/checkout'] });
  assert.ok(txt.includes('Disallow: /carrito'));
  assert.ok(txt.includes('Disallow: /checkout'));
});

test('las URLs siguen la política de barra final del sitio', () => {
  // Astro con build.format 'directory' —su default— emite /productos/x/ en el
  // canonical, el og:url y el sitemap. El JSON-LD tiene que decir lo mismo.
  const ld = productJsonLd(producto, CTX);
  assert.equal(ld.url, 'https://tienda.example/productos/campera/');

  // Un archivo con extensión no lleva barra: /campera.jpg/ no existe.
  assert.deepEqual(ld.image, ['https://tienda.example/products/campera.jpg']);

  // Un sitio configurado sin barra final obtiene la otra forma.
  const sinBarra = productJsonLd(producto, { ...CTX, trailingSlash: false });
  assert.equal(sinBarra.url, 'https://tienda.example/productos/campera');
});

test('una ruta con query no recibe barra final', () => {
  const txt = llmsTxt({
    ctx: CTX,
    resumen: 'x',
    secciones: [
      {
        titulo: 'Categorías',
        enlaces: [{ texto: 'Camperas', ruta: '/catalogo?categoria=camperas' }],
      },
    ],
  });
  assert.ok(txt.includes('https://tienda.example/catalogo?categoria=camperas'));
  assert.ok(!txt.includes('/catalogo/?categoria'));
});

test('faqJsonLd arma pares pregunta/respuesta delimitados', () => {
  const ld = faqJsonLd([
    { pregunta: '¿Hacen envíos?', respuesta: 'Sí, a todo el país.' },
    { pregunta: '¿Puedo cambiar?', respuesta: 'Dentro de los 30 días.' },
  ]);

  assert.equal(ld['@type'], 'FAQPage');
  const entidades = ld.mainEntity as Record<string, unknown>[];
  assert.equal(entidades.length, 2);
  assert.equal(entidades[0]?.['@type'], 'Question');
  assert.equal(entidades[0]?.name, '¿Hacen envíos?');
  assert.deepEqual(entidades[0]?.acceptedAnswer, {
    '@type': 'Answer',
    text: 'Sí, a todo el país.',
  });
});
