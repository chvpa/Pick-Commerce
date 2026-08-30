import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, comoAdmin, intentar } from './harness.ts';

/**
 * La credencial de OpenAI de cada comercio.
 *
 * `ai_credentials` no tiene ninguna política, así que quien decide quién puede
 * tocarla son las tres funciones —y son `security definer`, o sea que **saltean
 * RLS**. El filtro por organización es una línea dentro de cada una y ninguna
 * otra cosa lo respalda: sin ella, cualquier usuario del Admin leería el
 * ciphertext de cualquier comercio pasando un id de tienda.
 *
 * Por eso el caso del comercio ajeno está tres veces, una por función. No es
 * repetición: es que cada `security definer` tiene su propia guarda y equivocarse
 * en una no rompe las otras dos.
 */

const TENANT = 'aa000000-0000-4000-8000-000000000000';
const TIENDA = 'a5000000-0000-4000-8000-000000000000';

const OTRO_TENANT = 'bb000000-0000-4000-8000-000000000000';
const OTRA_TIENDA = 'b5000000-0000-4000-8000-000000000000';

const DUENO = 'f1000000-0000-4000-8000-000000000000';
const STAFF = 'f1000000-0000-4000-8000-000000000002';
const AJENO = 'f1000000-0000-4000-8000-000000000004';

/** Lo que guardaría el Worker: base64 de iv + ciphertext. Acá es opaco. */
const PAQUETE = 'ZmFsc28taXYtMTIzNDU2Nzg5MGFiY2RlZmdoaWprbG1ub3A=';

let db: PGlite;

interface Estado {
  configured: boolean;
  last4?: string;
  model?: string;
  ciphertext?: string;
}

async function guardar(
  usuario: string,
  { tienda = TIENDA, paquete = PAQUETE as string | null, last4 = 'kt7q', modelo = 'gpt-5.6-luna' },
): Promise<Estado> {
  const filas = await comoAdmin<{ j: Estado }>(
    db,
    usuario,
    `select admin_save_ai_credential('${tienda}'::uuid,
       ${paquete === null ? 'null' : `'${paquete}'`}, '${last4}', '${modelo}') as j`,
  );
  return filas[0]!.j;
}

async function estado(usuario: string, funcion: string, tienda = TIENDA): Promise<Estado> {
  const filas = await comoAdmin<{ j: Estado }>(
    db,
    usuario,
    `select ${funcion}('${tienda}'::uuid) as j`,
  );
  return filas[0]!.j;
}

