import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba } from './harness.ts';

/**
 * El stock se guarda en la sucursal que el payload nombra.
 *
 * Una tienda con **dos** sucursales, que es lo que ninguna prueba tenía: con una
 * sola, «la primera» y «la única» son lo mismo y los tres hallazgos del backlog
 * no se pueden reproducir. Acá se reproducen.
 *
 * Corre como dueño de la base, sin RLS: lo que se prueba es la lógica de
 * `admin_save_product`. Los grants no cambiaron, así que la autorización la
 * siguen cubriendo `admin-catalogo.test.ts` y la suite de aislamiento.
 */

const TENANT = 'a7000000-0000-4000-8000-000000000000';
const STORE = 'b7000000-0000-4000-8000-000000000000';
const CENTRO = 'c7000000-0000-4000-8000-000000000001';
const DEPOSITO = 'c7000000-0000-4000-8000-000000000002';
const OTRA_STORE = 'b7000000-0000-4000-8000-000000000009';
const AJENA = 'c7000000-0000-4000-8000-000000000009';

let db: PGlite;

function json(valor: unknown): string {
  return `'${JSON.stringify(valor).replace(/'/g, "''")}'::jsonb`;
}

async function guardar(producto: unknown): Promise<string> {
  const r = await db.query<{ id: string }>(
    `select admin_save_product('${STORE}'::uuid, ${json(producto)}) as id`,
  );
  return r.rows[0]!.id;
}

/** El stock de un producto, por sucursal, para poder afirmar sobre cada una. */
async function stock(productId: string): Promise<[string, number][]> {
  const r = await db.query<{ name: string; available: number }>(
    `select l.name, il.available
     from inventory_levels il
     join locations l on l.id = il.location_id
     join product_variants v on v.id = il.variant_id
     where v.product_id = $1
     order by l.name`,
    [productId],
  );
  return r.rows.map((f) => [f.name, f.available]);
}

function producto(handle: string, variante: Record<string, unknown>) {
  return {
    handle,
    title: `Producto ${handle}`,
    status: 'active',
    variants: [{ sku: `SKU-${handle}`, title: 'Única', price: 1000, currency: 'PYG', ...variante }],
  };
}

before(async () => {
  db = await baseDePrueba();
  await db.exec(`
    insert into organizations (id, name, slug) values ('${TENANT}', 'Dos', 'dos');
    insert into stores (id, tenant_id, name, slug) values
      ('${STORE}', '${TENANT}', 'Principal', 'principal'),
      ('${OTRA_STORE}', '${TENANT}', 'Otra', 'otra');
    insert into locations (id, tenant_id, store_id, name) values
      ('${CENTRO}', '${TENANT}', '${STORE}', 'Centro'),
      ('${DEPOSITO}', '${TENANT}', '${STORE}', 'Depósito'),
      ('${AJENA}', '${TENANT}', '${OTRA_STORE}', 'Ajena');
  `);
});

after(async () => {
  await db.close();
});

test('cada sucursal recibe su número', async () => {
  const id = await guardar(
    producto('reparto', { stockPorSucursal: { [CENTRO]: 4, [DEPOSITO]: 7 } }),
  );

  assert.deepEqual(await stock(id), [
    ['Centro', 4],
    ['Depósito', 7],
  ]);
});

test('la sucursal que el payload no nombra queda como estaba', async () => {
  const id = await guardar(
    producto('parcial', { stockPorSucursal: { [CENTRO]: 4, [DEPOSITO]: 7 } }),
  );

  // Se edita sólo el Centro. Antes el formulario mandaba la suma de las dos y la
  // escribía en una: 11 en el Centro y 7 en el Depósito, o sea 18 de la nada.
  await guardar({
    id,
    handle: 'parcial',
    title: 'Producto parcial',
    status: 'active',
    variants: [
      {
        sku: 'SKU-parcial',
        title: 'Única',
        price: 1000,
        currency: 'PYG',
        stockPorSucursal: { [CENTRO]: 5 },
      },
    ],
  });

  assert.deepEqual(await stock(id), [
    ['Centro', 5],
    ['Depósito', 7],
  ]);
});

test('guardar dos veces lo mismo no infla el total', async () => {
  const carga = producto('idempotente', { stockPorSucursal: { [CENTRO]: 3, [DEPOSITO]: 2 } });
  const id = await guardar(carga);
  await guardar({ ...carga, id });

  assert.deepEqual(await stock(id), [
    ['Centro', 3],
    ['Depósito', 2],
  ]);
});

test('un negativo se queda en su sucursal y no se compensa con otra', async () => {
  const id = await guardar(
    producto('descuadre', { stockPorSucursal: { [CENTRO]: -2, [DEPOSITO]: 5 } }),
  );

  // La suma —3— es la que ve el storefront y la que veía el Admin. El descuadre
  // sólo existe si se lo mira por sucursal, y por eso el formulario lo hace.
  assert.deepEqual(await stock(id), [
    ['Centro', -2],
    ['Depósito', 5],
  ]);
});

test('un número suelto falla si la tienda tiene más de una sucursal', async () => {
  await assert.rejects(
    () => guardar(producto('suelto', { stock: 9 })),
    /tiene 2 sucursales/,
    'con dos sucursales, un número sin sucursal elegía una y corrompía el inventario en silencio',
  );
});

test('una sucursal de otra tienda no entra', async () => {
  await assert.rejects(
    () => guardar(producto('ajeno', { stockPorSucursal: { [AJENA]: 1 } })),
    /no es de esta tienda/,
  );
});

test('el stock que posee el ERP no se pisa, venga como venga', async () => {
  const id = await guardar(
    producto('del-erp', { stockPorSucursal: { [CENTRO]: 4, [DEPOSITO]: 1 } }),
  );
  await db.query(`update products set field_sources = '{"stock":"ERP"}'::jsonb where id = $1`, [
    id,
  ]);

  await guardar({
    id,
    handle: 'del-erp',
    title: 'Producto del-erp',
    status: 'active',
    variants: [
      {
        sku: 'SKU-del-erp',
        title: 'Única',
        price: 1000,
        currency: 'PYG',
        stockPorSucursal: { [CENTRO]: 999, [DEPOSITO]: 999 },
      },
    ],
  });

  assert.deepEqual(await stock(id), [
    ['Centro', 4],
    ['Depósito', 1],
  ]);
});
