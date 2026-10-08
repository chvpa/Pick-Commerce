import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, como } from './harness.ts';

/**
 * La lista de productos por pestaña (v3 Fase 2).
 *
 * «Sin foto» y «stock quieto» no son un estado: dependen de las fotos, del stock
 * y de las ventas, y un producto puede estar en dos pestañas. Lo que se prueba
 * es que cada pestaña trae exactamente los suyos, que el conteo dice lo mismo
 * que la lista, que los filtros nuevos hacen lo que dicen, y que «se ven en la
 * tienda» cuenta lo mismo que el catálogo del storefront.
 */

const TENANT = 'b0000000-0000-4000-8000-000000000000';
const TIENDA = 'b0100000-0000-4000-8000-000000000000';
const SUCURSAL = 'b0200000-0000-4000-8000-000000000000';
const PRENDAS = 'b0300000-0000-4000-8000-000000000000';
const CAMPERAS = 'b0300000-0000-4000-8000-000000000001';
const CALZADO = 'b0300000-0000-4000-8000-000000000002';
const OTRO_TENANT = 'b1000000-0000-4000-8000-000000000000';
const OTRA_TIENDA = 'b1100000-0000-4000-8000-000000000000';
const DUENO = 'fc000000-0000-4000-8000-000000000000';
const AJENO = 'fc000000-0000-4000-8000-000000000001';

const P = (n: number) => `b4${String(n).padStart(6, '0')}-0000-4000-8000-000000000000`;
const V = (n: number) => `b5${String(n).padStart(6, '0')}-0000-4000-8000-000000000000`;

let db: PGlite;

interface Fila {
  readonly id: string;
  readonly stock: number;
  readonly categoria?: string;
  readonly diasSinVender: number;
}

interface Pagina {
  readonly items: readonly Fila[];
  readonly total: number;
  readonly pageCount: number;
}

interface Conteos {
  readonly todos: number;
  readonly publicados: number;
  readonly borradores: number;
  readonly sinfoto: number;
  readonly quieto: number;
  readonly archivados: number;
  readonly seVen: number;
  readonly ocultaSinFoto: boolean;
  readonly marcas: readonly string[];
}

const PESTANAS = ['todos', 'publicados', 'borradores', 'sinfoto', 'quieto', 'archivados'] as const;

async function lista(
  opciones: {
    tab?: string;
    query?: string;
    categoria?: string;
    marca?: string;
    stock?: string;
    page?: number;
    perPage?: number;
    usuario?: string;
  } = {},
): Promise<Pagina> {
  const texto = (v: string | undefined) => (v === undefined ? 'null' : `'${v}'`);
  const filas = await como<{ j: Pagina }>(
    db,
    opciones.usuario ?? DUENO,
    `select admin_products(
       '${TIENDA}'::uuid, ${texto(opciones.query ?? '')}, null,
       ${opciones.page ?? 1}, ${opciones.perPage ?? 20},
       ${texto(opciones.tab)}, ${opciones.categoria ? `'${opciones.categoria}'::uuid` : 'null'},
       ${texto(opciones.marca)}, ${texto(opciones.stock)}
     ) as j`,
  );
  return filas[0]!.j;
}

async function conteos(usuario = DUENO): Promise<Conteos> {
  const filas = await como<{ j: Conteos }>(
    db,
    usuario,
    `select admin_product_counts('${TIENDA}'::uuid) as j`,
  );
  return filas[0]!.j;
}

const ids = (p: Pagina) => p.items.map((i) => i.id);

