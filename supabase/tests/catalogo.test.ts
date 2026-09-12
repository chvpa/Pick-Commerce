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
 * catálogo: sus tests fijan el comportamiento y el comentario del código dice
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
    // El orden de la lista de facetas lo decide la PLP con `position` de
    // `attribute_definitions`; el RPC las devuelve en orden de descubrimiento y
    // el core, en el de iteración de un objeto de JS. Se compara el contenido,
    // que es lo que significa algo.
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
  // La fecha replica exactamente la que `insertarProductos` le pone a cada fila.
  // Sin ella el orden por novedad no probaría nada: el core dejaría el array
  // como está y coincidiría con el SQL sólo por casualidad.
].map((p, i) => ({ ...p, createdAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z` }));

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

  /*
   * Un producto en la tienda ajena, con marca, categoría, color y precio
   * propios. Sin él, la tienda ajena existía pero estaba vacía: ninguna
   * aserción del archivo podía notar que `catalog_search` dejara de filtrar por
   * tienda, porque no había nada que filtrar. Eso es justo el modo de fallo que
   * ADR-050 obliga a cubrir —silencioso, sobre la única barrera que separa los
   * catálogos de dos comercios— y la razón de que el precio sea deliberadamente
   * extremo: si se colara, movería `priceMin`/`priceMax` y los counts.
   */
  await db.exec(`
    insert into categories (id, tenant_id, store_id, name, slug, position)
      values ('cf000000-0000-4000-8000-000000000000', '${OTRO_TENANT}', '${OTRO_STORE}',
              'Ajena', 'ajena', 0);
    insert into products (id, tenant_id, store_id, handle, title, brand, category_id, status, created_at)
      values ('df000000-0000-4000-8000-000000000000', '${OTRO_TENANT}', '${OTRO_STORE}',
              'secreto-ajeno', 'Secreto ajeno', 'MarcaAjena',
              'cf000000-0000-4000-8000-000000000000', 'active', '2026-01-01T00:00:00Z');
    insert into product_variants (id, tenant_id, product_id, sku, title, price, currency, position, attributes)
      values ('ef000000-0000-4000-8000-000000000000', '${OTRO_TENANT}',
              'df000000-0000-4000-8000-000000000000', 'SKU-AJENO', 'Única',
              99999999, 'PYG', 0, '{"color": "ColorAjeno"}'::jsonb);
  `);
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

async function porColeccion(handle: string): Promise<CatalogResult> {
  const r = await db.query<{ j: CatalogResult }>(
    `select catalog_search($1::uuid, '{}'::jsonb, '', 'relevance', 1, 24, null, null, null, $2) as j`,
    [STORE, handle],
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
  ['orden por novedad', { sort: 'newest' }],
  ['orden por más vendidos', { sort: 'best-selling' }],
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

  const azul = (await porRpc({})).facets
    .find((f) => f.name === 'color')
    ?.values.find((v) => v.value === 'Azul');
  // Sólo p1 es azul entre los activos; el borrador también lo es y no debe sumar.
  assert.equal(azul?.count, 1);

  const talle = (await porRpc({})).facets
    .find((f) => f.name === 'size')
    ?.values.map((v) => v.value);
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
  assert.deepEqual(
    r.rows[0]!.j.items.map((p) => p.handle),
    ['p3'],
  );

  const vacio = await db.query<{ j: CatalogResult }>(
    `select catalog_search($1::uuid, '{}'::jsonb, '', 'relevance', 1, 1, null, null, $2) as j`,
    [STORE, 'no-existe'],
  );
  assert.equal(vacio.rows[0]!.j.items.length, 0);
});

test('los campos opcionales llegan ausentes, no nulos', async () => {
  /*
   * `Product` y `ProductVariant` declaran `compareAtPrice`, `cost`, `barcode`,
   * `brand`, `description` y `categoryId` como opcionales: ausentes, no nulos.
   *
   * No es una preferencia de estilo. En TypeScript `null !== undefined`, así que
   * un chequeo correcto contra el contrato —`variant.compareAtPrice !== undefined`—
   * da verdadero para un null y el consumidor revienta. Pasó: el PDP se caía al
   * elegir una variante sin precio anterior, y el typecheck no podía verlo
   * porque el tipo decía una cosa y el dato traía otra.
   */
  const nulos: string[] = [];
  const recorrer = (valor: unknown, ruta: string): void => {
    if (valor === null) nulos.push(ruta);
    else if (Array.isArray(valor)) valor.forEach((v, i) => recorrer(v, `${ruta}[${i}]`));
    else if (typeof valor === 'object') {
      for (const [k, v] of Object.entries(valor)) recorrer(v, `${ruta}.${k}`);
    }
  };

  const r = await porRpc({});
  r.items.forEach((item, i) => recorrer(item, `items[${i}]`));

  assert.deepEqual(nulos, [], `el RPC emitió null donde el contrato dice ausente`);
});

test('acotar por colección devuelve sólo sus productos, en el orden de la consulta', async () => {
  const coleccion = uuid('c9', 0);
  await db.exec(
    `insert into collections (id, tenant_id, store_id, title, handle)
     values ('${coleccion}', '${TENANT}', '${STORE}', 'Ofertas', 'ofertas');
     insert into collection_products (tenant_id, collection_id, product_id, position) values
       ('${TENANT}', '${coleccion}', '${uuid('d1', 0)}', 0),
       ('${TENANT}', '${coleccion}', '${uuid('d1', 2)}', 1)`,
  );

  const r = await porColeccion('ofertas');
  assert.deepEqual(
    r.items.map((p) => p.handle),
    ['p1', 'p3'],
  );
  // Las facetas también se acotan: si no, mostrarían opciones que no filtran nada.
  assert.deepEqual(
    r.facets.find((f) => f.name === 'brand')?.values.map((v) => v.value),
    ['Norte', 'Ruta'],
  );

  // Una colección inexistente devuelve vacío, no el catálogo entero.
  assert.equal((await porColeccion('no-existe')).total, 0);
});

test('una colección dinámica es una consulta guardada, no una lista', async () => {
  // Lo que ADR-056 anticipó y quedó sin implementar hasta ahora: `rules` tiene
  // la forma de `CatalogFilters` y la resuelve el mismo `catalog_search`.
  await db.exec(
    `insert into collections (id, tenant_id, store_id, title, handle, rules)
     values ('${uuid('c9', 1)}', '${TENANT}', '${STORE}', 'Todo negro', 'negro',
             '{"color": ["Negro"]}'::jsonb)`,
  );

  const r = await porColeccion('negro');
  assert.deepEqual(
    [...r.items.map((p) => p.handle)].sort(),
    ['p1', 'p2', 'p3'],
    'la colección dinámica no resolvió sus reglas',
  );
  // Sin `collection_products`: la pertenencia sale de la regla.
  const filas = await db.query<{ n: number }>(
    `select count(*)::int as n from collection_products where collection_id = $1`,
    [uuid('c9', 1)],
  );
  assert.equal(filas.rows[0]!.n, 0);
});

test('la regla de la colección no se auto-excluye al filtrar', async () => {
  /*
   * El caso que decide dónde se aplican las reglas. Los filtros de faceta se
   * auto-excluyen del conteo de su propia faceta —para que con «color: Negro»
   * activo el color siga mostrando cuántos hay en Azul—, y una regla de
   * colección no puede hacer eso: la colección dejaría de estar acotada en
   * cuanto el visitante toca un filtro. Por eso van junto a la búsqueda y al
   * precio, que tampoco se auto-excluyen.
   */
  const r = await db.query<{ j: CatalogResult }>(
    `select catalog_search($1::uuid, $2::jsonb, '', 'relevance', 1, 24, null, null, null, $3) as j`,
    [STORE, JSON.stringify({ brand: ['Norte'] }), 'negro'],
  );
  const datos = r.rows[0]!.j;

  // Con la marca filtrada quedan los negros de Norte: p2. p1 es azul en su
  // primera variante pero tiene una negra, así que también entra.
  assert.deepEqual([...datos.items.map((p) => p.handle)].sort(), ['p1', 'p2']);

  // Y la faceta de color, que sí se auto-excluye, **no** ofrece Verde: la
  // mochila no está en la colección y no puede aparecer como opción.
  const colores = datos.facets.find((f) => f.name === 'color')?.values.map((v) => v.value) ?? [];
  assert.ok(!colores.includes('Verde'), `la regla se auto-excluyó: ${colores.join(', ')}`);
});

test('«más vendidos» ordena por unidades y descarta lo cancelado', async () => {
  // La paridad sola no probaba nada acá: sin pedidos, las dos implementaciones
  // devolvían ceros y coincidían por vacías.
  const pedido = (n: number) => uuid('e5', n);
  await db.exec(`
    insert into order_counters (store_id, tenant_id, last_number) values ('${STORE}', '${TENANT}', 2000);
    insert into orders (id, tenant_id, store_id, number, idempotency_key, status,
                        payment_method, customer, address, total_amount, currency) values
      ('${pedido(0)}', '${TENANT}', '${STORE}', 2001, gen_random_uuid(), 'received',
       'bank_transfer', '{}'::jsonb, '{}'::jsonb, 0, 'PYG'),
      ('${pedido(1)}', '${TENANT}', '${STORE}', 2002, gen_random_uuid(), 'cancelled',
       'bank_transfer', '{}'::jsonb, '{}'::jsonb, 0, 'PYG');

    insert into order_items (tenant_id, order_id, variant_id, title, sku, unit_price,
                             currency, quantity, position) values
      -- La mochila (p4, índice 3) vende 3 en un pedido vivo.
      ('${TENANT}', '${pedido(0)}', '${uuid('e1', 300)}', 'Mochila verde', 'SKU-d', 700, 'PYG', 3, 0),
      -- La zapatilla (p3, índice 2) vende 50 en uno cancelado: no cuenta.
      ('${TENANT}', '${pedido(1)}', '${uuid('e1', 200)}', 'Zapatilla negra', 'SKU-c', 100, 'PYG', 50, 0)
  `);

  const r = await porRpc({ sort: 'best-selling' });
  assert.equal(r.items[0]?.handle, 'p4', 'no ordenó por unidades vendidas');
  assert.equal(r.items[0]?.unitsSold, 3);

  const zapatilla = r.items.find((p) => p.handle === 'p3');
  assert.equal(zapatilla?.unitsSold, 0, 'un pedido cancelado sumó ventas');
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
  const r = await intentar(db, VIEWER, `update inventory_levels set available = 9999`);
  assert.equal(r.filas, 0, 'un viewer modificó el stock');
});

/*
 * El camino de la secret key.
 *
 * Todo lo de arriba que dice "un tenant no ve el catálogo de otro" corre como
 * `authenticated`, o sea contra RLS: es la capa del Admin. El storefront no pasa
 * por ahí —usa la secret key, que saltea RLS por completo— y lo único que lo
 * acota es el `p_store_id` dentro del SQL. Esa capa no tenía una sola prueba, y
 * es la que en Fase 5 va a proteger la escritura de pedidos.
 *
 * `catalog_search` se llama acá como dueño de la base, que es el equivalente
 * funcional de la secret key: sin políticas de por medio, sólo el SQL.
 */
test('la secret key tampoco cruza tiendas: ítems, facetas y precios', async () => {
  const r = await porRpc({});

  assert.ok(
    !r.items.some((p) => p.handle === 'secreto-ajeno'),
    'un producto de otra tienda apareció en los resultados',
  );

  const valores = r.facets.flatMap((f) => f.values.map((v) => v.value));
  for (const ajeno of ['MarcaAjena', 'ColorAjeno', 'ajena']) {
    assert.ok(!valores.includes(ajeno), `la faceta filtró un valor ajeno: ${ajeno}`);
  }

  // El precio ajeno es absurdo a propósito: si se colara, movería el rango.
  assert.ok(
    r.priceMax === undefined || r.priceMax < 99999999,
    `el rango de precios incluyó el catálogo ajeno: ${r.priceMax}`,
  );
});

test('la secret key no alcanza un producto ajeno ni sabiendo su handle', async () => {
  const r = await porRpc({ search: '' });
  assert.equal(r.total, (await porRpc({})).total);

  const porHandle = await db.query<{ j: CatalogResult }>(
    `select catalog_search($1::uuid, '{}'::jsonb, '', 'relevance', 1, 24, null, null,
                           'secreto-ajeno', null) as j`,
    [STORE],
  );
  assert.equal(porHandle.rows[0]?.j.items.length, 0, 'se alcanzó un producto de otra tienda');
});

test('pedir cien mil productos por página devuelve el tope, no cien mil', async () => {
  /*
   * `catalog_search` es la única función paginada **pública y sin sesión**: el
   * `perPage` llega del query string y hasta la Fase 12 se usaba tal cual. Una
   * ruta de SEO podía pedir un millón de filas y quedarse con el pool de
   * conexiones por el que después pasa el checkout.
   *
   * Se afirma sobre `perPage` y no sobre la cantidad de items porque el catálogo
   * de prueba tiene pocos: lo que importa es que la función **use** el tope, y
   * que lo devuelva, para que quien pagina no haga cuentas con un tamaño que no
   * existió.
   */
  const r = await porRpc({ perPage: 100_000 });

  assert.equal(r.perPage, 200);
  assert.ok(r.items.length <= 200);
});

test('un producto sin stock no se lista, pero su página sigue existiendo', async () => {
  /*
   * El default es ocultar: quien entra a comprar no quiere ver lo que no puede
   * comprar. La tienda que lo pida —la demo, para enseñar la insignia— lo
   * enciende con `catalog.showOutOfStock`. Y por handle se sigue encontrando:
   * un enlace que ayer funcionaba no puede dar 404 porque se vendió la última.
   */
  const listar = async () => {
    const r = await db.query<{ j: CatalogResult }>(
      `select catalog_search($1::uuid, '{}'::jsonb, '', 'relevance', 1, 50) as j`,
      [STORE],
    );
    return r.rows[0]!.j;
  };
  const porHandle = async (h: string) => {
    const r = await db.query<{ j: CatalogResult }>(
      `select catalog_search($1::uuid, '{}'::jsonb, '', 'relevance', 1, 1, null, null, $2) as j`,
      [STORE, h],
    );
    return r.rows[0]!.j.items.map((p) => p.handle);
  };

  const antes = await listar();
  // Filas propias y no `insertarProductos`: ese helper deriva los ids del índice
  // y volvería a insertar la categoría y el producto 0 del fixture.
  const AGOTADO = 'd1ff0000-0000-4000-8000-000000000000';
  const VARIANTE = 'e1ff0000-0000-4000-8000-000000000000';
  await db.exec(
    `insert into products (id, tenant_id, store_id, handle, title, brand, status)
     values ('${AGOTADO}', '${TENANT}', '${STORE}', 'agotado', 'Gorra agotada', 'Norte', 'active');
     insert into product_variants (id, tenant_id, product_id, sku, title, position, price, currency, attributes)
     values ('${VARIANTE}', '${TENANT}', '${AGOTADO}', 'SKU-agotado', 'U', 0, 200, 'PYG', '{"size": "U"}'::jsonb);
     insert into inventory_levels (tenant_id, variant_id, location_id, available)
     values ('${TENANT}', '${VARIANTE}', '${LOCATION}', 0)`,
  );
  try {
    const sin = await listar();
    assert.ok(!sin.items.some((p) => p.handle === 'agotado'), 'el agotado se listó');
    assert.equal(sin.total, antes.total, 'el agotado contó en el total');
    assert.deepEqual(await porHandle('agotado'), ['agotado'], 'el PDP del agotado dejó de existir');

    await db.exec(
      `insert into store_settings (store_id, tenant_id, settings)
       values ('${STORE}', '${TENANT}', '{"catalog": {"showOutOfStock": true}}'::jsonb)
       on conflict (store_id) do update set settings = excluded.settings`,
    );
    const con = await listar();
    assert.ok(
      con.items.some((p) => p.handle === 'agotado'),
      'con el ajuste, no se listó',
    );
    assert.equal(con.total, antes.total + 1);
  } finally {
    await db.exec(`delete from store_settings where store_id = '${STORE}'`);
    await db.exec(`delete from products where id = '${AGOTADO}'`);
  }
});

test('un producto sin foto se lista, salvo que la tienda pida ocultarlo', async () => {
  /*
   * Al revés que el stock: el default es mostrar. El fixture entero no tiene
   * fotos, así que si el default fuera ocultar la paridad quedaría vacía — y
   * una ferretería vende sin foto. Con el ajuste puesto, desaparece del listado
   * y sigue teniendo página.
   */
  const listar = async () => {
    const r = await db.query<{ j: CatalogResult }>(
      `select catalog_search($1::uuid, '{}'::jsonb, '', 'relevance', 1, 50) as j`,
      [STORE],
    );
    return r.rows[0]!.j;
  };
  const porHandle = async (h: string) => {
    const r = await db.query<{ j: CatalogResult }>(
      `select catalog_search($1::uuid, '{}'::jsonb, '', 'relevance', 1, 1, null, null, $2) as j`,
      [STORE, h],
    );
    return r.rows[0]!.j.items.map((p) => p.handle);
  };

  const antes = await listar();
  assert.ok(antes.total > 0, 'el fixture, todo sin foto, se lista por defecto');

  await db.exec(
    `insert into store_settings (store_id, tenant_id, settings)
     values ('${STORE}', '${TENANT}', '{"catalog": {"hideWithoutImage": true}}'::jsonb)
     on conflict (store_id) do update set settings = excluded.settings`,
  );
  try {
    const con = await listar();
    assert.equal(con.total, 0, 'con el ajuste, un fixture sin fotos tiene que quedar vacío');
    assert.deepEqual(
      await porHandle('p3'),
      ['p3'],
      'el PDP de un producto sin foto dejó de existir',
    );
  } finally {
    await db.exec(`delete from store_settings where store_id = '${STORE}'`);
  }
});
