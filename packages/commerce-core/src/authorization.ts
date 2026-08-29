import type { ActorContext, MemberRole, Permission } from '@pick/commerce-types';

/**
 * Permisos por rol.
 *
 * **Esta es la fuente de verdad.** La migración de Supabase siembra
 * `role_permissions` con exactamente esta tabla, y un test compara ambas: si se
 * agrega un permiso acá y no en el SQL, falla. Dos listas que divergen en
 * silencio son peores que una sola imperfecta.
 */
export const ROLE_PERMISSIONS: Readonly<Record<MemberRole, readonly Permission[]>> = {
  owner: [
    'organization.manage',
    'store.manage',
    'member.manage',
    'catalog.write',
    'order.write',
    'settings.write',
    'promotion.write',
  ],
  // El admin opera la tienda pero no toca la organización ni el equipo.
  admin: ['store.manage', 'catalog.write', 'order.write', 'settings.write', 'promotion.write'],
  // El staff hace el día a día, sin configuración. Tampoco publica descuentos:
  // una campaña es una decisión de precio, y las de precio ya viven detrás de
  // `settings.write`, que el staff no tiene.
  staff: ['catalog.write', 'order.write'],
  // El viewer sólo lee: no se le asigna ninguna escritura.
  viewer: [],
};

/**
 * Autorización en el servicio de dominio.
 *
 * No reemplaza a RLS ni al revés: RLS impide que una query devuelva filas
 * ajenas, y esto impide que una operación se ejecute. Una sola de las dos capas
 * deja un agujero — RLS no distingue "no debería poder" de "no encontró", y el
 * servicio no protege a quien consulte la base por otra vía.
 */
export function can(actor: ActorContext, permission: Permission): boolean {
  return ROLE_PERMISSIONS[actor.role].includes(permission);
}

/** Igual que `can`, pero corta la operación. Para usar al entrar al servicio. */
export function assertCan(actor: ActorContext, permission: Permission): void {
  if (!can(actor, permission)) {
    // Sin detalles del recurso: un mensaje de error no debe confirmar la
    // existencia de algo que el actor no puede ver.
    throw new Error(`El rol ${actor.role} no tiene el permiso ${permission}`);
  }
}

/**
 * Verifica que el actor esté operando sobre su propia organización.
 *
 * El chequeo parece redundante con RLS, y no lo es: el storefront y los jobs
 * usan la secret key, que **saltea RLS por completo**. En ese camino esta
 * función es la única defensa.
 */
export function assertSameTenant(actor: ActorContext, tenantId: string): void {
  if (actor.tenantId !== tenantId) {
    throw new Error('La operación pertenece a otra organización');
  }
}
