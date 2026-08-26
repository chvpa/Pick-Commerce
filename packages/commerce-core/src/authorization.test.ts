import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ActorContext, MemberRole, Permission } from '@pick/commerce-types';
import { assertCan, assertSameTenant, can, ROLE_PERMISSIONS } from './authorization.ts';

function actor(role: MemberRole, tenantId = 't1'): ActorContext {
  return { userId: 'u1', tenantId, role };
}

test('cada rol tiene exactamente los permisos que declara', () => {
  assert.equal(can(actor('owner'), 'member.manage'), true);
  assert.equal(can(actor('admin'), 'member.manage'), false);
  assert.equal(can(actor('staff'), 'settings.write'), false);
  assert.equal(can(actor('staff'), 'catalog.write'), true);
  assert.equal(can(actor('viewer'), 'catalog.write'), false);
});

test('el viewer no tiene ninguna escritura', () => {
  assert.deepEqual(ROLE_PERMISSIONS.viewer, []);
});

test('assertCan corta la operación y no filtra detalles del recurso', () => {
  assert.doesNotThrow(() => assertCan(actor('owner'), 'organization.manage'));
  assert.throws(() => assertCan(actor('viewer'), 'catalog.write'), /viewer/);
});

test('assertSameTenant impide operar sobre otra organización', () => {
  assert.doesNotThrow(() => assertSameTenant(actor('owner', 't1'), 't1'));
  assert.throws(() => assertSameTenant(actor('owner', 't1'), 't2'), /otra organización/);
});

/**
 * Los permisos viven en dos lugares —acá y en el seed de la migración— porque
 * RLS los necesita en SQL y el servicio de dominio en TypeScript. Que diverjan
 * en silencio sería un agujero de autorización, así que se comparan.
 */
test('el seed de la migración coincide con ROLE_PERMISSIONS', () => {
  const migraciones = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'supabase',
    'migrations',
  );
  const sql = readdirSync(migraciones)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(migraciones, f), 'utf8'))
    .join('\n');

  const bloque = sql.slice(sql.indexOf('insert into role_permissions'));
  const enSql = new Set(
    [...bloque.matchAll(/\('(owner|admin|staff|viewer)',\s*'([a-z.]+)'\)/g)].map(
      (m) => `${m[1]}:${m[2]}`,
    ),
  );

  const enTs = new Set(
    (Object.entries(ROLE_PERMISSIONS) as [MemberRole, readonly Permission[]][]).flatMap(
      ([rol, permisos]) => permisos.map((p) => `${rol}:${p}`),
    ),
  );

  const faltanEnSql = [...enTs].filter((x) => !enSql.has(x));
  const sobranEnSql = [...enSql].filter((x) => !enTs.has(x));

  assert.deepEqual(faltanEnSql, [], 'permisos en TypeScript que el SQL no siembra');
  assert.deepEqual(sobranEnSql, [], 'permisos que el SQL concede y TypeScript no');
});
