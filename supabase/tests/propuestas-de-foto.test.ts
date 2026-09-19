import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, como, comoAdmin, comoServicio, intentar } from './harness.ts';

/**
 * Las propuestas de la IA sobre una foto (ADR-130).
 *
 * Lo que se defiende acá es la promesa entera de la decisión: **nada llega a la
 * vitrina sin que una persona lo apruebe**, la original nunca se pierde, y
 * aprobar deja dicho quién fue. Si algo de eso falla, falla en silencio: la
 * tienda muestra una foto que nadie miró.
 */

const TENANT = 'aa000000-0000-4000-8000-000000000000';
const TIENDA = 'bb000000-0000-4000-8000-000000000000';
const DUENO = 'a1000000-0000-4000-8000-000000000000';
const VIEWER = 'a2000000-0000-4000-8000-000000000000';

/** Una segunda tienda **del mismo comercio**: es donde un id equivocado pasa. */
const SUCURSAL = 'bb000000-0000-4000-8000-00000000000b';

const OTRO_TENANT = 'af000000-0000-4000-8000-000000000000';
const OTRA_TIENDA = 'bf000000-0000-4000-8000-000000000000';
const AJENO = 'a3000000-0000-4000-8000-000000000000';

const PRODUCTO = 'd1000000-0000-4000-8000-000000000000';
const OTRO_PRODUCTO = 'd1000000-0000-4000-8000-000000000001';
const RAIZ = 'https://x.supabase.co/storage/v1/object/public/product-media';
const ORIGINAL = `${RAIZ}/t/original.webp`;
const SEGUNDA = `${RAIZ}/t/segunda.webp`;
const OTRA_ORIGINAL = `${RAIZ}/t/otra.webp`;
const PROPUESTA = `${RAIZ}/t/ia/limpia.webp`;

let db: PGlite;

async function crearPropuesta(
  id: string,
  producto = PRODUCTO,
  original = ORIGINAL,
  usuario = DUENO,
): Promise<{ ok: boolean; error?: string }> {
  return intentar(
    db,
    usuario,
    `insert into media_proposals (id, tenant_id, store_id, product_id, original_url, proposed_url, created_by)
     values ('${id}', '${TENANT}', '${TIENDA}', '${producto}', '${original}', '${PROPUESTA}', '${usuario}')`,
  );
}

async function fotoDe(producto: string): Promise<string> {
  const filas = await comoServicio<{ url: string }>(
    db,
    `select url from product_media where product_id = '${producto}' order by position limit 1`,
  );
  return filas[0]!.url;
}