before(async () => {
  db = await baseDePrueba();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${DUENO}', 'dueno@a.test'), ('${STAFF}', 'staff@a.test'), ('${AJENO}', 'ajeno@b.test');

    insert into organizations (id, name, slug) values
      ('${TENANT}', 'Comercio A', 'a'), ('${OTRO_TENANT}', 'Comercio B', 'b');

    insert into stores (id, tenant_id, name, slug, domain, currency) values
      ('${TIENDA}', '${TENANT}', 'Tienda A', 'ta', 'a.test', 'PYG'),
      ('${OTRA_TIENDA}', '${OTRO_TENANT}', 'Tienda B', 'tb', 'b.test', 'PYG');

    insert into memberships (tenant_id, user_id, role) values
      ('${TENANT}', '${DUENO}', 'owner'),
      ('${TENANT}', '${STAFF}', 'staff'),
      ('${OTRO_TENANT}', '${AJENO}', 'owner');
  `);
});

after(async () => {
  await db.close();
});

// --- Lo que el Admin puede ver ---------------------------------------------

test('sin credencial, el estado lo dice en vez de fallar', async () => {
  assert.deepEqual(await estado(DUENO, 'ai_credential_status'), { configured: false });
});

test('guardar deja el estado con los últimos cuatro y el modelo, nunca el ciphertext', async () => {
  await guardar(DUENO, {});

  const visto = await estado(DUENO, 'ai_credential_status');
  assert.equal(visto.configured, true);
  assert.equal(visto.last4, 'kt7q');
  assert.equal(visto.model, 'gpt-5.6-luna');
  assert.equal(
    visto.ciphertext,
    undefined,
    'la pantalla de configuración no puede recibir el ciphertext',
  );
});

test('el Worker sí recibe el ciphertext, y con su modelo', async () => {
  const secreto = await estado(DUENO, 'ai_credential_secret');
  assert.equal(secreto.ciphertext, PAQUETE);
  assert.equal(secreto.model, 'gpt-5.6-luna');
});

test('volver a guardar reemplaza en vez de duplicar', async () => {
  await guardar(DUENO, { paquete: 'b3RyYS1jbGF2ZS1jaWZyYWRhLXBhcmEtbGEtcHJ1ZWJhLXNp', last4: '9999' });

  const r = await db.query<{ n: number }>(`select count(*)::int as n from ai_credentials`);
  assert.equal(r.rows[0]!.n, 1);
  assert.equal((await estado(DUENO, 'ai_credential_status')).last4, '9999');
});

// --- Quién no puede ---------------------------------------------------------

test('un comercio no puede leer la credencial de otro', async () => {
  // El caso que ninguna otra capa cubre: las funciones saltean RLS, así que si
  // la guarda de organización no estuviera, esto devolvería el ciphertext ajeno.
  for (const funcion of ['ai_credential_status', 'ai_credential_secret']) {
    const r = await intentar(db, AJENO, `select ${funcion}('${TIENDA}'::uuid)`);
    assert.equal(r.ok, false, `${funcion} dejó entrar a un usuario de otra organización`);
    assert.match(r.error!, /Sin permiso/);
  }

  const escritura = await intentar(
    db,
    AJENO,
    `select admin_save_ai_credential('${TIENDA}'::uuid, '${PAQUETE}', 'xxxx', 'gpt-5.6-luna')`,
  );
  assert.equal(escritura.ok, false);
});

test('el staff no toca la credencial: no tiene settings.write', async () => {
  for (const sentencia of [
    `select ai_credential_status('${TIENDA}'::uuid)`,
    `select ai_credential_secret('${TIENDA}'::uuid)`,
    `select admin_save_ai_credential('${TIENDA}'::uuid, '${PAQUETE}', 'xxxx', 'gpt-5.6-luna')`,
  ]) {
    const r = await intentar(db, STAFF, sentencia);
    assert.equal(r.ok, false, `el staff pudo ejecutar: ${sentencia}`);
  }
});

test('una tienda inexistente falla igual que una ajena', async () => {
  // Mismo mensaje a propósito: distinguirlos le confirmaría a un tercero qué ids
  // de tienda existen.
  const r = await intentar(
    db,
    DUENO,
    `select ai_credential_status('c5000000-0000-4000-8000-000000000000'::uuid)`,
  );
  assert.equal(r.ok, false);
  assert.match(r.error!, /Sin permiso/);
});

test('la tabla no se lee ni se escribe directamente, con ningún rol', async () => {
  for (const usuario of [null, DUENO]) {
    const lectura = await intentar(db, usuario, `select ciphertext from ai_credentials`);
    assert.equal(lectura.ok, false, `${usuario ?? 'anon'} pudo leer la tabla directo`);

    const escritura = await intentar(
      db,
      usuario,
      `insert into ai_credentials (store_id, tenant_id, ciphertext, last4, model)
       values ('${TIENDA}'::uuid, '${TENANT}'::uuid, 'x', 'yyyy', 'gpt-5.6-luna')`,
    );
    assert.equal(escritura.ok, false, `${usuario ?? 'anon'} pudo escribir la tabla directo`);
  }
});

// --- La auditoría -----------------------------------------------------------

test('guardar y quitar quedan registrados, y sin el secreto adentro', async () => {
  await guardar(DUENO, { paquete: null });
  assert.deepEqual(await estado(DUENO, 'ai_credential_status'), { configured: false });

  const r = await db.query<{ action: string; actor_id: string; metadata: Record<string, unknown> }>(
    `select action, actor_id, metadata from audit_log
      where entity = 'store' and action like 'ai_credential%' order by id`,
  );

  assert.deepEqual(
    r.rows.map((f) => f.action),
    ['ai_credential.saved', 'ai_credential.saved', 'ai_credential.removed'],
  );
  assert.equal(r.rows[0]!.actor_id, DUENO, 'el actor sale de auth.uid(), no del payload');

  for (const fila of r.rows) {
    const texto = JSON.stringify(fila.metadata);
    assert.ok(!texto.includes(PAQUETE), 'el ciphertext no puede quedar en la auditoría');
    assert.ok(!texto.includes('ciphertext'), 'la auditoría no guarda el secreto');
  }
});
