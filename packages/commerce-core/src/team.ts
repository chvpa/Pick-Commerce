import type { MemberRole } from '@pick/commerce-types';

/**
 * El equipo de una organización.
 *
 * El alta de personas **no** está acá ni en el Admin: crear un usuario exige la
 * secret key, y el Admin es una SPA estática que no puede tenerla. Se hace con
 * `pnpm admin:crear`. Lo que sí se opera desde la pantalla es el rol de quien ya
 * entró y quitar a quien se fue.
 */

export interface MiembroDeEquipo {
  readonly userId: string;
  readonly email: string;
  readonly role: MemberRole;
  readonly createdAt: string;
}

/** En orden de poder, que es como se los muestra en el selector. */
export const ROLES: readonly MemberRole[] = ['owner', 'admin', 'staff', 'viewer'];

export const ETIQUETA_ROL: Readonly<Record<MemberRole, string>> = {
  owner: 'Propietario',
  admin: 'Administrador',
  staff: 'Personal',
  viewer: 'Sólo lectura',
};

export const DESCRIPCION_ROL: Readonly<Record<MemberRole, string>> = {
  owner: 'Todo, incluido el equipo y la organización.',
  admin: 'Opera la tienda y su configuración. No toca el equipo.',
  staff: 'Catálogo y pedidos. Sin configuración.',
  viewer: 'Sólo puede mirar.',
};

/**
 * Si quitarle el rol a esta persona dejaría a la organización sin propietario.
 *
 * Sirve **sólo** para deshabilitar el control y explicar por qué: el invariante
 * de verdad es un trigger en la base, que frena también al update directo, a la
 * secret key y a los scripts. Una comprobación en el browser no es una defensa,
 * es una cortesía.
 */
export function esUltimoOwner(miembros: readonly MiembroDeEquipo[], userId: string): boolean {
  const owners = miembros.filter((m) => m.role === 'owner');
  return owners.length === 1 && owners[0]!.userId === userId;
}

export interface RepositorioEquipo {
  listar(tenantId: string): Promise<readonly MiembroDeEquipo[]>;
  cambiarRol(tenantId: string, userId: string, rol: MemberRole): Promise<void>;
  quitar(tenantId: string, userId: string): Promise<void>;
}
