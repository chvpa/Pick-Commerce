import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, como, comoAdmin, comoServicio, intentar } from './harness.ts';

/**
 * El equipo: quién lo ve y qué invariante lo protege.
 *
 * Dos cosas distintas se prueban acá. Una es el permiso de `admin_team`, que al
 * ser `security definer` saltea RLS y tiene que verificarlo por su cuenta. La
 * otra es la guarda del último owner, que **no** vive en una función sino en un
 * trigger, y por eso los casos la atacan por los tres caminos que existen: el
 * update del Admin, el delete del Admin, y la secret key.
 *
 * El orden importa al final: el caso de los dos owners confirma la transacción y
 * deja al tenant con uno solo, que es la precondición del que le sigue.
 */

const TENANT = 'aa000000-0000-4000-8000-000000000000';
const OTRO_TENANT = 'bb000000-0000-4000-8000-000000000000';

const DUENO = 'f1000000-0000-4000-8000-000000000000';
const DUENO_2 = 'f1000000-0000-4000-8000-000000000001';
const ADMIN_ROL = 'f1000000-0000-4000-8000-000000000002';
const STAFF = 'f1000000-0000-4000-8000-000000000003';
const VIEWER = 'f1000000-0000-4000-8000-000000000004';
const AJENO_USER = 'f1000000-0000-4000-8000-000000000005';

let db: PGlite;

interface Miembro {
  readonly userId: string;
  readonly email: string;
  readonly role: string;
  readonly createdAt: string;
}

async function equipo(usuario: string | null, tenant = TENANT): Promise<Miembro[]> {
  const filas = await como<{ j: Miembro[] }>(
    db,
    usuario,
    `select admin_team('${tenant}'::uuid) as j`,
  );
  return filas[0]!.j;
}

/** El rol de alguien, leído sin RLS de por medio. */
async function rolDe(usuario: string, tenant = TENANT): Promise<string | null> {
  const r = await db.query<{ role: string }>(
    `select role::text from memberships where tenant_id = $1 and user_id = $2`,
    [tenant, usuario],
  );
  return r.rows[0]?.role ?? null;
}

