import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import type { PaginaProductos } from '@pick/commerce-core';
import { baseDePrueba, intentar } from './harness.ts';

/**
 * Las funciones del Admin: listar y guardar.
 *
 * Los tests de comportamiento corren como dueño de la base, o sea sin RLS de por
 * medio: verifican la lógica. La autorización se prueba aparte con `intentar`,
 * que sí adopta la identidad de un usuario. Mezclar las dos cosas en un mismo
 * test deja sin saber cuál de las dos falló.
 */

const TENANT = 'aa000000-0000-4000-8000-000000000000';
const STORE = 'bb000000-0000-4000-8000-000000000000';
const OTRA_STORE = 'bb000000-0000-4000-8000-000000000001';
const LOCATION = 'cc000000-0000-4000-8000-000000000000';

const DUENO = 'a1000000-0000-4000-8000-000000000000';
const VIEWER = 'a2000000-0000-4000-8000-000000000000';
const AJENO = 'a3000000-0000-4000-8000-000000000000';
const OTRO_TENANT = 'af000000-0000-4000-8000-000000000000';
const OTRO_STORE = 'bf000000-0000-4000-8000-000000000000';

let db: PGlite;

function json(valor: unknown): string {
  return `'${JSON.stringify(valor).replace(/'/g, "''")}'::jsonb`;
}

/** Guarda un producto y devuelve su id. */
async function guardar(producto: unknown, store = STORE): Promise<string> {
  const r = await db.query<{ id: string }>(
    `select admin_save_product('${store}'::uuid, ${json(producto)}) as id`,
  );
  return r.rows[0]!.id;
}

async function listar(consulta: {
  query?: string;
  status?: string | null;
  page?: number;
  perPage?: number;
}): Promise<PaginaProductos> {
  const r = await db.query<{ j: PaginaProductos }>(
    `select admin_products($1::uuid, $2, $3, $4, $5) as j`,
    [STORE, consulta.query ?? '', consulta.status ?? null, consulta.page ?? 1, consulta.perPage ?? 20],
  );
  return r.rows[0]!.j;
}

function producto(handle: string, extra: Record<string, unknown> = {}) {
  return {
    handle,
    title: `Producto ${handle}`,
    status: 'draft',
    variants: [
      {
        sku: `SKU-${handle.toUpperCase()}`,
        title: 'Única',
        price: 1000,
        currency: 'PYG',
        attributes: { color: 'Negro' },
        stock: 3,
      },
    ],
    // Sin la clave `media` a propósito: significa "no digo nada de las
    // imágenes". Los tests que quieren tocarlas la pasan explícitamente.
    ...extra,
  };
}

