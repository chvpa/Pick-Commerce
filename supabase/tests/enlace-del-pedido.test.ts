import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, como, comoServicio } from './harness.ts';

/**
 * El enlace de acuse de un pedido (ADR-142).
 *
 * La numeración es secuencial por tienda, así que lo único que separa a un
 * curioso del pedido de otra persona es el token. Lo que se prueba es eso: que
 * sin el token exacto no se ve nada, que un pedido de otra tienda con el mismo
 * número tampoco, y que las tres formas de fallar respondan igual.
 */

const ORG = 'e9000000-0000-4000-8000-000000000000';
const TIENDA = 'e9100000-0000-4000-8000-000000000000';
const OTRA = 'e9100000-0000-4000-8000-00000000000a';
const SUC = 'e9200000-0000-4000-8000-000000000000';
const SUC_B = 'e9200000-0000-4000-8000-00000000000a';
const PRODUCTO = 'e9300000-0000-4000-8000-000000000000';
const PRODUCTO_B = 'e9300000-0000-4000-8000-00000000000a';
const VARIANTE = 'e9400000-0000-4000-8000-000000000000';
const VARIANTE_B = 'e9400000-0000-4000-8000-00000000000a';
const ALGUIEN = 'e9500000-0000-4000-8000-000000000001';

let db: PGlite;

interface Pedido {
  readonly id: string;
  readonly number: number;
  readonly accessToken: string;
}

async function comprar(tienda: string, variante: string): Promise<Pedido> {
  const [{ j }] = await comoServicio<{ j: { order?: Pedido } }>(
    db,
    `select create_order('${tienda}'::uuid, gen_random_uuid(),
       '{"customer":{"name":"Ana","email":"ana@e.test","phone":"0981123456"},
         "address":{"street":"Calle 1","city":"Asuncion"},
         "paymentMethod":"bank_transfer",
         "lines":[{"variantId":"${variante}","quantity":1}]}'::jsonb) as j`,
  );
  assert.ok(j.order, 'no se pudo comprar');
  return j.order;
}

async function porToken(tienda: string, numero: number, token: string): Promise<unknown> {
  const [{ j }] = await comoServicio<{ j: unknown }>(
    db,
    `select order_by_token('${tienda}'::uuid, ${numero}, '${token}') as j`,
  );
  return j;
}

before(async () => {
  db = await baseDePrueba();
  await db.exec(`
    insert into auth.users (id, email) values ('${ALGUIEN}', 'alguien@e.test');
    insert into organizations (id, name, slug) values ('${ORG}', 'Enlaces', 'enlaces');
    insert into stores (id, tenant_id, name, slug, domain, currency) values
      ('${TIENDA}', '${ORG}', 'Una', 'una', 'una.test', 'PYG'),
      ('${OTRA}', '${ORG}', 'Otra', 'otra', 'otra.test', 'PYG');
    insert into locations (id, tenant_id, store_id, name) values
      ('${SUC}', '${ORG}', '${TIENDA}', 'Central'),
      ('${SUC_B}', '${ORG}', '${OTRA}', 'Central');
    insert into products (id, tenant_id, store_id, handle, title, status) values
      ('${PRODUCTO}', '${ORG}', '${TIENDA}', 'p', 'Producto', 'active'),
      ('${PRODUCTO_B}', '${ORG}', '${OTRA}', 'p', 'Producto', 'active');
    insert into product_variants (id, tenant_id, product_id, sku, title, price, currency, position) values
      ('${VARIANTE}', '${ORG}', '${PRODUCTO}', 'SKU-1', 'U', 100000, 'PYG', 0),
      ('${VARIANTE_B}', '${ORG}', '${PRODUCTO_B}', 'SKU-2', 'U', 100000, 'PYG', 0);
    insert into inventory_levels (tenant_id, variant_id, location_id, available) values
      ('${ORG}', '${VARIANTE}', '${SUC}', 100),
      ('${ORG}', '${VARIANTE_B}', '${SUC_B}', 100);
  `);
});

after(async () => {
  await db.close();
});

test('el pedido nace con su token, y el checkout lo devuelve', async () => {
  const pedido = await comprar(TIENDA, VARIANTE);
  // 64 hexadecimales: dos uuid v4 sin guiones, 244 bits.
  assert.match(pedido.accessToken, /^[0-9a-f]{64}$/);
});

test('con el número y el token exactos se ve el pedido', async () => {
  const pedido = await comprar(TIENDA, VARIANTE);
  const j = (await porToken(TIENDA, pedido.number, pedido.accessToken)) as Pedido | null;
  assert.equal(j?.id, pedido.id);
});

test('sin el token exacto no se ve nada, y las tres formas de fallar dicen lo mismo', async () => {
  const pedido = await comprar(TIENDA, VARIANTE);
  const otroToken = pedido.accessToken.replace(/^./, (c) => (c === 'a' ? 'b' : 'a'));

  // Token equivocado, número que no existe y token vacío: `null` los tres.
  // Distinguirlos diría si ese número de pedido existe.
  assert.equal(await porToken(TIENDA, pedido.number, otroToken), null);
  assert.equal(await porToken(TIENDA, 999999, pedido.accessToken), null);
  assert.equal(await porToken(TIENDA, pedido.number, ''), null);
});

test('el mismo número en otra tienda no abre este pedido', async () => {
  const deAca = await comprar(TIENDA, VARIANTE);
  const deAlla = await comprar(OTRA, VARIANTE_B);

  // Las dos numeraciones empiezan igual, así que un número se repite entre
  // tiendas: el token de una no puede abrir el pedido de la otra.
  assert.equal(await porToken(OTRA, deAca.number, deAca.accessToken), null);
  assert.notEqual(deAca.accessToken, deAlla.accessToken);
});

test('un comprador autenticado no puede usar la función', async () => {
  const pedido = await comprar(TIENDA, VARIANTE);
  await assert.rejects(
    () =>
      como(
        db,
        ALGUIEN,
        `select order_by_token('${TIENDA}'::uuid, ${pedido.number}, '${pedido.accessToken}')`,
      ),
    /permission denied/,
  );
});
