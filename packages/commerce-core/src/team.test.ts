import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MemberRole } from '@pick/commerce-types';
import { ETIQUETA_ROL, ROLES, esUltimoOwner, type MiembroDeEquipo } from './team.ts';
import { ROLE_PERMISSIONS } from './authorization.ts';

function miembro(userId: string, role: MemberRole): MiembroDeEquipo {
  return { userId, email: `${userId}@x.test`, role, createdAt: '2026-08-27T00:00:00.000Z' };
}

test('el único owner es el último owner', () => {
  const equipo = [miembro('a', 'owner'), miembro('b', 'staff'), miembro('c', 'viewer')];
  assert.equal(esUltimoOwner(equipo, 'a'), true);
});

test('con dos owners ninguno es el último', () => {
  const equipo = [miembro('a', 'owner'), miembro('b', 'owner')];
  assert.equal(esUltimoOwner(equipo, 'a'), false);
  assert.equal(esUltimoOwner(equipo, 'b'), false);
});

test('quien no es owner nunca es el último owner', () => {
  // Si esto devolviera true, el Admin deshabilitaría el control de un staff y
  // nadie podría cambiarlo.
  const equipo = [miembro('a', 'owner'), miembro('b', 'staff')];
  assert.equal(esUltimoOwner(equipo, 'b'), false);
});

test('un equipo sin owners no traba a nadie', () => {
  // No debería pasar —el trigger lo impide— pero si la lista llega incompleta,
  // deshabilitar todo dejaría la pantalla inservible.
  assert.equal(esUltimoOwner([miembro('a', 'staff')], 'a'), false);
  assert.equal(esUltimoOwner([], 'a'), false);
});

test('alguien que no está en el equipo no es el último owner', () => {
  assert.equal(esUltimoOwner([miembro('a', 'owner')], 'z'), false);
});

test('los roles que muestra el selector son los mismos que tienen permisos', () => {
  // Un rol nuevo en la matriz de permisos y no acá quedaría invisible en el
  // Admin; uno acá y no allá reventaría al asignarlo.
  assert.deepEqual([...ROLES].sort(), Object.keys(ROLE_PERMISSIONS).sort());
  for (const rol of ROLES) {
    assert.ok(ETIQUETA_ROL[rol], `el rol ${rol} no tiene etiqueta`);
  }
});
