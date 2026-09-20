import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, como, comoAdmin, intentar } from './harness.ts';

/**
 * La cola de descripciones y su aprobación (v2 Fase 8).
 *
 * De los 3752 productos activos del piloto, 3674 no tienen descripción, y eso es
 * el techo del buscador: `search_doc` es título más marca, y el vector semántico
 * se arma con eso más categoría y atributos. Sin una línea que diga qué es el
 * producto, no hay con qué encontrarlo cuando alguien lo pide con otras
 * palabras.
 *
 * Lo que se defiende acá es el orden —una descripción sobre algo agotado no
 * vende esta semana— y, sobre todo, **que aprobar no pise lo que administra el
 * ERP** (ADR-117): eso se vería como una descripción que desaparece sola en la
 * próxima importación, sin error en ningún lado.
 */

const TENANT = 'aa000000-0000-4000-8000-000000000000';
const TIENDA = 'bb000000-0000-4000-8000-000000000000';
const SUCURSAL = 'cc000000-0000-4000-8000-000000000000';
const DUENO = 'a1000000-0000-4000-8000-000000000000';
const FORASTERO = 'a1000000-0000-4000-8000-0000000000ff';

const OTRO_TENANT = 'af000000-0000-4000-8000-000000000000';
const OTRA_TIENDA = 'bf000000-0000-4000-8000-000000000000';

const p = (n: number) => `d1${String(n).padStart(6, '0')}-0000-4000-8000-000000000000`;
const v = (n: number) => `e1${String(n).padStart(6, '0')}-0000-4000-8000-000000000000`;

interface Cola {
  items: { id: string; title: string; stock: number }[];
  total: number;
  cuentas: {
    activos: number;
    conDescripcion: number;
    sinDescripcion: number;
    pendientes: number;
    escritasSemana: number;
  };
}

let db: PGlite;

async function producto(
  n: number,
  stock: number,
  opciones: { descripcion?: string; fuenteErp?: boolean; tienda?: string; tenant?: string } = {},
) {
  const tienda = opciones.tienda ?? TIENDA;
  const tenant = opciones.tenant ?? TENANT;
  const fuentes = opciones.fuenteErp ? `'{"description":"erp"}'::jsonb` : `'{}'::jsonb`;
  const descripcion = opciones.descripcion ? `'${opciones.descripcion}'` : 'null';

  await db.exec(`
    insert into products (id, tenant_id, store_id, handle, title, status, description, field_sources)
      values ('${p(n)}', '${tenant}', '${tienda}', 'p${n}', 'Producto ${n}', 'active',
              ${descripcion}, ${fuentes});
    insert into product_variants (id, tenant_id, product_id, sku, title, price, currency, position)
      values ('${v(n)}', '${tenant}', '${p(n)}', 'SKU-${n}', 'Única', 100, 'PYG', 0);
  `);
  if (tienda === TIENDA) {
    await db.exec(
      `insert into inventory_levels (tenant_id, variant_id, location_id, available)
       values ('${tenant}', '${v(n)}', '${SUCURSAL}', ${stock})`,
    );
  }
}

async function cola(usuario = DUENO): Promise<Cola> {
  const filas = await como<{ j: Cola }>(
    db,
    usuario,
    `select admin_products_without_description('${TIENDA}'::uuid, 1, 20) as j`,
  );
  return filas[0]!.j;
}