/** Un producto con una variante, su stock, y si se pide, foto y una venta. */
function producto(
  n: number,
  o: {
    status: string;
    stock: number;
    foto?: boolean;
    marca?: string;
    categoria?: string;
    creado: number;
    vendido?: number;
  },
): string {
  const pedido = `b6${String(n).padStart(6, '0')}-0000-4000-8000-000000000000`;
  return `
    insert into products (id, tenant_id, store_id, handle, title, status, brand, category_id, created_at)
      values ('${P(n)}', '${TENANT}', '${TIENDA}', 'p${n}', 'Producto ${n}', '${o.status}',
              ${o.marca ? `'${o.marca}'` : 'null'}, ${o.categoria ? `'${o.categoria}'` : 'null'},
              now() - interval '${o.creado} days');
    insert into product_variants (id, tenant_id, product_id, sku, title, price, currency, position)
      values ('${V(n)}', '${TENANT}', '${P(n)}', 'SKU-${n}', 'Única', 100, 'PYG', 0);
    insert into inventory_levels (tenant_id, variant_id, location_id, available)
      values ('${TENANT}', '${V(n)}', '${SUCURSAL}', ${o.stock});
    ${
      o.foto
        ? `insert into product_media (tenant_id, product_id, url, width, height, position)
             values ('${TENANT}', '${P(n)}', 'https://x.test/${n}.webp', 800, 1000, 0);`
        : ''
    }
    ${
      o.vendido !== undefined
        ? `insert into orders (id, tenant_id, store_id, number, idempotency_key, status, payment_method,
             customer, address, total_amount, currency, created_at)
           values ('${pedido}', '${TENANT}', '${TIENDA}', ${n}, gen_random_uuid(), 'delivered',
             'bank_transfer', '{"name":"x"}', '{"city":"y"}', 100, 'PYG',
             now() - interval '${o.vendido} days');
           insert into order_items (tenant_id, order_id, variant_id, title, sku, unit_price, currency, quantity, position)
           values ('${TENANT}', '${pedido}', '${V(n)}', 'x', 'SKU-${n}', 100, 'PYG', 1, 0);`
        : ''
    }`;
}

before(async () => {
  db = await baseDePrueba();
  await db.exec(`
    insert into auth.users (id, email) values ('${DUENO}', 'd@a.test'), ('${AJENO}', 'x@b.test');
    insert into organizations (id, name, slug) values
      ('${TENANT}', 'A', 'qa'), ('${OTRO_TENANT}', 'B', 'qb');
    insert into stores (id, tenant_id, name, slug, domain, currency) values
      ('${TIENDA}', '${TENANT}', 'Tienda A', 'tqa', 'qa.test', 'PYG'),
      ('${OTRA_TIENDA}', '${OTRO_TENANT}', 'Tienda B', 'tqb', 'qb.test', 'PYG');
    insert into memberships (tenant_id, user_id, role) values
      ('${TENANT}', '${DUENO}', 'owner'), ('${OTRO_TENANT}', '${AJENO}', 'owner');
    insert into locations (id, tenant_id, store_id, name) values
      ('${SUCURSAL}', '${TENANT}', '${TIENDA}', 'Central');
    insert into categories (id, tenant_id, store_id, parent_id, name, slug, position) values
      ('${PRENDAS}', '${TENANT}', '${TIENDA}', null, 'Prendas', 'prendas', 0),
      ('${CAMPERAS}', '${TENANT}', '${TIENDA}', '${PRENDAS}', 'Camperas', 'camperas', 0),
      ('${CALZADO}', '${TENANT}', '${TIENDA}', null, 'Calzado', 'calzado', 1);

    -- Publicado, con foto y vendido ayer: se ve, y no está quieto.
    ${producto(1, { status: 'active', stock: 10, foto: true, marca: 'Norte', categoria: CAMPERAS, creado: 400, vendido: 1 })}
    -- Publicado, sin foto, con poco stock y nunca vendido desde hace 200 días:
    -- está en «sin foto» y en «quieto» a la vez.
    ${producto(2, { status: 'active', stock: 3, marca: 'Ruta', categoria: CALZADO, creado: 200 })}
    -- Borrador sin nada.
    ${producto(3, { status: 'draft', stock: 0, creado: 5 })}
    -- Archivado con stock viejo: lo archivado no es «quieto», se sacó a propósito.
    ${producto(4, { status: 'archived', stock: 5, foto: true, creado: 300 })}
    -- Pausado con stock, vendido hace 100 días: quieto aunque no esté publicado.
    ${producto(5, { status: 'inactive', stock: 7, foto: true, marca: 'Norte', creado: 120, vendido: 100 })}
    -- Publicado con foto y sin stock: no se ve, salvo que la tienda muestre lo agotado.
    ${producto(6, { status: 'active', stock: 0, foto: true, categoria: CAMPERAS, creado: 10 })}

    insert into products (id, tenant_id, store_id, handle, title, status, brand)
      values ('${P(99)}', '${OTRO_TENANT}', '${OTRA_TIENDA}', 'ajeno', 'Ajeno', 'active', 'Ajena');
  `);
});

after(async () => {
  await db.close();
});

