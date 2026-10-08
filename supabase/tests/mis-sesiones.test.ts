import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, como } from './harness.ts';

/**
 * «Mi cuenta» lista y cierra sesiones leyendo `auth.sessions` (ADR-155).
 *
 * Es una tabla de Supabase Auth con un secreto adentro, y las funciones la leen
 * como su dueño: lo que hay que probar es que cada persona ve y cierra **sólo
 * las suyas**, que el secreto no sale, y que la sesión en la que se está no se
 * cierra desde acá.
 */

const ANA = 'f1000000-0000-4000-8000-000000000000';
const BETO = 'f2000000-0000-4000-8000-000000000000';
const ANA_ACA = 'e1000000-0000-4000-8000-000000000001';
const ANA_TELEFONO = 'e1000000-0000-4000-8000-000000000002';
const BETO_UNICA = 'e2000000-0000-4000-8000-000000000001';

let db: PGlite;

/**
 * Como `como`, con el JWT de una sesión: la actual se reconoce por su
 * `session_id`. Corre varias consultas en la misma transacción —y la deshace—
 * para poder cerrar una sesión y mirar el resultado.
 */
async function enSesion<T>(usuario: string, sesion: string, ...consultas: string[]): Promise<T[]> {
  await db.exec('begin');
  try {
    await db.exec('set local role authenticated');
    await db.query('select set_config($1, $2, true)', ['app.user_id', usuario]);
    await db.query('select set_config($1, $2, true)', [
      'app.jwt',
      JSON.stringify({ session_id: sesion }),
    ]);
    let filas: T[] = [];
    for (const sql of consultas) filas = (await db.query<T>(sql)).rows;
    return filas;
  } finally {
    await db.exec('rollback');
  }
}

before(async () => {
  db = await baseDePrueba();

  await db.exec(`
    -- Lo que estas funciones usan de Supabase Auth, con el secreto incluido para
    -- poder afirmar que no sale. El harness no lo declara: nadie más lo necesita.
    create table auth.sessions (
      id uuid primary key,
      user_id uuid not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz,
      refreshed_at timestamp,
      not_after timestamptz,
      user_agent text,
      ip inet,
      refresh_token_hmac_key text
    );

    create or replace function auth.jwt() returns jsonb
      language sql stable
      as $$ select coalesce(nullif(current_setting('app.jwt', true), ''), '{}')::jsonb $$;

    insert into auth.users (id, email) values
      ('${ANA}', 'ana@a.test'),
      ('${BETO}', 'beto@b.test');

    insert into auth.sessions (id, user_id, created_at, refreshed_at, user_agent, refresh_token_hmac_key) values
      ('${ANA_ACA}', '${ANA}', now() - interval '1 day', (now() at time zone 'utc'), 'Chrome', 'SECRETO-DE-ANA'),
      ('${ANA_TELEFONO}', '${ANA}', now() - interval '3 days', null, 'Safari en iPhone', 'OTRO-SECRETO'),
      ('${BETO_UNICA}', '${BETO}', now(), null, 'Firefox', 'SECRETO-DE-BETO');
  `);
});

after(async () => {
  await db.close();
});

test('cada uno ve sus sesiones, con la actual marcada y sin el secreto', async () => {
  const filas = await enSesion<Record<string, unknown>>(
    ANA,
    ANA_ACA,
    'select * from my_sessions()',
  );

  assert.deepEqual(
    filas.map((f) => [f.id, f.is_current]),
    [
      // La de acá primero: es la que se renovó último.
      [ANA_ACA, true],
      [ANA_TELEFONO, false],
    ],
  );
  assert.deepEqual(Object.keys(filas[0]!).sort(), [
    'created_at',
    'id',
    'is_current',
    'last_active_at',
    'user_agent',
  ]);
  assert.ok(!JSON.stringify(filas).includes('SECRETO'), 'salió un secreto de la sesión');
});

test('cerrar otra sesión propia la borra, y deja las ajenas', async () => {
  const quedan = await enSesion<{ id: string }>(
    ANA,
    ANA_ACA,
    `select close_my_session('${ANA_TELEFONO}')`,
    'select id from my_sessions()',
  );
  assert.deepEqual(
    quedan.map((f) => f.id),
    [ANA_ACA],
  );
});

test('la sesión de otro no se cierra, y no se dice que existe', async () => {
  const intento = await enSesion<{ cerrada: boolean }>(
    ANA,
    ANA_ACA,
    `select close_my_session('${BETO_UNICA}') as cerrada`,
  );
  assert.equal(intento[0]!.cerrada, false);

  const deBeto = await enSesion<{ id: string }>(BETO, BETO_UNICA, 'select id from my_sessions()');
  assert.deepEqual(
    deBeto.map((f) => f.id),
    [BETO_UNICA],
  );
});

test('la sesión en la que se está no se cierra desde acá', async () => {
  await assert.rejects(
    enSesion(ANA, ANA_ACA, `select close_my_session('${ANA_ACA}')`),
    /usá «Salir»/,
  );
});

test('sin sesión no se llega a ninguna de las dos', async () => {
  await assert.rejects(como(db, null, 'select * from my_sessions()'), /permission denied/);
  await assert.rejects(
    como(db, null, `select close_my_session('${ANA_TELEFONO}')`),
    /permission denied/,
  );
});
