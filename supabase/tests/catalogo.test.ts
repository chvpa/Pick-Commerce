import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import type { CatalogQuery, CatalogResult } from '@pick/commerce-core';
import { queryCatalog } from '@pick/commerce-core';
import type { Product } from '@pick/commerce-types';
import { baseDePrueba, intentar } from './harness.ts';

/**
 * Paridad entre `catalog_search` y `queryCatalog`.
 *
 * `queryCatalog` es la **especificación ejecutable** de la semántica del
 * catálogo: 20 tests fijan su comportamiento y el comentario del código dice
 * que en Fase 4 el cuerpo pasa a SQL "y la firma no cambia". Este archivo
 * verifica que efectivamente no cambió el comportamiento.
 *
 * Existe por ADR-050: cuando el modo de fallo de una optimización es
 * silencioso, la verificación tiene que ser exhaustiva y no ilustrativa. Un
 * count de faceta mal calculado en SQL no rompe nada — sólo muestra un número
 * equivocado, y nadie se entera.
 */

const TENANT = 'aa000000-0000-4000-8000-000000000000';
const STORE = 'bb000000-0000-4000-8000-000000000000';
const LOCATION = 'cc000000-0000-4000-8000-000000000000';
const OTRO_TENANT = 'af000000-0000-4000-8000-000000000000';
const OTRO_STORE = 'bf000000-0000-4000-8000-000000000000';

const DUENO = 'a1000000-0000-4000-8000-000000000000';
const VIEWER = 'a2000000-0000-4000-8000-000000000000';
const AJENO = 'a3000000-0000-4000-8000-000000000000';

/** UUID estable a partir de un índice, para que el seed sea reproducible. */
function uuid(prefijo: string, n: number): string {
  return `${prefijo}${String(n).padStart(6, '0')}-0000-4000-8000-000000000000`;
}

function sql(valor: string | null | undefined): string {
  return valor === null || valor === undefined ? 'null' : `'${valor.replace(/'/g, "''")}'`;
}

/**
 * Baja fixtures `Product[]` a la base.
 *
 * Los `created_at` son crecientes y explícitos: fijan el orden de "relevance" y
 * el de descubrimiento de facetas, que en el core son el orden del array.
 */
async function insertarProductos(db: PGlite, productos: readonly Product[]): Promise<void> {
  const categorias = [...new Set(productos.map((p) => p.categoryId).filter(Boolean))] as string[];

  for (const [i, slug] of categorias.entries()) {
    await db.exec(
      `insert into categories (id, tenant_id, store_id, name, slug, position)
       values ('${uuid('c1', i)}', '${TENANT}', '${STORE}', ${sql(slug)}, ${sql(slug)}, ${i})`,
    );
  }

  for (const [i, p] of productos.entries()) {
    const catId = p.categoryId ? `'${uuid('c1', categorias.indexOf(p.categoryId))}'` : 'null';
    const fecha = `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`;

    await db.exec(
      `insert into products (id, tenant_id, store_id, handle, title, description, brand,
                             category_id, status, created_at)
       values ('${uuid('d1', i)}', '${TENANT}', '${STORE}', ${sql(p.handle)}, ${sql(p.title)},
               ${sql(p.description)}, ${sql(p.brand)}, ${catId}, '${p.status}', '${fecha}')`,
    );

    for (const [j, img] of p.images.entries()) {
      await db.exec(
        `insert into product_media (tenant_id, product_id, url, alt, width, height, position)
         values ('${TENANT}', '${uuid('d1', i)}', ${sql(img.url)}, ${sql(img.alt)},
                 ${img.width}, ${img.height}, ${j})`,
      );
    }

    for (const [j, v] of p.variants.entries()) {
      const idVariante = uuid('e1', i * 100 + j);
      await db.exec(
        `insert into product_variants (id, tenant_id, product_id, sku, barcode, title, position,
                                       price, currency, compare_at_price, cost, attributes)
         values ('${idVariante}', '${TENANT}', '${uuid('d1', i)}', ${sql(v.sku)}, ${sql(v.barcode)},
                 ${sql(v.title)}, ${j}, ${v.price.amount}, ${sql(v.price.currency)},
                 ${v.compareAtPrice ? v.compareAtPrice.amount : 'null'},
                 ${v.cost ? v.cost.amount : 'null'},
                 '${JSON.stringify(v.attributes)}'::jsonb)`,
      );
      await db.exec(
        `insert into inventory_levels (tenant_id, variant_id, location_id, available)
         values ('${TENANT}', '${idVariante}', '${LOCATION}', ${v.availableQuantity})`,
      );
    }
  }
}

