import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, como, intentar } from './harness.ts';

/**
 * Definition of Done de Fase 3: dos tenants coexisten sin verse.
 * Cada caso de acá es una forma concreta en que eso podría fallar.
 */

const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';
const DUENO_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const STAFF_A = 'aaaaaaaa-0000-0000-0000-000000000002';
const VIEWER_A = 'aaaaaaaa-0000-0000-0000-000000000003';
const DUENO_B = 'bbbbbbbb-0000-0000-0000-000000000001';
const AJENO = 'cccccccc-0000-0000-0000-000000000001';

let db: PGlite;

before(async () => {
  db = await baseDePrueba();

  // El seed corre como dueño de la base, saltéandose RLS a propósito: es lo
  // que hace el servicio de provisionamiento, no un usuario.
  await db.exec(`
    insert into auth.users (id, email) values
      ('${DUENO_A}', 'a-owner@x.test'),
      ('${STAFF_A}', 'a-staff@x.test'),
      ('${VIEWER_A}', 'a-viewer@x.test'),
      ('${DUENO_B}', 'b-owner@x.test'),
      ('${AJENO}',  'sin-org@x.test');

    insert into organizations (id, name, slug) values
      ('${ORG_A}', 'Tienda A', 'tienda-a'),
      ('${ORG_B}', 'Tienda B', 'tienda-b');

    insert into stores (id, tenant_id, name, slug, domain) values
      ('11111111-0000-0000-0000-00000000aaaa', '${ORG_A}', 'A principal', 'principal', 'a.test'),
      ('22222222-0000-0000-0000-00000000bbbb', '${ORG_B}', 'B principal', 'principal', 'b.test');

    insert into memberships (tenant_id, user_id, role) values
      ('${ORG_A}', '${DUENO_A}', 'owner'),
      ('${ORG_A}', '${STAFF_A}', 'staff'),
      ('${ORG_A}', '${VIEWER_A}', 'viewer'),
      ('${ORG_B}', '${DUENO_B}', 'owner');

    insert into audit_log (tenant_id, actor_id, action, entity) values
      ('${ORG_A}', '${DUENO_A}', 'store.create', 'store'),
      ('${ORG_B}', '${DUENO_B}', 'store.create', 'store');
  `);
});

after(async () => {
  await db.close();
});

test('un tenant no ve las organizaciones de otro', async () => {
  const deA = await como<{ slug: string }>(db, DUENO_A, 'select slug from organizations');
  assert.deepEqual(
    deA.map((o) => o.slug),
    ['tienda-a'],
  );

  const deB = await como<{ slug: string }>(db, DUENO_B, 'select slug from organizations');
  assert.deepEqual(
    deB.map((o) => o.slug),
    ['tienda-b'],
  );
});

test('un tenant no ve las tiendas de otro', async () => {
  const deA = await como<{ name: string }>(db, DUENO_A, 'select name from stores');
  assert.deepEqual(
    deA.map((s) => s.name),
    ['A principal'],
  );
});

test('un usuario sin membresías no ve absolutamente nada', async () => {
  for (const tabla of ['organizations', 'stores', 'memberships', 'audit_log']) {
    const filas = await como(db, AJENO, `select * from ${tabla}`);
    assert.equal(filas.length, 0, `${tabla} filtró datos a un usuario sin organización`);
  }
});

test('el rol anónimo ni siquiera puede consultar estas tablas', async () => {
  // Más fuerte que "devuelve vacío": al browser no se le concede el privilegio.
  // El storefront lee desde el servidor, no por esta vía. Ver ADR-052.
  for (const tabla of ['organizations', 'stores', 'memberships', 'audit_log']) {
    const r = await intentar(db, null, `select * from ${tabla}`);
    assert.equal(r.ok, false, `${tabla} quedó accesible al rol anon`);
    assert.match(r.error ?? '', /permission denied/i, `${tabla}: ${r.error}`);
  }
});

test('la auditoría de un tenant no se filtra al otro', async () => {
  const deA = await como<{ action: string }>(db, DUENO_A, 'select action from audit_log');
  assert.equal(deA.length, 1);

  const deB = await como<{ action: string }>(db, DUENO_B, 'select action from audit_log');
  assert.equal(deB.length, 1);
});

test('el rol viewer no puede escribir', async () => {
  const r = await intentar(
    db,
    VIEWER_A,
    `insert into stores (tenant_id, name, slug) values ('${ORG_A}', 'Nueva', 'nueva')`,
  );
  assert.equal(r.ok, false, 'un viewer creó una tienda');
});

test('el rol staff opera pero no administra la tienda ni el equipo', async () => {
  const tienda = await intentar(
    db,
    STAFF_A,
    `insert into stores (tenant_id, name, slug) values ('${ORG_A}', 'Nueva', 'nueva')`,
  );
  assert.equal(tienda.ok, false, 'staff creó una tienda');

  const equipo = await intentar(
    db,
    STAFF_A,
    `insert into memberships (tenant_id, user_id, role) values ('${ORG_A}', '${AJENO}', 'admin')`,
  );
  assert.equal(equipo.ok, false, 'staff modificó el equipo');
});

test('nadie puede ascenderse a sí mismo', async () => {
  // El caso que más importa: sin permiso member.manage, no hay escalada.
  const r = await intentar(
    db,
    STAFF_A,
    `update memberships set role = 'owner' where user_id = '${STAFF_A}'`,
  );
  assert.equal(r.filas, 0, 'un staff se ascendió a owner');
});

test('un dueño no puede escribir en la organización ajena', async () => {
  const r = await intentar(
    db,
    DUENO_B,
    `insert into stores (tenant_id, name, slug) values ('${ORG_A}', 'Intrusa', 'intrusa')`,
  );
  assert.equal(r.ok, false, 'el dueño de B creó una tienda en A');
});

test('el dueño sí puede administrar lo suyo', async () => {
  const r = await intentar(
    db,
    DUENO_A,
    `insert into stores (tenant_id, name, slug) values ('${ORG_A}', 'Segunda', 'segunda')`,
  );
  assert.equal(r.ok, true, `el dueño no pudo crear su tienda: ${r.error}`);
});

test('la auditoría no se puede reescribir ni borrar', async () => {
  // Un registro que el actor puede editar no sirve como evidencia.
  const update = await intentar(db, DUENO_A, `update audit_log set action = 'otra'`);
  assert.equal(update.filas, 0, 'se pudo reescribir la auditoría');

  const del = await intentar(db, DUENO_A, `delete from audit_log`);
  assert.equal(del.filas, 0, 'se pudo borrar la auditoría');
});

test('has_permission resuelve por datos y no por comparación de roles', async () => {
  const [dueno] = await como<{ p: boolean }>(
    db,
    DUENO_A,
    `select app.has_permission('${ORG_A}', 'member.manage') as p`,
  );
  assert.equal(dueno?.p, true);

  const [staff] = await como<{ p: boolean }>(
    db,
    STAFF_A,
    `select app.has_permission('${ORG_A}', 'member.manage') as p`,
  );
  assert.equal(staff?.p, false);

  // Y no concede permisos en una organización de la que no es miembro.
  const [cruzado] = await como<{ p: boolean }>(
    db,
    DUENO_A,
    `select app.has_permission('${ORG_B}', 'catalog.write') as p`,
  );
  assert.equal(cruzado?.p, false);
});
