import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, comoAdmin, intentar } from './harness.ts';

/**
 * `admin_save_settings`: la configuración y su auditoría, o ninguna de las dos.
 *
 * Lo que se protege acá es un requisito de PROJECT.md §33 —cambiar la tasa de
 * cambio a mano deja registro de quién y cuándo— y la forma de romperlo sin que
 * nadie lo note es que la segunda escritura falle sola. Por eso el caso de la
 * auditoría incompleta afirma que los settings quedan **intactos**: hoy pasa
 * porque el `raise` revierte la función entera —comprobado moviendo la
 * validación después del upsert, y el test siguió en verde—, y el día que
 * alguien parta esto en dos llamadas desde el cliente, falla.
 *
 * Los casos que escriben usan `comoAdmin`, que confirma: verificar un merge
 * exige que el guardado anterior haya quedado.
 */

const TENANT = 'aa000000-0000-4000-8000-000000000000';
const TIENDA = 'a5000000-0000-4000-8000-000000000000';
const TIENDA_SIN_SETTINGS = 'a5000000-0000-4000-8000-000000000001';

const OTRO_TENANT = 'bb000000-0000-4000-8000-000000000000';
const OTRA_TIENDA = 'b5000000-0000-4000-8000-000000000000';

const DUENO = 'f1000000-0000-4000-8000-000000000000';
const ADMIN_ROL = 'f1000000-0000-4000-8000-000000000001';
const STAFF = 'f1000000-0000-4000-8000-000000000002';
const VIEWER = 'f1000000-0000-4000-8000-000000000003';
const AJENO_USER = 'f1000000-0000-4000-8000-000000000004';

let db: PGlite;

type Settings = Record<string, Record<string, unknown>>;

function sql(valor: unknown): string {
  return `'${JSON.stringify(valor).replace(/'/g, "''")}'::jsonb`;
}

async function guardar(
  usuario: string,
  parcial: unknown,
  auditoria?: unknown,
  tienda = TIENDA,
): Promise<Settings> {
  const filas = await comoAdmin<{ j: Settings }>(
    db,
    usuario,
    `select admin_save_settings('${tienda}'::uuid, ${sql(parcial)},
                                ${auditoria === undefined ? 'null' : sql(auditoria)}) as j`,
  );
  return filas[0]!.j;
}

async function settingsDe(tienda = TIENDA): Promise<Settings> {
  const r = await db.query<{ settings: Settings }>(
    `select settings from store_settings where store_id = $1`,
    [tienda],
  );
  return r.rows[0]?.settings ?? {};
}

async function auditorias(): Promise<
  { action: string; entity: string; actor_id: string | null; tenant_id: string }[]
> {
  const r = await db.query<{
    action: string;
    entity: string;
    actor_id: string | null;
    tenant_id: string;
  }>(`select action, entity, actor_id, tenant_id from audit_log order by id`);
  return r.rows;
}

