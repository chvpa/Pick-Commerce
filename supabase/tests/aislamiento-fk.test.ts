import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, intentar } from './harness.ts';

/**
 * Un comercio no puede colgar filas del catálogo de otro.
 *
 * RLS valida `app.has_permission(tenant_id, ...)`, o sea la **columna
 * `tenant_id` de la fila que se inserta**, y no a quién pertenece el padre al
 * que esa fila apunta. Postgres tampoco aplica políticas al verificar una clave
 * foránea. El resultado era que un owner del tenant B, con permisos sólo sobre
 * B, podía escribir con su propio `tenant_id` apuntando a un producto o una
 * variante de A.
 *
 * No es teórico: se reprodujo antes de arreglarlo. El storefront de A pasó de 30
 * unidades a 10029, y el Admin de A siguió viendo 30 —la fila envenenada no es
 * suya, así que RLS se la esconde justamente a la víctima—.
 *
 * Lo cierra el schema, no una política: desde la migración de claves foráneas
 * compuestas, cada FK lleva el tenant y apuntar afuera es imposible. Estas
 * pruebas afirman esa imposibilidad; se comprobó que **todas fallan** si se
 * quita esa migración.
 */

const A = 'aa000000-0000-4000-8000-000000000000';
const B = 'bb000000-0000-4000-8000-000000000000';
const TIENDA_A = 'a5000000-0000-4000-8000-000000000000';
const TIENDA_B = 'b5000000-0000-4000-8000-000000000000';
const SUCURSAL_A = 'a6000000-0000-4000-8000-000000000000';
const SUCURSAL_B = 'b6000000-0000-4000-8000-000000000000';
const PRODUCTO_A = 'a7000000-0000-4000-8000-000000000000';
const VARIANTE_A = 'a8000000-0000-4000-8000-000000000000';
const CATEGORIA_A = 'a9000000-0000-4000-8000-000000000000';
const COLECCION_B = 'b7000000-0000-4000-8000-000000000000';

/** Owner del tenant B: tiene `catalog.write`, pero sólo sobre lo suyo. */
const INTRUSO = 'b9000000-0000-4000-8000-000000000000';

let db: PGlite;

before(async () => {
  db = await baseDePrueba();
  await db.exec(`
    insert into auth.users (id, email) values ('${INTRUSO}', 'intruso@b.test');

    insert into organizations (id, name, slug) values
      ('${A}', 'Comercio A', 'a'), ('${B}', 'Comercio B', 'b');

    insert into stores (id, tenant_id, name, slug, domain, currency) values
      ('${TIENDA_A}', '${A}', 'Tienda A', 'ta', 'a.test', 'PYG'),
      ('${TIENDA_B}', '${B}', 'Tienda B', 'tb', 'b.test', 'PYG');

    insert into locations (id, tenant_id, store_id, name) values
      ('${SUCURSAL_A}', '${A}', '${TIENDA_A}', 'Depósito A'),
      ('${SUCURSAL_B}', '${B}', '${TIENDA_B}', 'Depósito B');

    insert into memberships (tenant_id, user_id, role) values ('${B}', '${INTRUSO}', 'owner');

    insert into categories (id, tenant_id, store_id, name, slug, position)
      values ('${CATEGORIA_A}', '${A}', '${TIENDA_A}', 'Ropa', 'ropa', 0);

    insert into products (id, tenant_id, store_id, handle, title, status)
      values ('${PRODUCTO_A}', '${A}', '${TIENDA_A}', 'remera', 'Remera', 'active');

    insert into product_variants (id, tenant_id, product_id, sku, title, price, currency, position)
      values ('${VARIANTE_A}', '${A}', '${PRODUCTO_A}', 'SKU-A', 'Única', 100000, 'PYG', 0);

    insert into inventory_levels (tenant_id, variant_id, location_id, available)
      values ('${A}', '${VARIANTE_A}', '${SUCURSAL_A}', 30);

    insert into collections (id, tenant_id, store_id, handle, title)
      values ('${COLECCION_B}', '${B}', '${TIENDA_B}', 'ofertas', 'Ofertas');
  `);
});

after(async () => {
  await db.close();
});

