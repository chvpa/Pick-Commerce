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
 * El `.eq('user_id', ...)` **hace falta**, y el motivo no es la seguridad.
 * `memberships_lectura` acota por organización —`tenant_id in
 * (select app.current_tenants())`— porque un miembro tiene que poder ver a su
 * equipo. O sea que sin ese filtro la consulta devuelve una fila por **cada
 * compañero**, y este mapeo le estampa a todas el id del usuario actual con el
 * rol ajeno.
 *
 * No es teórico: durante Fase 6 el Admin le mostró a un `viewer` los controles
 * de un `owner`, porque tomaba la primera fila de su organización. La base
 * rechazó igual cada operación —esa capa nunca dependió de acá—, pero la
 * pantalla mentía sobre lo que la persona podía hacer.
 *
 * RLS sigue siendo lo que separa un tenant de otro. Esta cláusula sólo hace que
 * la pregunta sea la correcta.
 */
export async function membresiasDe(db: PickSupabaseClient): Promise<ActorContext[]> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return [];

  const { data, error } = await db
    .from('memberships')
    .select('tenant_id, role')
    .eq('user_id', auth.user.id);
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
 * Pide el correo de recuperación.
 *
 * **Resuelve siempre**, exista o no la cuenta, por el mismo motivo que
 * `iniciarSesion` no distingue usuario de contraseña: un mensaje distinto para
 * cada caso convierte este formulario en una forma de averiguar qué correos
 * tienen cuenta. Quien lo llame muestra el mismo texto en los dos casos.
 *
 * El correo lo manda Supabase Auth con su propio SMTP, no la API de Resend: el
 * enlace lleva un token que sólo Supabase sabe acuñar. Apuntar ese SMTP a Resend
 * es configuración del proyecto, no código.
 */
export async function pedirReset(
  db: PickSupabaseClient,
  email: string,
  redirectTo: string,
): Promise<void> {
  await db.auth.resetPasswordForEmail(email, { redirectTo });
}

/**
 * Cambia la contraseña de quien ya entró por el enlace de recuperación.
 *
 * No recibe la contraseña anterior: quien llega acá lo hace con una sesión que
 * Supabase abrió al validar el token del correo, y esa es la prueba.
 */
export async function actualizarPassword(db: PickSupabaseClient, nueva: string): Promise<void> {
  const { error } = await db.auth.updateUser({ password: nueva });
  if (error) throw new Error(`No se pudo cambiar la contraseña: ${error.message}`);
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
 *
 * El segundo argumento distingue **cómo** se abrió la sesión. Entrar por el
 * enlace de un correo de recuperación produce una sesión válida como cualquier
 * otra, así que sin esta señal el Admin mostraría el panel en vez del formulario
 * de contraseña nueva, y la persona se quedaría sin poder cambiarla.
 */
export function observarSesion(
  db: PickSupabaseClient,
  alCambiar: (usuario: UsuarioAutenticado | null, contexto?: 'recovery') => void,
): () => void {
  const { data } = db.auth.onAuthStateChange((_evento, session) => {
    // Se difiere: la documentación de Supabase advierte que llamar a sus
    // funciones dentro del callback puede bloquear.
    setTimeout(() => {
      alCambiar(
        session?.user ? { userId: session.user.id, email: session.user.email ?? '' } : null,
        _evento === 'PASSWORD_RECOVERY' ? 'recovery' : undefined,
      );
    }, 0);
  });

  return () => data.subscription.unsubscribe();
}
