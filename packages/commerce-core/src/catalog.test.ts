import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Product, ProductVariant } from '@pick/commerce-types';
import { buildFacets, lowestPrice, queryCatalog } from './catalog.ts';
import { money } from './money.ts';

function variant(id: string, attrs: Record<string, string>, price: number): ProductVariant {
  return {
    id,
    sku: `SKU-${id}`,
    title: id,
    price: money(price, 'PYG'),
    availableQuantity: 5,
    attributes: attrs,
  };
}

function product(id: string, title: string, brand: string, variants: ProductVariant[]): Product {
  return {
    tenantId: 't',
    storeId: 's',
    id,
    handle: id,
    title,
    brand,
    status: 'active',
    images: [],
    variants,
  };
}

const catalog: Product[] = [
  product('p1', 'Campera azul', 'Norte', [variant('a', { color: 'Azul', size: 'M' }, 300)]),
  product('p2', 'Campera negra', 'Norte', [variant('b', { color: 'Negro', size: 'M' }, 500)]),
  product('p3', 'Zapatilla negra', 'Ruta', [variant('c', { color: 'Negro', size: '41' }, 100)]),
];

test('filtra por atributo y por marca', () => {
  assert.deepEqual(
    queryCatalog(catalog, { filters: { color: ['Negro'] } }).items.map((p) => p.id),
    ['p2', 'p3'],
  );
  assert.deepEqual(
    queryCatalog(catalog, { filters: { brand: ['Ruta'] } }).items.map((p) => p.id),
    ['p3'],
  );
});

test('varios valores de una faceta son OR; facetas distintas son AND', () => {
  assert.equal(queryCatalog(catalog, { filters: { color: ['Azul', 'Negro'] } }).total, 3);
  assert.equal(queryCatalog(catalog, { filters: { color: ['Negro'], brand: ['Norte'] } }).total, 1);
});

test('el count de una faceta ignora su propia selección', () => {
  // Con "Negro" activo, la faceta color debe seguir mostrando cuántos hay en
  // Azul: si se aplicara su propio filtro, Azul daría 0 y sería inseleccionable.
  const facets = buildFacets(catalog, { color: ['Negro'] });
  const color = facets.find((f) => f.name === 'color');
  assert.deepEqual(color?.values, [
    { value: 'Azul', count: 1, selected: false },
    { value: 'Negro', count: 2, selected: true },
  ]);

  // La faceta brand sí respeta el filtro de color, que es de otra faceta.
  const brand = facets.find((f) => f.name === 'brand');
  assert.deepEqual(brand?.values, [
    { value: 'Norte', count: 1, selected: false },
    { value: 'Ruta', count: 1, selected: false },
  ]);
});

test('ordena por precio usando la variante más barata', () => {
  assert.deepEqual(
    queryCatalog(catalog, { sort: 'price-asc' }).items.map((p) => p.id),
    ['p3', 'p1', 'p2'],
  );
  assert.deepEqual(
    queryCatalog(catalog, { sort: 'price-desc' }).items.map((p) => p.id),
    ['p2', 'p1', 'p3'],
  );
  assert.equal(lowestPrice(catalog[0]!)?.amount, 300);
});

test('la búsqueda cruza título, marca y SKU, y exige todos los términos', () => {
  assert.equal(queryCatalog(catalog, { search: 'campera' }).total, 2);
  assert.equal(queryCatalog(catalog, { search: 'campera negra' }).total, 1);
  assert.equal(queryCatalog(catalog, { search: 'ruta' }).total, 1);
  assert.equal(queryCatalog(catalog, { search: 'SKU-c' }).total, 1);
  assert.equal(queryCatalog(catalog, { search: '   ' }).total, 3);
});

test('pagina y acota una página fuera de rango a la última con resultados', () => {
  const page2 = queryCatalog(catalog, { perPage: 2, page: 2 });
  assert.deepEqual(
    page2.items.map((p) => p.id),
    ['p3'],
  );
  assert.equal(page2.pageCount, 2);

  // Pasa al sacar filtros estando en una página alta: devuelve la última, no vacío.
  const fuera = queryCatalog(catalog, { perPage: 2, page: 99 });
  assert.equal(fuera.page, 2);
  assert.equal(fuera.items.length, 1);

  const cero = queryCatalog(catalog, { perPage: 2, page: 0 });
  assert.equal(cero.page, 1);
});

test('un filtro sin resultados devuelve vacío pero conserva las facetas', () => {
  const r = queryCatalog(catalog, { filters: { color: ['Fucsia'] } });
  assert.equal(r.total, 0);
  assert.equal(r.items.length, 0);
  assert.equal(r.pageCount, 1);
  // Sin facetas el usuario no podría deshacer el filtro desde la UI.
  assert.ok(r.facets.length > 0);
});

test('la categoría es una faceta de producto, como la marca', () => {
  const conCategoria: Product[] = [
    { ...catalog[0]!, categoryId: 'camperas' },
    { ...catalog[1]!, categoryId: 'camperas' },
    { ...catalog[2]!, categoryId: 'calzado' },
  ];

  assert.deepEqual(
    queryCatalog(conCategoria, { filters: { categoria: ['calzado'] } }).items.map((p) => p.id),
    ['p3'],
  );

  const facetas = buildFacets(conCategoria);
  const categoria = facetas.find((f) => f.name === 'categoria');
  assert.deepEqual(categoria?.values, [
    { value: 'camperas', count: 2, selected: false },
    { value: 'calzado', count: 1, selected: false },
  ]);
});

test('un producto sin categoría no rompe la faceta', () => {
  // El catálogo base no declara categoryId en ningún producto.
  assert.equal(
    buildFacets(catalog).find((f) => f.name === 'categoria'),
    undefined,
  );
});

// --- Orden por novedad y por ventas ------------------------------------------

const conDatos: Product[] = [
  { ...product('viejo', 'Viejo', 'N', []), createdAt: '2026-01-01T00:00:00Z', unitsSold: 9 },
  { ...product('nuevo', 'Nuevo', 'N', []), createdAt: '2026-08-01T00:00:00Z', unitsSold: 1 },
  { ...product('medio', 'Medio', 'N', []), createdAt: '2026-05-01T00:00:00Z', unitsSold: 5 },
];

test('«novedades» ordena por fecha descendente', () => {
  assert.deepEqual(
    queryCatalog(conDatos, { sort: 'newest' }).items.map((p) => p.id),
    ['nuevo', 'medio', 'viejo'],
  );
});

test('«más vendidos» ordena por unidades descendente', () => {
  assert.deepEqual(
    queryCatalog(conDatos, { sort: 'best-selling' }).items.map((p) => p.id),
    ['viejo', 'medio', 'nuevo'],
  );
});

test('lo que no tiene fecha ni ventas cae al final, no al principio', () => {
  // Con `Date.parse(undefined ?? '')` la resta daba NaN y el comparador decía
  // "son iguales", así que el producto sin fecha se quedaba donde estaba.
  const conHuecos: Product[] = [product('sin', 'Sin datos', 'N', []), ...conDatos];

  assert.equal(queryCatalog(conHuecos, { sort: 'newest' }).items.at(-1)!.id, 'sin');
  assert.equal(queryCatalog(conHuecos, { sort: 'best-selling' }).items.at(-1)!.id, 'sin');
});