test('cada pestaña trae exactamente los suyos', async () => {
  const esperado: Record<(typeof PESTANAS)[number], string[]> = {
    todos: [P(1), P(2), P(3), P(4), P(5), P(6)],
    publicados: [P(1), P(2), P(6)],
    borradores: [P(3)],
    sinfoto: [P(2)],
    quieto: [P(2), P(5)],
    archivados: [P(4)],
  };
  for (const tab of PESTANAS) {
    assert.deepEqual(ids(await lista({ tab })).sort(), esperado[tab].sort(), `pestaña ${tab}`);
  }
});

test('el conteo de las pestañas dice lo mismo que la lista', async () => {
  const c = await conteos();
  for (const tab of PESTANAS) {
    assert.equal(c[tab], (await lista({ tab })).total, `pestaña ${tab}`);
  }
  assert.deepEqual(c.marcas, ['Norte', 'Ruta']);
});

test('«se ven en la tienda» cuenta lo mismo que el catálogo del storefront', async () => {
  const catalogo = async () =>
    (
      await db.query<{ j: { total: number } }>(
        `select catalog_search('${TIENDA}'::uuid, '{}'::jsonb, '', 'relevance', 1, 24, null, null) as j`,
      )
    ).rows[0]!.j.total;

  // Por defecto: lo agotado no se ve, lo sin foto sí.
  assert.equal((await conteos()).seVen, 2);
  assert.equal((await conteos()).seVen, await catalogo());

  // Con las dos reglas al revés, las dos cuentas se siguen moviendo juntas.
  await db.exec(`
    insert into store_settings (tenant_id, store_id, settings)
    values ('${TENANT}', '${TIENDA}', '{"catalog":{"showOutOfStock":true,"hideWithoutImage":true}}')
    on conflict (store_id) do update set settings = excluded.settings;
  `);
  const c = await conteos();
  assert.equal(c.seVen, 2, 'con foto y publicados: el 1 y el 6');
  assert.equal(c.ocultaSinFoto, true);
  assert.equal(c.seVen, await catalogo());
  await db.exec(`delete from store_settings where store_id = '${TIENDA}'`);
});

test('lo quieto va de lo más viejo a lo más nuevo', async () => {
  assert.deepEqual(ids(await lista({ tab: 'quieto' })), [P(2), P(5)]);
  const quieto = await lista({ tab: 'quieto' });
  assert.equal(quieto.items[0]!.diasSinVender, 200);
  assert.equal(quieto.items[1]!.diasSinVender, 100);
});

test('la categoría trae también las de abajo, y la fila dice cuál es', async () => {
  // Prendas no tiene productos propios: los tiene Camperas, que cuelga de ella.
  assert.deepEqual(ids(await lista({ categoria: PRENDAS })).sort(), [P(1), P(6)].sort());
  assert.deepEqual(ids(await lista({ categoria: CALZADO })), [P(2)]);
  const fila = (await lista({ categoria: CAMPERAS })).items.find((i) => i.id === P(1))!;
  assert.equal(fila.categoria, 'Prendas › Camperas');
});

test('la marca y el stock se suman a la pestaña', async () => {
  assert.deepEqual(ids(await lista({ marca: 'Norte' })).sort(), [P(1), P(5)].sort());
  assert.deepEqual(ids(await lista({ tab: 'publicados', marca: 'Norte' })), [P(1)]);
  assert.deepEqual(ids(await lista({ stock: 'sin' })).sort(), [P(3), P(6)].sort());
  // De 1 a 5 son «pocos»: el 5 entra, el 7 no.
  assert.deepEqual(ids(await lista({ stock: 'pocos' })).sort(), [P(2), P(4)].sort());
  assert.deepEqual(ids(await lista({ stock: 'con' })).sort(), [P(1), P(2), P(4), P(5)].sort());
});

test('el corte de página trae las filas de esa página y el total de todas', async () => {
  const primera = await lista({ perPage: 4 });
  const segunda = await lista({ perPage: 4, page: 2 });
  assert.equal(primera.total, 6);
  assert.equal(primera.pageCount, 2);
  assert.equal(primera.items.length, 4);
  assert.equal(segunda.items.length, 2);
  assert.equal(new Set([...ids(primera), ...ids(segunda)]).size, 6, 'repite o pierde productos');
});

test('otro comercio no ve ni cuenta los productos ajenos', async () => {
  assert.equal((await lista({ usuario: AJENO })).total, 0);
  const c = await conteos(AJENO);
  assert.equal(c.todos, 0);
  assert.deepEqual(c.marcas, []);
});
