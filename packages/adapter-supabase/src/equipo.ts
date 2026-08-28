import type { MiembroDeEquipo, RepositorioEquipo } from '@pick/commerce-core';
import type { PickSupabaseClient } from './client.ts';

/**
 * El equipo de una organización.
 *
 * Asimétrico a propósito: leer va por una función y escribir va directo a la
 * tabla. No es inconsistencia.
 *
 * - **Leer** necesita los correos, que viven en `auth.users` y no son
 *   consultables por el rol de la app. Eso obliga a una función `security
 *   definer`, y esa función verifica `member.manage` por su cuenta porque al
 *   saltear RLS ya no hay nadie más que lo haga.
 * - **Escribir** no necesita nada especial: la política de `memberships` ya
 *   exige `member.manage` para update y delete. Un RPC acá sería una segunda
 *   puerta que no cierra la primera — el update directo seguiría existiendo—,
 *   así que el invariante de "no dejar la organización sin owner" vive en un
 *   trigger, por donde pasan los dos caminos.
 */
export function repositorioEquipo(db: PickSupabaseClient): RepositorioEquipo {
  return {
    async listar(tenantId): Promise<readonly MiembroDeEquipo[]> {
      const { data, error } = await db.rpc('admin_team', { p_tenant: tenantId });
      if (error) throw new Error(`No se pudo consultar el equipo: ${error.message}`);
      return data as unknown as readonly MiembroDeEquipo[];
    },

    async cambiarRol(tenantId, userId, rol): Promise<void> {
      const { error } = await db
        .from('memberships')
        .update({ role: rol, updated_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('user_id', userId);

      // El mensaje del trigger —"La organización necesita al menos un owner"—
      // llega acá y se conserva: es exactamente lo que hay que mostrarle a quien
      // intentó bajarse siendo el único.
      if (error) throw new Error(`No se pudo cambiar el rol: ${error.message}`);
    },

    async quitar(tenantId, userId): Promise<void> {
      const { error } = await db
        .from('memberships')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('user_id', userId);

      if (error) throw new Error(`No se pudo quitar a la persona: ${error.message}`);
    },
  };
}