/** Proyección al contrato compartido, para comparar manzanas con manzanas. */
function normalizar(r: CatalogResult) {
  return {
    handles: r.items.map((p) => p.handle),
    total: r.total,
    page: r.page,
    perPage: r.perPage,
    pageCount: r.pageCount,
    // El orden de la lista de facetas lo define `attribute_definitions.position`
    // en producción; en el core es el orden de iteración de un objeto de JS.
    // Se compara el contenido, que es lo que significa algo.
    facets: [...r.facets]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((f) => ({
        name: f.name,
        values: f.values.map((v) => `${v.value}:${v.count}:${v.selected ? 1 : 0}`),
      })),
  };
}

let db: PGlite;

/** Los mismos fixtures que usa `catalog.test.ts` del core. */
function variante(
  id: string,
  attrs: Record<string, string>,
  precio: number,
  qty = 5,
): Product['variants'][number] {
  return {
    id,
    sku: `SKU-${id}`,
    title: id,
    price: { amount: precio, currency: 'PYG' },
    availableQuantity: qty,
    attributes: attrs,
  };
}

function producto(
  id: string,
  title: string,
  brand: string,
  categoryId: string | undefined,
  variants: Product['variants'],
  status: Product['status'] = 'active',
): Product {
  return {
    tenantId: TENANT,
    storeId: STORE,
    id,
    handle: id,
    title,
    brand,
    ...(categoryId ? { categoryId } : {}),
    status,
    images: [],
    variants,
  };
}

const CATALOGO: Product[] = [
  producto('p1', 'Campera azul', 'Norte', 'camperas', [
    variante('a', { color: 'Azul', size: 'M' }, 300),
    variante('a2', { color: 'Negro', size: 'L' }, 350, 0),
  ]),
  producto('p2', 'Campera negra', 'Norte', 'camperas', [
    variante('b', { color: 'Negro', size: 'M' }, 500),
  ]),
  producto('p3', 'Zapatilla negra', 'Ruta', 'calzado', [
    variante('c', { color: 'Negro', size: '41' }, 100),
  ]),
  producto('p4', 'Mochila verde', 'Ruta', undefined, [variante('d', { color: 'Verde' }, 700)]),
];

const BORRADOR = producto(
  'p5',
  'Campera secreta',
  'Norte',
  'camperas',
  [variante('e', { color: 'Azul', size: 'S' }, 1)],
  'draft',
);

