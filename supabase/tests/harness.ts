import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIGRACIONES = join(AQUI, '..', 'migrations');

/**
 * Postgres real en proceso, sin Docker.
 *
 * Las pruebas de aislamiento entre tenants son el corazón de la Definition of
 * Done de Fase 3, y exigirlas contra un Supabase remoto las habría dejado fuera
 * de CI — es decir, sin correr casi nunca. PGlite es Postgres compilado a WASM
 * y aplica RLS igual que el servidor.
 *
 * Lo que **no** cubre: el esquema `auth` real de Supabase, sus triggers y sus
 * roles. Acá se recrea lo mínimo que las políticas necesitan, así que un cambio
 * de comportamiento de Supabase Auth no se detectaría. Eso se verifica contra
 * un proyecto real antes del piloto (T3).
 */
export async function baseDePrueba(): Promise<PGlite> {
  const db = new PGlite();

  // Mínimo del entorno Supabase que las políticas asumen.
  await db.exec(`
    create schema if not exists auth;

    create table auth.users (
      id    uuid primary key,
      email text unique
    );

    -- Supabase la resuelve del JWT; acá, de una variable de sesión.
    create or replace function auth.uid() returns uuid
      language sql stable
      as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

    create role anon nologin;
    create role authenticated nologin;

    -- El rol de la secret key. El storefront consulta con él, y **saltea RLS**:
    -- es el camino que protege el scoping por tienda en el SQL, no las
    -- políticas. Sin este rol acá, esa capa no se puede testear, y hasta ahora
    -- no se testeaba.
    create role service_role nologin bypassrls;
  `);

  for (const archivo of readdirSync(MIGRACIONES)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await db.exec(readFileSync(join(MIGRACIONES, archivo), 'utf8'));
  }

  // Sólo lo que la migración no declara: el acceso a los schemas. Los privilegios
  // sobre tablas los concede la propia migración, así que si ahí falta un grant
  // las pruebas lo notan.
  await db.exec(`
    grant usage on schema public, auth to anon, authenticated, service_role;

    -- \`bypassrls\` saltea las **políticas**, no los privilegios de tabla. En
    -- Supabase, \`service_role\` los recibe de un default privilege del proyecto,
    -- que PGlite no reproduce. Se conceden acá y no en una migración porque son
    -- del entorno, igual que el \`usage\` de arriba: si una migración se olvidara
    -- de un grant propio, las pruebas lo tienen que notar.
    grant all on all tables in schema public to service_role;
  `);

  return db;
}

/**
 * Ejecuta una consulta como un usuario concreto, con el rol `authenticated`.
 *
 * Va dentro de una transacción con `set local`: sin ella el rol quedaría fijado
 * para el resto de la sesión y la prueba siguiente heredaría la identidad
 * equivocada.
 */
export async function como<T>(db: PGlite, userId: string | null, sql: string): Promise<T[]> {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${userId ? 'authenticated' : 'anon'}`);
    await db.query('select set_config($1, $2, true)', ['app.user_id', userId ?? '']);
    const resultado = await db.query<T>(sql);
    return resultado.rows;
  } finally {
    await db.exec('rollback');
  }
}

/**
 * Ejecuta como el rol de la secret key, **confirmando** la transacción.
 *
 * `como` e `intentar` hacen rollback siempre, que es lo correcto para afirmar
 * sobre lecturas y rechazos sin ensuciar la base. No sirve para lo que escribe:
 * verificar que crear un pedido descontó stock **una sola vez** exige que la
 * primera llamada persista.
 */
export async function comoServicio<T>(db: PGlite, sql: string): Promise<T[]> {
  await db.exec('begin');
  try {
    await db.exec('set local role service_role');
    const resultado = await db.query<T>(sql);
    await db.exec('commit');
    return resultado.rows;
  } catch (error) {
    await db.exec('rollback');
    throw error;
  }
}

/**
 * Ejecuta como un usuario del Admin, **confirmando** la transacción.
 *
 * Mismo motivo que `comoServicio`: hay comprobaciones que necesitan que el
 * cambio persista —cancelar un pedido y verificar que el stock volvió—. Pasa por
 * el rol `authenticated`, así que RLS y los permisos deciden igual que en el
 * Admin real.
 */
export async function comoAdmin<T>(db: PGlite, userId: string, sql: string): Promise<T[]> {
  await db.exec('begin');
  try {
    await db.exec('set local role authenticated');
    await db.query('select set_config($1, $2, true)', ['app.user_id', userId]);
    const resultado = await db.query<T>(sql);
    await db.exec('commit');
    return resultado.rows;
  } catch (error) {
    await db.exec('rollback');
    throw error;
  }
}

/** Igual que `como`, pero para sentencias que deben fallar o modificar. */
export async function intentar(
  db: PGlite,
  userId: string | null,
  sql: string,
): Promise<{ ok: boolean; filas: number; error?: string }> {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${userId ? 'authenticated' : 'anon'}`);
    await db.query('select set_config($1, $2, true)', ['app.user_id', userId ?? '']);
    const r = await db.query(sql);
    return { ok: true, filas: r.affectedRows ?? r.rows.length };
  } catch (error) {
    return { ok: false, filas: 0, error: (error as Error).message };
  } finally {
    await db.exec('rollback');
  }
}