before(async () => {
  db = await baseDePrueba();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${DUENO}', 'dueno@a.test'),
      ('${DUENO_2}', 'segundo@a.test'),
      ('${ADMIN_ROL}', 'admin@a.test'),
      ('${STAFF}', 'staff@a.test'),
      ('${VIEWER}', 'viewer@a.test'),
      ('${AJENO_USER}', 'ajeno@b.test');

    insert into organizations (id, name, slug) values
      ('${TENANT}', 'Comercio A', 'a'), ('${OTRO_TENANT}', 'Comercio B', 'b');

    insert into memberships (tenant_id, user_id, role) values
      ('${TENANT}', '${DUENO}', 'owner'),
      ('${TENANT}', '${DUENO_2}', 'owner'),
      ('${TENANT}', '${ADMIN_ROL}', 'admin'),
      ('${TENANT}', '${STAFF}', 'staff'),
      ('${TENANT}', '${VIEWER}', 'viewer'),
      -- El otro comercio tiene un solo owner: es el que no se puede degradar.
      ('${OTRO_TENANT}', '${AJENO_USER}', 'owner');
  `);
});

after(async () => {
  await db.close();
});

// --- Quién ve el equipo ---------------------------------------------------------

test('un owner ve a todo el equipo con su correo', async () => {
  const miembros = await equipo(DUENO);
  assert.equal(miembros.length, 5);
  assert.deepEqual(
    miembros.map((m) => m.email).sort(),
    ['admin@a.test', 'dueno@a.test', 'segundo@a.test', 'staff@a.test', 'viewer@a.test'],
    'no resolvió los correos desde auth.users',
  );
  assert.equal(miembros.find((m) => m.userId === STAFF)!.role, 'staff');
});

test('el rol admin no tiene member.manage y no ve el equipo', async () => {
  // Es el caso que hace visible el riesgo de `security definer`: si la función
  // no verificara el permiso, acá no habría nada que lo hiciera.
  const r = await intentar(db, ADMIN_ROL, `select admin_team('${TENANT}'::uuid)`);
  assert.equal(r.ok, false, 'un admin sin member.manage vio el equipo');
  assert.match(r.error!, /Sin permiso/);
});

test('un viewer no ve el equipo', async () => {
  const r = await intentar(db, VIEWER, `select admin_team('${TENANT}'::uuid)`);
  assert.equal(r.ok, false);
});

test('el owner de otro comercio no ve este equipo', async () => {
  const r = await intentar(db, AJENO_USER, `select admin_team('${TENANT}'::uuid)`);
  assert.equal(r.ok, false, 'un comercio vio el equipo de otro');
});

test('el rol anónimo no puede pedir el equipo', async () => {
  const r = await intentar(db, null, `select admin_team('${TENANT}'::uuid)`);
  assert.equal(r.ok, false, 'anon pudo invocar admin_team');
});

// --- Quién puede modificarlo -----------------------------------------------------

test('un owner cambia el rol de un miembro', async () => {
  const r = await intentar(
    db,
    DUENO,
    `update memberships set role = 'viewer' where tenant_id = '${TENANT}'::uuid and user_id = '${STAFF}'::uuid`,
  );
  assert.equal(r.ok, true);
  assert.equal(r.filas, 1);
});

test('un staff no puede cambiar roles', async () => {
  // RLS no lanza: simplemente no encuentra la fila. Cero filas es el rechazo.
  const r = await intentar(
    db,
    STAFF,
    `update memberships set role = 'owner' where tenant_id = '${TENANT}'::uuid and user_id = '${STAFF}'::uuid`,
  );
  assert.equal(r.filas, 0, 'un staff se ascendió a owner');
});

test('un viewer no puede quitar a nadie', async () => {
  const r = await intentar(
    db,
    VIEWER,
    `delete from memberships where tenant_id = '${TENANT}'::uuid and user_id = '${DUENO}'::uuid`,
  );
  assert.equal(r.filas, 0, 'un viewer echó al owner');
});

test('el owner de otro comercio no toca este equipo', async () => {
  const r = await intentar(
    db,
    AJENO_USER,
    `delete from memberships where tenant_id = '${TENANT}'::uuid and user_id = '${STAFF}'::uuid`,
  );
  assert.equal(r.filas, 0, 'un comercio modificó el equipo de otro');
});

// --- El último owner --------------------------------------------------------------

test('el único owner no puede bajarse de rol', async () => {
  const r = await intentar(
    db,
    AJENO_USER,
    `update memberships set role = 'staff' where tenant_id = '${OTRO_TENANT}'::uuid and user_id = '${AJENO_USER}'::uuid`,
  );
  assert.equal(r.ok, false, 'la organización se quedó sin owner');
  assert.match(r.error!, /al menos un owner/);
});

test('el único owner no puede quitarse', async () => {
  const r = await intentar(
    db,
    AJENO_USER,
    `delete from memberships where tenant_id = '${OTRO_TENANT}'::uuid and user_id = '${AJENO_USER}'::uuid`,
  );
  assert.equal(r.ok, false, 'la organización se quedó sin owner');
  assert.match(r.error!, /al menos un owner/);
});

test('la secret key tampoco puede dejar la organización sin owner', async () => {
  // El trigger no depende de RLS, así que frena también al camino que la
  // saltea: los scripts de provisionamiento entran por acá.
  await assert.rejects(
    () =>
      comoServicio(
        db,
        `delete from memberships where tenant_id = '${OTRO_TENANT}'::uuid and user_id = '${AJENO_USER}'::uuid`,
      ),
    /al menos un owner/,
    'la secret key dejó la organización sin owner',
  );
});

test('quitar a alguien que no es owner siempre se puede', async () => {
  const r = await intentar(
    db,
    DUENO,
    `delete from memberships where tenant_id = '${TENANT}'::uuid and user_id = '${VIEWER}'::uuid`,
  );
  assert.equal(r.ok, true);
  assert.equal(r.filas, 1);
});

test('con dos owners, uno puede bajarse; el que queda ya no', async () => {
  // Este caso **confirma**: es la única forma de probar la segunda mitad, que
  // depende de que la primera haya persistido.
  await comoAdmin(
    db,
    DUENO,
    `update memberships set role = 'admin' where tenant_id = '${TENANT}'::uuid and user_id = '${DUENO_2}'::uuid`,
  );
  assert.equal(await rolDe(DUENO_2), 'admin', 'el primer descenso no se aplicó');

  const r = await intentar(
    db,
    DUENO,
    `update memberships set role = 'admin' where tenant_id = '${TENANT}'::uuid and user_id = '${DUENO}'::uuid`,
  );
  assert.equal(r.ok, false, 'el último owner pudo bajarse');
  assert.match(r.error!, /al menos un owner/);
  assert.equal(await rolDe(DUENO), 'owner');
});

test('leer memberships sin filtrar por usuario devuelve a todo el equipo', async () => {
  // No es un defecto de la política: un miembro tiene que poder ver a su equipo,
  // y por eso `memberships_lectura` acota por organización y no por persona.
  //
  // Lo que fija este caso es la consecuencia, que costó un bug: quien consulte
  // "mis membresías" **tiene** que filtrar por `user_id`. Sin eso recibe una
  // fila por compañero, y si le estampa a todas el id del usuario actual, el
  // Admin termina creyendo que un viewer es owner. Pasó en Fase 6.
  const filas = await como<{ user_id: string; role: string }>(
    db,
    VIEWER,
    `select user_id, role::text from memberships where tenant_id = '${TENANT}'::uuid`,
  );

  assert.ok(filas.length > 1, 'el fixture no tiene equipo suficiente para probarlo');
  assert.ok(
    filas.some((f) => f.role === 'owner'),
    'un viewer no vio el rol de un owner, y la política dice que debería',
  );

  // Filtrando sí queda sólo la suya, que es lo que el adapter necesita.
  const propias = await como<{ role: string }>(
    db,
    VIEWER,
    `select role::text from memberships
      where tenant_id = '${TENANT}'::uuid and user_id = '${VIEWER}'::uuid`,
  );
  assert.deepEqual(
    propias.map((f) => f.role),
    ['viewer'],
  );
});

test('dar de baja la organización entera sí se puede', async () => {
  // `memberships` cascadea desde `organizations`, así que la baja dispara este
  // mismo trigger. Sin la excepción, un tenant con un solo propietario —el caso
  // normal— era imposible de borrar, y el error decía que le faltaba un owner
  // cuando lo que pasaba es que se estaba yendo.
  //
  // El otro lado de la moneda lo cubren los casos de arriba: sobre una
  // organización viva, el último owner sigue sin poder bajarse.
  const ORG = 'cc000000-0000-4000-8000-000000000000';
  const SOLO = 'f1000000-0000-4000-8000-000000000009';

  await db.exec(`
    insert into auth.users (id, email) values ('${SOLO}', 'solo@c.test');
    insert into organizations (id, name, slug) values ('${ORG}', 'Comercio C', 'c');
    insert into memberships (tenant_id, user_id, role) values ('${ORG}', '${SOLO}', 'owner');
  `);

  await comoServicio(db, `delete from organizations where id = '${ORG}'::uuid`);

  const quedan = await db.query<{ n: number }>(
    `select count(*)::int as n from memberships where tenant_id = $1`,
    [ORG],
  );
  assert.equal(quedan.rows[0]!.n, 0, 'la baja dejó membresías huérfanas');
});