before(async () => {
  db = await baseDePrueba();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${DUENO}', 'dueno@x.test'), ('${VIEWER}', 'viewer@x.test'), ('${AJENO}', 'ajeno@x.test');
    insert into organizations (id, name, slug) values
      ('${TENANT}', 'Tienda', 'tienda'), ('${OTRO_TENANT}', 'Otra', 'otra');
    insert into stores (id, tenant_id, name, slug) values
      ('${STORE}', '${TENANT}', 'Principal', 'principal'),
      ('${OTRO_STORE}', '${OTRO_TENANT}', 'Ajena', 'ajena');
    insert into locations (id, tenant_id, store_id, name) values
      ('${LOCATION}', '${TENANT}', '${STORE}', 'Depósito');
    insert into memberships (tenant_id, user_id, role) values
      ('${TENANT}', '${DUENO}', 'owner'),
      ('${TENANT}', '${VIEWER}', 'viewer'),
      ('${OTRO_TENANT}', '${AJENO}', 'owner');
  `);
  await insertarProductos(db, [...CATALOGO, BORRADOR]);
});

after(async () => {
  await db.close();
});

async function porRpc(query: CatalogQuery): Promise<CatalogResult> {
  const r = await db.query<{ j: CatalogResult }>(
    `select catalog_search($1::uuid, $2::jsonb, $3, $4, $5, $6, $7, $8) as j`,
    [
      STORE,
      JSON.stringify(query.filters ?? {}),
      query.search ?? '',
      query.sort ?? 'relevance',
      query.page ?? 1,
      query.perPage ?? 24,
      query.precioMin ?? null,
      query.precioMax ?? null,
    ],
  );
  return r.rows[0]!.j;
}

/**
 * El contrato: `catalog_search(tienda, q)` ≡ `queryCatalog(activos(tienda), q)`.
 * El borrador se excluye del lado del core porque el RPC lo excluye por schema.
 */
async function verificarParidad(nombre: string, query: CatalogQuery): Promise<void> {
  const [rpc, core] = [await porRpc(query), queryCatalog(CATALOGO, query)];
  assert.deepEqual(
    normalizar(rpc),
    normalizar(core),
    `divergencia en «${nombre}» con ${JSON.stringify(query)}`,
  );
}

const CASOS: [string, CatalogQuery][] = [
  ['sin filtros', {}],
  ['un valor de faceta', { filters: { color: ['Negro'] } }],
  ['OR dentro de una faceta', { filters: { color: ['Negro', 'Azul'] } }],
  ['AND entre facetas', { filters: { color: ['Negro'], brand: ['Norte'] } }],
  ['faceta de marca', { filters: { brand: ['Ruta'] } }],
  ['faceta de categoría', { filters: { categoria: ['camperas'] } }],
  ['filtro sin resultados', { filters: { color: ['Fucsia'] } }],
  ['tres facetas a la vez', { filters: { color: ['Negro'], brand: ['Norte'], size: ['M'] } }],
  ['búsqueda simple', { search: 'campera' }],
  ['búsqueda multi-término', { search: 'campera negra' }],
  ['búsqueda por SKU', { search: 'SKU-c' }],
  ['búsqueda sin resultados', { search: 'inexistente' }],
  ['búsqueda con espacios', { search: '   ' }],
  ['búsqueda más filtro', { search: 'campera', filters: { color: ['Negro'] } }],
  ['orden por precio ascendente', { sort: 'price-asc' }],
  ['orden por precio descendente', { sort: 'price-desc' }],
  ['orden por título', { sort: 'title-asc' }],
  ['paginado', { perPage: 2, page: 1 }],
  ['segunda página', { perPage: 2, page: 2 }],
  ['página fuera de rango', { perPage: 2, page: 99 }],
  ['página cero', { perPage: 2, page: 0 }],
  ['rango de precio', { precioMin: 200, precioMax: 600 }],
  ['rango de precio abierto', { precioMin: 400 }],
  ['rango más faceta', { precioMin: 100, precioMax: 400, filters: { color: ['Negro'] } }],
];

for (const [nombre, query] of CASOS) {
  test(`paridad: ${nombre}`, async () => {
    await verificarParidad(nombre, query);
  });
}

test('el borrador nunca sale, ni en los ítems ni en los counts', async () => {
  // Es el caso que `queryCatalog` no puede cubrir: el core recibe productos ya
  // filtrados, así que el filtro por estado sólo existe en SQL.
  const r = await porRpc({});
  assert.ok(!r.items.some((p) => p.handle === 'p5'), 'un borrador llegó al storefront');

  const azul = (await porRpc({})).facets.find((f) => f.name === 'color')?.values
    .find((v) => v.value === 'Azul');
  // Sólo p1 es azul entre los activos; el borrador también lo es y no debe sumar.
  assert.equal(azul?.count, 1);

  const talle = (await porRpc({})).facets.find((f) => f.name === 'size')?.values
    .map((v) => v.value);
  assert.ok(!talle?.includes('S'), 'el talle del borrador apareció como faceta');
});

test('el resultado trae el scope del tenant en cada ítem', async () => {
  const r = await porRpc({ perPage: 1 });
  assert.equal(r.items[0]?.tenantId, TENANT);
  assert.equal(r.items[0]?.storeId, STORE);
});

test('las variantes conservan su orden, su precio y el stock sumado', async () => {
  const r = await porRpc({ filters: { categoria: ['camperas'] } });
  const p1 = r.items.find((p) => p.handle === 'p1');

  // El orden importa: la PLP muestra `variants[0]` y es el precio que ve el cliente.
  assert.deepEqual(
    p1?.variants.map((v) => v.price.amount),
    [300, 350],
  );
  assert.equal(p1?.variants[1]?.availableQuantity, 0);
  assert.equal(p1?.variants[0]?.availableQuantity, 5);
});

test('acotar por handle devuelve un solo producto', async () => {
  const r = await db.query<{ j: CatalogResult }>(
    `select catalog_search($1::uuid, '{}'::jsonb, '', 'relevance', 1, 1, null, null, $2) as j`,
    [STORE, 'p3'],
  );
  assert.deepEqual(r.rows[0]!.j.items.map((p) => p.handle), ['p3']);

  const vacio = await db.query<{ j: CatalogResult }>(
    `select catalog_search($1::uuid, '{}'::jsonb, '', 'relevance', 1, 1, null, null, $2) as j`,
    [STORE, 'no-existe'],
  );
  assert.equal(vacio.rows[0]!.j.items.length, 0);
});

// --- Aislamiento entre tenants sobre las tablas nuevas -----------------------

test('un tenant no ve el catálogo de otro', async () => {
  for (const tabla of ['products', 'product_variants', 'inventory_levels', 'categories']) {
    const propias = await db.query(`select 1 from ${tabla}`).catch(() => null);
    void propias;

    const ajenas = await intentar(db, AJENO, `select * from ${tabla}`);
    assert.equal(ajenas.filas, 0, `${tabla} filtró datos a otra organización`);
  }
});

test('el rol anónimo ni siquiera puede consultar el catálogo', async () => {
  // El storefront lee desde el servidor con la secret key, no por esta vía.
  for (const tabla of ['products', 'product_variants', 'inventory_levels']) {
    const r = await intentar(db, null, `select * from ${tabla}`);
    assert.equal(r.ok, false, `${tabla} quedó accesible al rol anon`);
    assert.match(r.error ?? '', /permission denied/i);
  }
});

test('un viewer no puede escribir en el catálogo', async () => {
  const r = await intentar(
    db,
    VIEWER,
    `insert into products (tenant_id, store_id, handle, title)
     values ('${TENANT}', '${STORE}', 'nuevo', 'Nuevo')`,
  );
  assert.equal(r.ok, false, 'un viewer creó un producto');
});

test('un dueño no puede escribir en el catálogo de otra organización', async () => {
  const r = await intentar(
    db,
    AJENO,
    `insert into products (tenant_id, store_id, handle, title)
     values ('${TENANT}', '${STORE}', 'intruso', 'Intruso')`,
  );
  assert.equal(r.ok, false, 'se creó un producto en una organización ajena');
});

test('el dueño sí puede administrar su catálogo', async () => {
  const r = await intentar(
    db,
    DUENO,
    `insert into products (tenant_id, store_id, handle, title)
     values ('${TENANT}', '${STORE}', 'propio', 'Propio')`,
  );
  assert.equal(r.ok, true, `el dueño no pudo crear su producto: ${r.error}`);
});

test('el stock también está protegido por el permiso de catálogo', async () => {
  const r = await intentar(
    db,
    VIEWER,
    `update inventory_levels set available = 9999`,
  );
  assert.equal(r.filas, 0, 'un viewer modificó el stock');
});