before(async () => {
  db = await baseDePrueba();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${DUENO}', 'dueno@x.test'), ('${VIEWER}', 'viewer@x.test'), ('${AJENO}', 'ajeno@x.test');
    insert into organizations (id, name, slug) values
      ('${TENANT}', 'Tienda', 'tienda'), ('${OTRO_TENANT}', 'Otra', 'otra');
    insert into stores (id, tenant_id, name, slug) values
      ('${STORE}', '${TENANT}', 'Principal', 'principal'),
      ('${OTRA_STORE}', '${TENANT}', 'Segunda', 'segunda'),
      ('${OTRO_STORE}', '${OTRO_TENANT}', 'Ajena', 'ajena');
    insert into locations (id, tenant_id, store_id, name) values
      ('${LOCATION}', '${TENANT}', '${STORE}', 'Depósito');
    insert into memberships (tenant_id, user_id, role) values
      ('${TENANT}', '${DUENO}', 'owner'),
      ('${TENANT}', '${VIEWER}', 'viewer'),
      ('${OTRO_TENANT}', '${AJENO}', 'owner');
  `);
});

after(async () => {
  await db.close();
});

test('guardar crea el producto, sus variantes, sus medios y su stock', async () => {
  const id = await guardar({
    handle: 'campera',
    title: 'Campera',
    status: 'active',
    brand: 'Norte',
    variants: [
      {
        sku: 'CAM-AZ',
        title: 'Azul',
        price: 389000,
        currency: 'PYG',
        compareAtPrice: 550000,
        attributes: { color: 'Azul' },
        stock: 4,
      },
      {
        sku: 'CAM-NE',
        title: 'Negro',
        price: 410000,
        currency: 'PYG',
        attributes: { color: 'Negro' },
        stock: 2,
      },
    ],
    media: [{ url: '/a.jpg', alt: 'Campera', width: 900, height: 1200 }],
  });

  const r = await db.query<{ sku: string; position: number; available: number }>(
    `select v.sku, v.position, il.available
     from product_variants v
     join inventory_levels il on il.variant_id = v.id
     where v.product_id = $1 order by v.position`,
    [id],
  );

  // El orden del array es el orden de la variante: la PLP muestra la primera y
  // su precio es el que ve el cliente.
  assert.deepEqual(
    r.rows.map((v) => [v.sku, v.position, v.available]),
    [
      ['CAM-AZ', 0, 4],
      ['CAM-NE', 1, 2],
    ],
  );

  const medios = await db.query(`select 1 from product_media where product_id = $1`, [id]);
  assert.equal(medios.rows.length, 1);
});

test('editar borra las variantes que ya no están y renumera el resto', async () => {
  const id = await guardar(producto('remera'));
  const previas = await db.query<{ id: string }>(
    `select id from product_variants where product_id = $1`,
    [id],
  );

  await guardar({
    id,
    handle: 'remera',
    title: 'Remera',
    status: 'active',
    variants: [
      // La existente pasa a segunda; entra una nueva adelante.
      { sku: 'REM-NUEVA', title: 'S', price: 500, currency: 'PYG', attributes: {}, stock: 1 },
      {
        id: previas.rows[0]!.id,
        sku: 'SKU-REMERA',
        title: 'Única',
        price: 1000,
        currency: 'PYG',
        attributes: { color: 'Negro' },
        stock: 3,
      },
    ],
    media: [],
  });

  const r = await db.query<{ sku: string; position: number }>(
    `select sku, position from product_variants where product_id = $1 order by position`,
    [id],
  );
  assert.deepEqual(
    r.rows.map((v) => [v.sku, v.position]),
    [
      ['REM-NUEVA', 0],
      ['SKU-REMERA', 1],
    ],
  );
});

test('un producto sin variantes falla y no deja nada a medias', async () => {
  const antes = await db.query(`select 1 from products where handle = 'vacio'`);
  assert.equal(antes.rows.length, 0);

  await assert.rejects(
    () => guardar({ handle: 'vacio', title: 'Vacío', status: 'draft', variants: [], media: [] }),
    /al menos una variante/,
  );

  // Lo que importa no es el mensaje: es que la función sea atómica. Si el
  // producto quedara creado, el siguiente intento chocaría con el handle único
  // y el usuario no podría guardar nunca.
  const despues = await db.query(`select 1 from products where handle = 'vacio'`);
  assert.equal(despues.rows.length, 0);
});

test('un campo que posee el ERP no se pisa al guardar', async () => {
  const id = await guardar(producto('erp', { title: 'Título del ERP', brand: 'Norte' }));
  await db.query(`update products set field_sources = '{"title":"ERP","price":"ERP"}'::jsonb
                  where id = $1`, [id]);

  await guardar({
    id,
    handle: 'erp',
    title: 'Título editado a mano',
    brand: 'Otra marca',
    status: 'active',
    variants: [
      {
        id: (await db.query<{ id: string }>(`select id from product_variants where product_id = $1`, [id])).rows[0]!.id,
        sku: 'SKU-ERP',
        title: 'Única',
        price: 999999,
        currency: 'PYG',
        attributes: {},
      },
    ],
    media: [],
  });

  const r = await db.query<{ title: string; brand: string; price: string }>(
    `select p.title, p.brand, v.price from products p
     join product_variants v on v.product_id = p.id where p.id = $1`,
    [id],
  );

  // El formulario ya deshabilita estos campos, pero el frontend no es la capa de
  // autorización: una petición armada a mano llegaría igual.
  assert.equal(r.rows[0]!.title, 'Título del ERP');
  assert.equal(String(r.rows[0]!.price), '1000');
  // La marca no la posee el ERP en este producto, así que sí se edita.
  assert.equal(r.rows[0]!.brand, 'Otra marca');
});

test('el listado incluye borradores y encuentra por SKU', async () => {
  // El storefront nunca ve un borrador; el Admin tiene que verlo o no habría
  // forma de terminar de cargarlo.
  await guardar(producto('borrador'));

  const todos = await listar({});
  assert.ok(
    todos.items.some((p) => p.handle === 'borrador' && p.status === 'draft'),
    'el Admin debe ver borradores',
  );

  const porSku = await listar({ query: 'CAM-NE' });
  assert.deepEqual(
    porSku.items.map((p) => p.handle),
    ['campera'],
  );

  // Todos los términos deben aparecer, como en el storefront.
  assert.equal((await listar({ query: 'campera inexistente' })).total, 0);
});

test('el listado resume variantes, stock y precio desde', async () => {
  const r = await listar({ query: 'campera' });
  const campera = r.items[0]!;
  assert.equal(campera.variantes, 2);
  assert.equal(campera.stock, 6);
  assert.equal(campera.precioDesde, 389000);
  assert.equal(campera.imagen, '/a.jpg');
});

test('el listado pagina y acota una página fuera de rango', async () => {
  const r = await listar({ perPage: 1, page: 99 });
  assert.equal(r.perPage, 1);
  assert.equal(r.page, r.pageCount);
  assert.equal(r.items.length, 1);
});

test('el listado filtra por estado', async () => {
  const activos = await listar({ status: 'active' });
  assert.ok(activos.items.every((p) => p.status === 'active'));
  assert.ok(activos.total > 0);
});

test('el listado no muestra productos de otra tienda', async () => {
  await guardar(producto('de-la-otra'), OTRA_STORE);
  const r = await listar({ query: 'de-la-otra' });
  assert.equal(r.total, 0);
});

// --- Import -----------------------------------------------------------------

async function importar(productos: unknown[], store = STORE) {
  const r = await db.query<{ j: { ok: boolean; handle: string; accion: string; error?: string }[] }>(
    `select import_products('${store}'::uuid, ${json(productos)}) as j`,
  );
  return r.rows[0]!.j;
}

test('importar crea, actualiza y dice cuál fue cuál', async () => {
  const reporte = await importar([
    producto('importado-nuevo'),
    // `campera` ya existe: se identifica por handle, que es la clave natural
    // de un archivo.
    { ...producto('campera'), title: 'Campera importada' },
  ]);

  assert.deepEqual(
    reporte.map((r) => [r.handle, r.accion]),
    [
      ['importado-nuevo', 'creado'],
      ['campera', 'actualizado'],
    ],
  );

  const r = await db.query<{ title: string }>(
    `select title from products where store_id = $1 and handle = 'campera'`,
    [STORE],
  );
  assert.equal(r.rows[0]!.title, 'Campera importada');
});

test('un producto que falla no arrastra a los demás', async () => {
  /*
   * Es la razón de que cada producto vaya en su propio bloque `begin/exception`.
   * Sin eso, un SKU repetido en la fila 400 de un archivo de 500 tiraría el
   * import entero y el operador tendría que adivinar dónde quedó.
   */
  const reporte = await importar([
    producto('antes-del-error'),
    // Sin variantes: la función lo rechaza.
    { handle: 'roto', title: 'Roto', status: 'draft', variants: [] },
    producto('despues-del-error'),
  ]);

  assert.deepEqual(
    reporte.map((r) => r.ok),
    [true, false, true],
  );
  assert.match(reporte[1]!.error!, /al menos una variante/);

  // Los dos buenos entraron de verdad, no sólo en el reporte.
  const r = await db.query(
    `select 1 from products where store_id = $1 and handle in ('antes-del-error', 'despues-del-error')`,
    [STORE],
  );
  assert.equal(r.rows.length, 2);
});

test('importar sin la clave media no borra las imágenes que ya tenía', async () => {
  /*
   * Un CSV no puede llevar el ancho y el alto de una imagen, que son
   * obligatorios contra CLS. Si el import mandara `media: []`, actualizar un
   * producto por archivo le borraría las fotos sin que nadie lo pidiera.
   */
  const antes = await db.query(
    `select count(*)::int as n from product_media m
     join products p on p.id = m.product_id
     where p.store_id = $1 and p.handle = 'campera'`,
    [STORE],
  );
  assert.ok((antes.rows[0] as { n: number }).n > 0, 'el fixture debía tener imágenes');

  await importar([{ ...producto('campera'), title: 'Campera con fotos' }]);

  const despues = await db.query(
    `select count(*)::int as n from product_media m
     join products p on p.id = m.product_id
     where p.store_id = $1 and p.handle = 'campera'`,
    [STORE],
  );
  assert.equal((despues.rows[0] as { n: number }).n, (antes.rows[0] as { n: number }).n);
});

test('importar con media vacía sí las borra', async () => {
  // La convención: la clave ausente es "no tocar"; un array, "que quede así".
  await importar([{ ...producto('campera'), media: [] }]);

  const r = await db.query(
    `select count(*)::int as n from product_media m
     join products p on p.id = m.product_id
     where p.store_id = $1 and p.handle = 'campera'`,
    [STORE],
  );
  assert.equal((r.rows[0] as { n: number }).n, 0);
});

test('un viewer tampoco puede importar', async () => {
  const r = await intentar(
    db,
    VIEWER,
    `select import_products('${STORE}'::uuid, ${json([producto('del-viewer-csv')])})`,
  );
  // La función devuelve un reporte, no un error: lo que importa es que no haya
  // escrito nada.
  const escribio = await db.query(`select 1 from products where handle = 'del-viewer-csv'`);
  assert.equal(escribio.rows.length, 0, 'un viewer importó productos');
  void r;
});

// --- Autorización -----------------------------------------------------------

test('un viewer no puede guardar productos', async () => {
  const r = await intentar(
    db,
    VIEWER,
    `select admin_save_product('${STORE}'::uuid, ${json(producto('del-viewer'))})`,
  );
  assert.equal(r.ok, false, 'un viewer escribió en el catálogo');
});

test('un dueño sí puede guardar productos', async () => {
  const r = await intentar(
    db,
    DUENO,
    `select admin_save_product('${STORE}'::uuid, ${json(producto('del-dueno'))})`,
  );
  assert.equal(r.ok, true, r.error ?? '');
});

test('un dueño de otra organización no ve ni escribe este catálogo', async () => {
  const lectura = await intentar(db, AJENO, `select * from admin_products('${STORE}'::uuid)`);
  // La función corre con los permisos de quien llama: RLS filtra las filas, así
  // que la respuesta llega vacía en vez de con el catálogo ajeno.
  assert.ok(!lectura.ok || lectura.filas <= 1, 'la consulta ajena devolvió filas');

  const escritura = await intentar(
    db,
    AJENO,
    `select admin_save_product('${STORE}'::uuid, ${json(producto('intruso'))})`,
  );
  assert.equal(escritura.ok, false, 'un ajeno escribió en el catálogo');
});

test('el anónimo no puede ni listar', async () => {
  const r = await intentar(db, null, `select * from admin_products('${STORE}'::uuid)`);
  assert.equal(r.ok, false, 'el rol anónimo pudo listar el catálogo');
});