before(async () => {
  db = await baseDePrueba();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${DUENO}', 'dueno@x.test'), ('${VIEWER}', 'viewer@x.test'), ('${AJENO}', 'ajeno@x.test');
    insert into organizations (id, name, slug) values
      ('${TENANT}', 'Comercio', 'c'), ('${OTRO_TENANT}', 'Otro', 'o');
    insert into stores (id, tenant_id, name, slug) values
      ('${TIENDA}', '${TENANT}', 'Tienda', 't'),
      ('${SUCURSAL}', '${TENANT}', 'Sucursal', 's'),
      ('${OTRA_TIENDA}', '${OTRO_TENANT}', 'Otra', 'o');
    insert into memberships (tenant_id, user_id, role) values
      ('${TENANT}', '${DUENO}', 'owner'),
      ('${TENANT}', '${VIEWER}', 'viewer'),
      ('${OTRO_TENANT}', '${AJENO}', 'owner');

    insert into products (id, tenant_id, store_id, handle, title, status) values
      ('${PRODUCTO}', '${TENANT}', '${TIENDA}', 'p1', 'Producto', 'active'),
      ('${OTRO_PRODUCTO}', '${TENANT}', '${TIENDA}', 'p2', 'Otro producto', 'active');
    insert into product_media (tenant_id, product_id, url, width, height, position) values
      ('${TENANT}', '${PRODUCTO}', '${ORIGINAL}', 2048, 1536, 0),
      -- Una segunda foto del mismo producto: aprobar una no puede tocarla.
      ('${TENANT}', '${PRODUCTO}', '${SEGUNDA}', 2048, 1536, 1),
      ('${TENANT}', '${OTRO_PRODUCTO}', '${OTRA_ORIGINAL}', 2048, 1536, 0);
  `);
});

after(async () => {
  await db.close();
});

test('una propuesta no cambia nada hasta que alguien la aprueba', async () => {
  const puesta = await crearPropuesta('50000000-0000-4000-8000-000000000001');
  assert.equal(puesta.ok, true, puesta.error);

  // Se creó, y la foto publicada sigue siendo la original: nada llegó a la
  // vitrina por el solo hecho de que la IA propusiera algo.
  await comoAdmin(
    db,
    DUENO,
    `insert into media_proposals (id, tenant_id, store_id, product_id, original_url, proposed_url, created_by)
     values ('50000000-0000-4000-8000-000000000002', '${TENANT}', '${TIENDA}', '${OTRO_PRODUCTO}',
             '${OTRA_ORIGINAL}', '${PROPUESTA}', '${DUENO}')`,
  );
  assert.equal(await fotoDe(PRODUCTO), ORIGINAL);
});

test('aprobar publica la foto propuesta y deja dicho quién fue', async () => {
  await comoAdmin(
    db,
    DUENO,
    `insert into media_proposals (id, tenant_id, store_id, product_id, original_url, proposed_url, created_by)
     values ('50000000-0000-4000-8000-000000000010', '${TENANT}', '${TIENDA}', '${PRODUCTO}',
             '${ORIGINAL}', '${PROPUESTA}', '${DUENO}')`,
  );

  const aplicadas = await comoAdmin<{ n: number }>(
    db,
    DUENO,
    `select admin_apply_media_proposals('${TIENDA}'::uuid,
       array['50000000-0000-4000-8000-000000000010']::uuid[]) as n`,
  );
  assert.equal(aplicadas[0]!.n, 1);
  assert.equal(await fotoDe(PRODUCTO), PROPUESTA, 'la foto publicada no cambió');

  const fila = await comoServicio<{ status: string; decided_by: string; original_url: string }>(
    db,
    `select status, decided_by, original_url from media_proposals
      where id = '50000000-0000-4000-8000-000000000010'`,
  );
  assert.equal(fila[0]!.status, 'approved');
  assert.equal(fila[0]!.decided_by, DUENO, 'no quedó registrado quién aprobó');
  // Y la original sigue guardada: es lo que permite volver atrás.
  assert.equal(fila[0]!.original_url, ORIGINAL);
});

test('aprobar sólo toca la foto de la que se partió, no las otras del producto', async () => {
  assert.equal(
    await comoServicio<{ n: number }>(
      db,
      `select count(*)::int as n from product_media
        where product_id = '${PRODUCTO}' and url = '${SEGUNDA}'`,
    ).then((f) => f[0]!.n),
    1,
    'la segunda foto del producto se perdió al aprobar la primera',
  );
});

test('aprobar dos veces no vuelve a hacer nada', async () => {
  const otra = await comoAdmin<{ n: number }>(
    db,
    DUENO,
    `select admin_apply_media_proposals('${TIENDA}'::uuid,
       array['50000000-0000-4000-8000-000000000010']::uuid[]) as n`,
  );
  assert.equal(otra[0]!.n, 0, 'una propuesta ya decidida se volvió a aplicar');
});

test('no se puede aprobar la propuesta de otro comercio', async () => {
  const ajena = await comoAdmin<{ n: number }>(
    db,
    AJENO,
    `select admin_apply_media_proposals('${OTRA_TIENDA}'::uuid,
       array['50000000-0000-4000-8000-000000000002']::uuid[]) as n`,
  );
  assert.equal(ajena[0]!.n, 0, 'se aprobó una propuesta de otro comercio');
  assert.equal(await fotoDe(OTRO_PRODUCTO), OTRA_ORIGINAL);
});

test('un viewer no puede proponer ni aprobar: mirar no es publicar', async () => {
  const creada = await crearPropuesta(
    '50000000-0000-4000-8000-000000000020',
    OTRO_PRODUCTO,
    OTRA_ORIGINAL,
    VIEWER,
  );
  assert.equal(creada.ok, false, 'un viewer pudo crear una propuesta');

  const aplicada = await intentar(
    db,
    VIEWER,
    `select admin_apply_media_proposals('${TIENDA}'::uuid,
       array['50000000-0000-4000-8000-000000000002']::uuid[])`,
  );
  if (aplicada.ok) {
    assert.equal(await fotoDe(OTRO_PRODUCTO), OTRA_ORIGINAL, 'un viewer publicó una foto');
  }
});

test('una propuesta ajena no se lee ni se escribe desde otro comercio', async () => {
  const vistas = await como<{ n: number }>(
    db,
    AJENO,
    'select count(*)::int as n from media_proposals',
  );
  assert.equal(vistas[0]!.n, 0, 'se filtró la propuesta de otro comercio');

  const escrita = await intentar(
    db,
    AJENO,
    `insert into media_proposals (tenant_id, store_id, product_id, original_url, proposed_url)
     values ('${TENANT}', '${TIENDA}', '${PRODUCTO}', '${ORIGINAL}', '${PROPUESTA}')`,
  );
  assert.equal(escrita.ok, false, 'se escribió una propuesta en el comercio de otro');
});

test('no se acumulan dos propuestas pendientes del mismo producto', async () => {
  // Pedir dos veces la misma limpieza gasta la clave del comercio dos veces y
  // deja dos filas que deciden lo mismo.
  const segunda = await crearPropuesta('50000000-0000-4000-8000-000000000030', OTRO_PRODUCTO);
  assert.equal(segunda.ok, false, 'se pudo dejar dos propuestas pendientes del mismo producto');
});

test('el navegador anónimo no toca nada de esto', async () => {
  const lectura = await intentar(db, null, 'select * from media_proposals');
  assert.equal(lectura.filas, 0);

  const [{ puede }] = await comoServicio<{ puede: boolean }>(
    db,
    `select has_function_privilege('anon', 'public.admin_apply_media_proposals(uuid, uuid[])', 'execute') as puede`,
  );
  assert.equal(puede, false);
});

test('aprobar con el id de otra tienda del mismo comercio no aplica nada', async () => {
  /*
   * RLS no alcanza acá: el dueño **sí** puede leer y escribir las dos tiendas de
   * su comercio. Lo único que separa una de otra es el `where` por tienda de la
   * función, y los ids llegan del navegador. Sin este caso, quitarlo no ponía
   * nada en rojo (medido).
   */
  // La propuesta pendiente del segundo producto, que ya existe: pedir otra del
  // mismo producto la rechazaría el índice único, y con razón.
  const aplicadas = await comoAdmin<{ n: number }>(
    db,
    DUENO,
    `select admin_apply_media_proposals('${SUCURSAL}'::uuid,
       array['50000000-0000-4000-8000-000000000002']::uuid[]) as n`,
  );
  assert.equal(aplicadas[0]!.n, 0, 'se aplicó una propuesta con el id de otra tienda');
  assert.equal(await fotoDe(OTRO_PRODUCTO), OTRA_ORIGINAL);
});

test('volver atrás una foto aprobada no se deshace sola en la próxima tanda', async () => {
  /*
   * Arrepentirse es parte de la promesa: la original queda guardada y se puede
   * volver a poner. Lo que no puede pasar es que aprobar otra tanda vuelva a
   * pisarla con la de la IA, porque esa propuesta ya se decidió.
   */
  await comoServicio(
    db,
    `update product_media set url = '${ORIGINAL}'
      where product_id = '${PRODUCTO}' and url = '${PROPUESTA}'`,
  );

  await comoAdmin<{ n: number }>(
    db,
    DUENO,
    `select admin_apply_media_proposals('${TIENDA}'::uuid,
       array['50000000-0000-4000-8000-000000000010']::uuid[]) as n`,
  );

  assert.equal(await fotoDe(PRODUCTO), ORIGINAL, 'la foto volvió a la versión de la IA sola');
});
