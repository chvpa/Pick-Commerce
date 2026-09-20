import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, como, comoServicio, intentar } from './harness.ts';

/**
 * El sustrato de la búsqueda semántica (v2 Fase 7, ADR-132).
 *
 * **Lo que esta suite puede probar y lo que no está decidido por PGlite**, que
 * no tiene la extensión `vector`. Acá se prueba todo lo que no la necesita, que
 * resulta ser lo que más puede romper la tienda:
 *
 * - que la degradación exista: sin vectores, `app.similitud_semantica` devuelve
 *   cero filas y el catálogo sigue siendo el léxico de la Fase 3, idéntico;
 * - que las dos tablas nuevas no se puedan leer desde el navegador;
 * - que la caché de frases no cruce de tienda.
 *
 * La columna vectorial, el operador `<=>` y los tiempos sólo se verifican contra
 * el proyecto remoto. Eso está dicho en el ADR y en el ROADMAP, y es el cuarto
 * punto del Definition of Done de la fase: decir qué no cubre la suite.
 */

const TENANT = 'aa000000-0000-4000-8000-000000000000';
const TIENDA = 'bb000000-0000-4000-8000-000000000000';
const SUCURSAL = 'cc000000-0000-4000-8000-000000000000';
const DUENO = 'a1000000-0000-4000-8000-000000000000';
const FORASTERO = 'a1000000-0000-4000-8000-0000000000ff';

const OTRO_TENANT = 'af000000-0000-4000-8000-000000000000';
const OTRA_TIENDA = 'bf000000-0000-4000-8000-000000000000';

let db: PGlite;

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
});

after(async () => {
  await db.close();
});

// --- La degradación, que es la promesa de la fase -----------------------------

test('sin vectores, la similitud devuelve cero filas', async () => {
  // No es un detalle de implementación: es lo que hace que una tienda sin clave
  // de OpenAI —o con la extensión ausente, como acá— siga teniendo el buscador
  // de la Fase 3 entero, sin un `if` que alguien pueda olvidar.
  const filas = await comoServicio<{ product_id: string }>(
    db,
    `select * from app.similitud_semantica('${TIENDA}'::uuid, 'lo-que-sea')`,
  );
  assert.deepEqual(filas, []);
});

test('la similitud tampoco inventa filas para una tienda que no existe', async () => {
  const filas = await comoServicio(
    db,
    `select * from app.similitud_semantica('${OTRA_TIENDA}'::uuid, 'x')`,
  );
  assert.deepEqual(filas, []);
});

// --- La caché de frases -------------------------------------------------------

test('registrar una frase la guarda normalizada y cuenta las repeticiones', async () => {
  await comoServicio(db, `select registrar_busqueda('${TIENDA}'::uuid, 'Camperas DE Invierno')`);
  await comoServicio(db, `select registrar_busqueda('${TIENDA}'::uuid, 'camperas de invierno')`);

  const filas = await comoServicio<{ termino: string; hits: number; embedded_at: string | null }>(
    db,
    `select termino, hits, embedded_at from search_queries where store_id = '${TIENDA}'`,
  );

  assert.equal(filas.length, 1, 'la misma frase con otras mayúsculas abrió dos filas');
  assert.equal(filas[0]!.termino, 'camperas de invierno');
  assert.equal(filas[0]!.hits, 2);
  // Sin vector: es la cola de lo pendiente, que es lo que el script toma.
  assert.equal(filas[0]!.embedded_at, null);
});

test('una frase vacía no deja fila', async () => {
  await comoServicio(db, `select registrar_busqueda('${TIENDA}'::uuid, '   ')`);
  const filas = await comoServicio<{ n: number | string }>(
    db,
    `select count(*) as n from search_queries where store_id = '${TIENDA}'`,
  );
  assert.equal(Number(filas[0]!.n), 1);
});

test('una tienda que no existe no deja fila', async () => {
  // El `store_id` llega de quien llama. Sin esta guarda, la fila quedaría sin
  // tenant o con uno inventado.
  await comoServicio(
    db,
    `select registrar_busqueda('00000000-0000-4000-8000-000000000000'::uuid, 'algo')`,
  );
  const filas = await comoServicio<{ n: number | string }>(
    db,
    `select count(*) as n from search_queries`,
  );
  assert.equal(Number(filas[0]!.n), 1);
});

test('dos tiendas que buscan lo mismo no comparten la fila', async () => {
  // Un vector se paga con la clave de **un** comercio: compartirlo entre
  // tenants sería gastarle la clave a uno para servirle a otro.
  await comoServicio(
    db,
    `select registrar_busqueda('${OTRA_TIENDA}'::uuid, 'camperas de invierno')`,
  );

  const filas = await comoServicio<{ store_id: string; tenant_id: string }>(
    db,
    `select store_id, tenant_id from search_queries order by store_id`,
  );
  assert.equal(filas.length, 2);
  assert.notEqual(filas[0]!.tenant_id, filas[1]!.tenant_id);
});

// --- Lo que el navegador no puede tocar ---------------------------------------