before(async () => {
  db = await baseDePrueba();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${DUENO}', 'dueno@x.test'), ('${FORASTERO}', 'forastero@x.test');
    insert into organizations (id, name, slug) values
      ('${TENANT}', 'Comercio', 'c'), ('${OTRO_TENANT}', 'Otro', 'o');
    insert into stores (id, tenant_id, name, slug) values
      ('${TIENDA}', '${TENANT}', 'Tienda', 't'), ('${OTRA_TIENDA}', '${OTRO_TENANT}', 'Otra', 'o');
    insert into locations (id, tenant_id, store_id, name) values
      ('${SUCURSAL}', '${TENANT}', '${TIENDA}', 'Central');
    insert into memberships (tenant_id, user_id, role) values ('${TENANT}', '${DUENO}', 'owner');
  `);

  // Sin descripción: uno agotado, uno con poco stock y uno con mucho, cargados
  // en ese orden para que el alta no coincida con el orden esperado.
  await producto(0, 0);
  await producto(1, 2);
  await producto(2, 9);
  // Con descripción: no entran a la cola.
  await producto(3, 5, { descripcion: 'Ya la tiene.' });
  // Una cadena de espacios no es una descripción.
  await producto(4, 5, { descripcion: '   ' });
  // La administra el ERP y está vacía: entra a la cola, pero aprobar no la pisa.
  await producto(5, 7, { fuenteErp: true });
  // Y uno de otro comercio, que no puede aparecer nunca.
  await producto(9, 9, { tienda: OTRA_TIENDA, tenant: OTRO_TENANT });
});

after(async () => {
  await db.close();
});

test('la cola pone primero lo que se puede vender hoy', async () => {
  const r = await cola();
  assert.deepEqual(
    r.items.map((i) => i.title),
    // 9, 7, 5, 2 y 0 de stock: el orden es por lo que se puede vender hoy.
    ['Producto 2', 'Producto 5', 'Producto 4', 'Producto 1', 'Producto 0'],
  );
});

test('las cuentas dicen si el trabajo avanza', async () => {
  const { cuentas } = await cola();
  assert.equal(cuentas.activos, 6, 'contó productos de otro comercio');
  assert.equal(cuentas.conDescripcion, 1);
  assert.equal(cuentas.sinDescripcion, 5);
  assert.equal(cuentas.escritasSemana, 0);
});

test('un producto con propuesta pendiente sale de la cola', async () => {
  // Si no saliera, la pantalla ofrecería dos veces el mismo trabajo y la clave
  // del comercio se gastaría dos veces por lo mismo.
  await comoAdmin(
    db,
    DUENO,
    `insert into description_proposals (tenant_id, store_id, product_id, proposed)
     values ('${TENANT}', '${TIENDA}', '${p(2)}', 'Una campera de abrigo.')`,
  );

  const r = await cola();
  assert.ok(
    !r.items.some((i) => i.id === p(2)),
    'el producto con propuesta pendiente sigue en la cola',
  );
  assert.equal(r.cuentas.pendientes, 1);
});

test('aprobar escribe la descripción y cierra la propuesta', async () => {
  const [prop] = await como<{ id: string }>(
    db,
    DUENO,
    `select id from description_proposals where product_id = '${p(2)}'`,
  );

  const [r] = await comoAdmin<{ n: number }>(
    db,
    DUENO,
    `select admin_apply_description_proposals('${TIENDA}'::uuid, array['${prop!.id}']::uuid[]) as n`,
  );
  assert.equal(r!.n, 1);

  const [producto2] = await como<{ description: string }>(
    db,
    DUENO,
    `select description from products where id = '${p(2)}'`,
  );
  assert.equal(producto2!.description, 'Una campera de abrigo.');

  const [estado] = await como<{ status: string; decided_by: string }>(
    db,
    DUENO,
    `select status, decided_by from description_proposals where id = '${prop!.id}'`,
  );
  assert.equal(estado!.status, 'approved');
  assert.equal(estado!.decided_by, DUENO, 'no quedó registrado quién aprobó');
});

test('una descripción que administra el ERP no se pisa, y la propuesta igual se cierra', async () => {
  /*
   * ADR-117: `field_sources` declara el dueño de cada campo. Escribirla igual no
   * fallaría en ningún lado: desaparecería sola en la próxima importación, y
   * alguien pasaría una tarde buscando por qué.
   *
   * La propuesta se cierra igual, porque ya se decidió: dejarla pendiente la
   * volvería a ofrecer para siempre.
   */
  await comoAdmin(
    db,
    DUENO,
    `insert into description_proposals (tenant_id, store_id, product_id, proposed)
     values ('${TENANT}', '${TIENDA}', '${p(5)}', 'Esto no tendría que escribirse.')`,
  );

  const [prop] = await como<{ id: string }>(
    db,
    DUENO,
    `select id from description_proposals where product_id = '${p(5)}'`,
  );

  const [r] = await comoAdmin<{ n: number }>(
    db,
    DUENO,
    `select admin_apply_description_proposals('${TIENDA}'::uuid, array['${prop!.id}']::uuid[]) as n`,
  );
  assert.equal(r!.n, 0, 'pisó una descripción que administra el ERP');

  const [producto5] = await como<{ description: string | null }>(
    db,
    DUENO,
    `select description from products where id = '${p(5)}'`,
  );
  assert.equal(producto5!.description, null);

  const [estado] = await como<{ status: string }>(
    db,
    DUENO,
    `select status from description_proposals where id = '${prop!.id}'`,
  );
  assert.equal(estado!.status, 'approved');
});

test('un forastero no ve la cola ni las propuestas de nadie', async () => {
  const r = await intentar(
    db,
    FORASTERO,
    `select admin_products_without_description('${TIENDA}'::uuid, 1, 20) as j`,
  );
  // Invoker: no falla, devuelve vacío. Lo que importa es que no salga nada.
  if (r.ok) {
    const j = (r.filas as { j: Cola }[])[0]?.j;
    assert.equal(j?.items.length ?? 0, 0, 'un forastero vio la cola de otro comercio');
  }

  const propuestas = await como(db, FORASTERO, `select * from description_proposals`);
  assert.equal(propuestas.length, 0, 'un forastero vio las propuestas de otro comercio');
});

test('la cola no la puede pedir el navegador anónimo', async () => {
  const [r] = await como<{ puede: boolean }>(
    db,
    DUENO,
    `select has_function_privilege('anon',
       'admin_products_without_description(uuid, integer, integer)', 'execute') as puede`,
  );
  assert.equal(r!.puede, false);
});