/**
 * Cada caso escribe con el `tenant_id` del intruso —lo que RLS aprueba— pero
 * apuntando a una fila de A. Lo que tiene que rechazarlo es la clave foránea.
 */
const ATAQUES: readonly (readonly [string, string])[] = [
  [
    'stock sobre una variante ajena',
    `insert into inventory_levels (tenant_id, variant_id, location_id, available)
     values ('${B}', '${VARIANTE_A}', '${SUCURSAL_B}', 9999)`,
  ],
  [
    'imagen sobre un producto ajeno',
    `insert into product_media (tenant_id, product_id, url, alt, width, height, position)
     values ('${B}', '${PRODUCTO_A}', 'https://intruso.test/x.jpg', '', 10, 10, 99)`,
  ],
  [
    'variante sobre un producto ajeno',
    `insert into product_variants (tenant_id, product_id, sku, title, price, currency, position)
     values ('${B}', '${PRODUCTO_A}', 'SKU-INTRUSO', 'Intrusa', 1, 'PYG', 99)`,
  ],
  [
    'producto en una categoría ajena',
    `insert into products (tenant_id, store_id, handle, title, status, category_id)
     values ('${B}', '${TIENDA_B}', 'intruso', 'Intruso', 'active', '${CATEGORIA_A}')`,
  ],
  [
    'producto ajeno dentro de una colección propia',
    `insert into collection_products (tenant_id, collection_id, product_id, position)
     values ('${B}', '${COLECCION_B}', '${PRODUCTO_A}', 0)`,
  ],
  [
    'sucursal colgada de una tienda ajena',
    `insert into locations (tenant_id, store_id, name)
     values ('${B}', '${TIENDA_A}', 'Sucursal fantasma')`,
  ],
  [
    'definición de atributo sobre una categoría ajena',
    `insert into attribute_definitions (tenant_id, store_id, category_id, name, label, position)
     values ('${B}', '${TIENDA_B}', '${CATEGORIA_A}', 'color', 'Color', 0)`,
  ],
];

for (const [nombre, sql] of ATAQUES) {
  test(`el schema rechaza: ${nombre}`, async () => {
    const r = await intentar(db, INTRUSO, sql);
    assert.equal(r.ok, false, 'la escritura cross-tenant tendría que ser imposible');
    assert.match(
      r.error ?? '',
      /foreign key|clave foránea/i,
      `se esperaba un rechazo de la clave foránea, no: ${r.error}`,
    );
  });
}

/**
 * La contracara: lo legítimo tiene que seguir funcionando. Sin este caso, una
 * FK rota "hacia el lado seguro" —que rechace todo— pasaría los siete casos de
 * arriba y rompería el producto entero.
 */
test('el mismo comercio sí puede colgar filas de lo suyo', async () => {
  const r = await intentar(
    db,
    INTRUSO,
    `with p as (
       insert into products (tenant_id, store_id, handle, title, status)
       values ('${B}', '${TIENDA_B}', 'propio', 'Propio', 'active')
       returning id
     )
     insert into product_variants (tenant_id, product_id, sku, title, price, currency, position)
     select '${B}', p.id, 'SKU-B', 'Única', 5000, 'PYG', 0 from p`,
  );
  assert.equal(r.ok, true, r.error);
});

/**
 * Borrar una categoría no puede arrastrar el `tenant_id` del producto.
 *
 * Con una FK compuesta y `on delete set null` sin lista de columnas, Postgres
 * intentaría anular también `tenant_id`, que es `not null`, y el borrado
 * fallaría. La migración usa `on delete set null (category_id)`.
 */
test('borrar una categoría deja el producto sin categoría, no roto', async () => {
  const r = await intentar(
    db,
    INTRUSO,
    `with c as (
       insert into categories (tenant_id, store_id, name, slug, position)
       values ('${B}', '${TIENDA_B}', 'Temporal', 'temporal', 0) returning id
     ), p as (
       insert into products (tenant_id, store_id, handle, title, status, category_id)
       select '${B}', '${TIENDA_B}', 'con-categoria', 'Con categoría', 'active', c.id from c
       returning id
     )
     delete from categories where id in (select id from c)`,
  );
  assert.equal(r.ok, true, r.error);
});
