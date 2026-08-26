import type { ActorContext, MemberRole } from '@pick/commerce-types';
import type { PickSupabaseClient } from './client.ts';

/** Usuario autenticado, sin exponer el tipo de sesión de Supabase. */
export interface UsuarioAutenticado {
  readonly userId: string;
  readonly email: string;
}

export interface SesionActiva {
  readonly userId: string;
  readonly email: string;
  /** Organizaciones donde el usuario es miembro, con su rol en cada una. */
  readonly membresias: readonly ActorContext[];
}

/**
 * Membresías del usuario autenticado.
 *
 * La consulta no filtra por usuario a propósito: **RLS ya lo hace**. Agregar un
 * `.eq('user_id', ...)` daría la impresión de que la seguridad depende del
 * cliente, y no es así — si esa cláusula fuera lo único que separa a un tenant
 * de otro, bastaría con quitarla.
 */
export async function membresiasDe(db: PickSupabaseClient): Promise<ActorContext[]> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return [];

  const { data, error } = await db.from('memberships').select('tenant_id, role');
  if (error) throw new Error(`No se pudieron cargar las membresías: ${error.message}`);

  return (data ?? []).map((m) => ({
    userId: auth.user!.id,
    tenantId: m.tenant_id,
    role: m.role as MemberRole,
  }));
}

export async function iniciarSesion(
  db: PickSupabaseClient,
  email: string,
  password: string,
): Promise<void> {
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    // No se distingue "usuario inexistente" de "contraseña incorrecta": decirlo
    // permitiría enumerar qué correos tienen cuenta.
    throw new Error('Correo o contraseña incorrectos');
  }
}

export async function cerrarSesion(db: PickSupabaseClient): Promise<void> {
  await db.auth.signOut();
}

/**
 * Observa los cambios de sesión.
 *
 * Vive en el adapter y no en el Admin para que la app no importe
 * `@supabase/supabase-js`: si lo hiciera, el tipo de sesión del proveedor se
 * filtraría a toda la aplicación y cambiarlo dejaría de ser un cambio de una
 * sola capa.
 *
 * El callback recibe `null` cuando no hay sesión. Se emite también al
 * suscribirse —evento `INITIAL_SESSION`—, así que no hace falta una carga
 * inicial aparte.
 */
export function observarSesion(
  db: PickSupabaseClient,
  alCambiar: (usuario: UsuarioAutenticado | null) => void,
): () => void {
  const { data } = db.auth.onAuthStateChange((_evento, session) => {
    // Se difiere: la documentación de Supabase advierte que llamar a sus
    // funciones dentro del callback puede bloquear.
    setTimeout(() => {
      alCambiar(
        session?.user ? { userId: session.user.id, email: session.user.email ?? '' } : null,
      );
    }, 0);
  });

  return () => data.subscription.unsubscribe();
}