test('las tablas de vectores no se leen desde el navegador', async () => {
  for (const tabla of ['product_embeddings', 'search_queries']) {
    for (const rol of [DUENO, FORASTERO]) {
      const r = await intentar(db, rol, `select * from ${tabla}`);
      assert.equal(r.ok, false, `${tabla} se pudo leer con un JWT`);
    }
  }
});

test('nadie registra una búsqueda con un JWT', async () => {
  // La escribe el storefront con la secret key. Si `authenticated` pudiera,
  // cualquiera inflaría los `hits` para decidir qué embebe el script, que es
  // gastarle la clave al comercio eligiendo en qué.
  const r = await intentar(db, FORASTERO, `select registrar_busqueda('${TIENDA}'::uuid, 'x')`);
  assert.equal(r.ok, false);
});

test('los grants son los que se escribieron, no los que Postgres deja por defecto', async () => {
  const filas = await comoServicio<{ sim_auth: boolean; sim_anon: boolean; reg_auth: boolean }>(
    db,
    `select
       has_function_privilege('authenticated', 'app.similitud_semantica(uuid, text, integer, real)', 'execute') as sim_auth,
       has_function_privilege('anon', 'app.similitud_semantica(uuid, text, integer, real)', 'execute') as sim_anon,
       has_function_privilege('authenticated', 'public.registrar_busqueda(uuid, text, text)', 'execute') as reg_auth`,
  );

  // El Admin llama a `catalog_search` con la publishable key para las facetas,
  // así que la similitud tiene que alcanzarle: `product_trending` nació sin esto
  // y dejó dos pantallas con «permission denied».
  assert.equal(filas[0]!.sim_auth, true);
  assert.equal(filas[0]!.sim_anon, false);
  assert.equal(filas[0]!.reg_auth, false);
});

// --- El contador y el techo ---------------------------------------------------

test('registrar uso acumula por mes y tipo, y devuelve el total del mes', async () => {
  const uno = await comoServicio<{ t: number | string }>(
    db,
    `select registrar_uso_de_ia('${TIENDA}'::uuid, 'busqueda', 100) as t`,
  );
  const dos = await comoServicio<{ t: number | string }>(
    db,
    `select registrar_uso_de_ia('${TIENDA}'::uuid, 'busqueda', 50) as t`,
  );
  const otro = await comoServicio<{ t: number | string }>(
    db,
    `select registrar_uso_de_ia('${TIENDA}'::uuid, 'fondo', 900) as t`,
  );

  assert.equal(Number(uno[0]!.t), 100);
  assert.equal(Number(dos[0]!.t), 150, 'no acumuló sobre la misma fila');
  // El total del mes es de la tienda, no del tipo: el techo mira la factura.
  assert.equal(Number(otro[0]!.t), 1050);

  const filas = await comoServicio<{ tipo: string; tokens: number | string; llamadas: number }>(
    db,
    `select tipo, tokens, llamadas from ai_usage where store_id='${TIENDA}' order by tipo`,
  );
  assert.deepEqual(
    filas.map((f) => [f.tipo, Number(f.tokens), f.llamadas]),
    [
      ['busqueda', 150, 2],
      ['fondo', 900, 1],
    ],
  );
});

test('el gasto de una tienda no se mezcla con el de otra', async () => {
  const otra = await comoServicio<{ t: number | string }>(
    db,
    `select registrar_uso_de_ia('${OTRA_TIENDA}'::uuid, 'busqueda', 7) as t`,
  );
  assert.equal(Number(otra[0]!.t), 7, 'sumó el gasto de la otra tienda');
});

test('una tienda que no existe no deja rastro de gasto', async () => {
  const r = await comoServicio<{ t: number | string }>(
    db,
    `select registrar_uso_de_ia('00000000-0000-4000-8000-000000000000'::uuid, 'busqueda', 5) as t`,
  );
  assert.equal(Number(r[0]!.t), 0);
});

test('el comercio ve su gasto; el navegador anónimo no, y nadie lo escribe', async () => {
  const propio = await intentar(db, DUENO, `select tokens from ai_usage`);
  assert.equal(propio.ok, true, 'el dueño no pudo ver su propio gasto');

  const ajeno = await como(db, FORASTERO, `select tokens from ai_usage`);
  assert.equal(ajeno.length, 0, 'un forastero vio el gasto de otro comercio');

  const escribe = await intentar(
    db,
    DUENO,
    `select registrar_uso_de_ia('${TIENDA}'::uuid, 'busqueda', 1)`,
  );
  assert.equal(escribe.ok, false, 'el contador se puede inflar desde el navegador');
});

test('registrar una frase dice si ya tiene vector', async () => {
  // Es lo que le ahorra al storefront un segundo viaje a la base en cada
  // búsqueda, incluidas las que ya están resueltas.
  const sinVector = await comoServicio<{ t: boolean }>(
    db,
    `select registrar_busqueda('${TIENDA}'::uuid, 'una frase nueva') as t`,
  );
  assert.equal(sinVector[0]!.t, false);

  const vacia = await comoServicio<{ t: boolean }>(
    db,
    `select registrar_busqueda('${TIENDA}'::uuid, '  ') as t`,
  );
  assert.equal(vacia[0]!.t, false);
});