before(async () => {
  db = await baseDePrueba();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${DUENO}', 'dueno@a.test'), ('${ADMIN_ROL}', 'admin@a.test'),
      ('${STAFF}', 'staff@a.test'), ('${VIEWER}', 'viewer@a.test'),
      ('${AJENO_USER}', 'ajeno@b.test');

    insert into organizations (id, name, slug) values
      ('${TENANT}', 'Comercio A', 'a'), ('${OTRO_TENANT}', 'Comercio B', 'b');

    insert into stores (id, tenant_id, name, slug, domain, currency) values
      ('${TIENDA}', '${TENANT}', 'Tienda A', 'ta', 'a.test', 'PYG'),
      ('${TIENDA_SIN_SETTINGS}', '${TENANT}', 'Tienda A2', 'ta2', 'a2.test', 'PYG'),
      ('${OTRA_TIENDA}', '${OTRO_TENANT}', 'Tienda B', 'tb', 'b.test', 'PYG');

    insert into memberships (tenant_id, user_id, role) values
      ('${TENANT}', '${DUENO}', 'owner'),
      ('${TENANT}', '${ADMIN_ROL}', 'admin'),
      ('${TENANT}', '${STAFF}', 'staff'),
      ('${TENANT}', '${VIEWER}', 'viewer'),
      ('${OTRO_TENANT}', '${AJENO_USER}', 'owner');

    insert into store_settings (store_id, tenant_id, settings) values
      ('${TIENDA}', '${TENANT}', '{
        "currency": {"base": "PYG", "enabled": false, "checkoutCurrency": "PYG"},
        "payments": {"enabled": ["bank_transfer"], "default": "bank_transfer"}
      }');
  `);
});

after(async () => {
  await db.close();
});

// --- El merge -------------------------------------------------------------------

test('guardar una sección no pisa las otras', async () => {
  const final = await guardar(DUENO, {
    payments: {
      enabled: ['bank_transfer'],
      default: 'bank_transfer',
      bankTransfer: { instructions: 'Transferí a la cuenta 1' },
    },
  });

  assert.deepEqual(
    final.currency,
    { base: 'PYG', enabled: false, checkoutCurrency: 'PYG' },
    'guardar los medios de pago borró la configuración de moneda',
  );
  assert.equal(
    (final.payments!.bankTransfer as { instructions: string }).instructions,
    'Transferí a la cuenta 1',
  );
});

test('dentro de una sección sí reemplaza', async () => {
  // El formulario que edita una sección la conoce entera, así que un merge
  // profundo sólo haría imposible borrar una clave.
  const final = await guardar(DUENO, { currency: { base: 'PYG', enabled: true } });
  assert.deepEqual(final.currency, { base: 'PYG', enabled: true });
});

test('una tienda sin configuración la estrena', async () => {
  const final = await guardar(
    DUENO,
    { payments: { default: 'bank_transfer' } },
    undefined,
    TIENDA_SIN_SETTINGS,
  );
  assert.deepEqual(final, { payments: { default: 'bank_transfer' } });
  assert.deepEqual(await settingsDe(TIENDA_SIN_SETTINGS), final);
});

// --- La auditoría -----------------------------------------------------------------

test('la auditoría registra al actor que la función resuelve, no al que el payload declara', async () => {
  await guardar(
    DUENO,
    { currency: { base: 'PYG', exchangeRate: { mode: 'manual', value: 7300 } } },
    {
      action: 'currency.rate_updated',
      entity: 'store_settings',
      // Un intento de atribuirle el cambio a otro: la función ni lo mira.
      actorId: AJENO_USER,
      metadata: { value: 7300 },
    },
  );

  const filas = await auditorias();
  assert.equal(filas.length, 1);
  assert.equal(filas[0]!.action, 'currency.rate_updated');
  assert.equal(filas[0]!.entity, 'store_settings');
  assert.equal(filas[0]!.actor_id, DUENO, 'el actor salió del payload');
  assert.equal(filas[0]!.tenant_id, TENANT);
});

test('sin auditoría no se registra nada', async () => {
  const antes = (await auditorias()).length;
  await guardar(DUENO, { payments: { default: 'bank_transfer' } });
  assert.equal((await auditorias()).length, antes, 'registró una auditoría que nadie pidió');
});

test('una auditoría incompleta aborta el guardado entero', async () => {
  const antes = await settingsDe();
  const cuantas = (await auditorias()).length;

  const r = await intentar(
    db,
    DUENO,
    `select admin_save_settings('${TIENDA}'::uuid,
                                ${sql({ currency: { base: 'USD' } })},
                                ${sql({ entity: 'store_settings' })})`,
  );

  assert.equal(r.ok, false, 'aceptó una auditoría sin action');
  assert.match(r.error!, /action y entity/);
  assert.deepEqual(
    await settingsDe(),
    antes,
    'la configuración se guardó aunque la auditoría falló: las dos escrituras no son atómicas',
  );
  assert.equal((await auditorias()).length, cuantas);
});

test('la configuración tiene que ser un objeto', async () => {
  const r = await intentar(
    db,
    DUENO,
    `select admin_save_settings('${TIENDA}'::uuid, '"texto"'::jsonb)`,
  );
  assert.equal(r.ok, false);
  assert.match(r.error!, /debe ser un objeto/);
});

// --- Quién puede -------------------------------------------------------------------

test('el rol admin también tiene settings.write', async () => {
  const final = await guardar(ADMIN_ROL, { payments: { default: 'bank_transfer' } });
  assert.ok(final.payments);
});

test('un staff no puede editar la configuración', async () => {
  const r = await intentar(
    db,
    STAFF,
    `select admin_save_settings('${TIENDA}'::uuid, ${sql({ payments: {} })})`,
  );
  assert.equal(r.ok, false, 'un staff editó la configuración');
  assert.match(r.error!, /Sin permiso/);
});

test('un viewer no puede editar la configuración', async () => {
  const r = await intentar(
    db,
    VIEWER,
    `select admin_save_settings('${TIENDA}'::uuid, ${sql({ payments: {} })})`,
  );
  assert.equal(r.ok, false);
});

test('el owner de otro comercio no puede editar esta tienda', async () => {
  const r = await intentar(
    db,
    AJENO_USER,
    `select admin_save_settings('${TIENDA}'::uuid, ${sql({ payments: {} })})`,
  );
  assert.equal(r.ok, false, 'un comercio editó la configuración de otro');
  assert.match(r.error!, /Sin permiso/);
});

test('una tienda inexistente da el mismo error que una ajena', async () => {
  // A propósito: un mensaje distinto para cada caso le confirmaría a un tercero
  // qué ids de tienda existen.
  const r = await intentar(
    db,
    DUENO,
    `select admin_save_settings('99999999-0000-4000-8000-000000000000'::uuid, ${sql({ payments: {} })})`,
  );
  assert.equal(r.ok, false);
  assert.match(r.error!, /Sin permiso/);
});

test('el rol anónimo no puede editar la configuración', async () => {
  const r = await intentar(
    db,
    null,
    `select admin_save_settings('${TIENDA}'::uuid, ${sql({ payments: {} })})`,
  );
  assert.equal(r.ok, false, 'anon pudo invocar admin_save_settings');
});
