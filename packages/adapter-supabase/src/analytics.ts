import {
  claveDeDeduplicacion,
  type AnalyticsDestination,
  type EventoDeTienda,
  type RepositorioAnalytics,
  type ResumenDeAnalytics,
} from '@pick/commerce-core';
import type { PickSupabaseClient } from './client.ts';

/**
 * Los eventos del storefront, guardados en Postgres.
 *
 * Es la implementación de `AnalyticsDestination` que cierra P-003. Se eligió
 * Postgres y no Analytics Engine porque el Definition of Done de la fase exige
 * que las métricas coincidan con `orders` para una ventana de prueba, y eso pide
 * cruzar eventos con pedidos en una sola consulta — algo que un almacén aparte,
 * y que además muestrea, no puede sostener.
 *
 * El día que el volumen no entre acá, cambia este archivo y no el storefront:
 * para eso existe el puerto.
 */
export function destinoSupabase(db: PickSupabaseClient, tenantId: string): AnalyticsDestination {
  return {
    id: 'supabase',

    async registrar(storeId, eventos): Promise<void> {
      if (eventos.length === 0) return;

      const { error } = await db.from('store_events').insert(
        eventos.map((e: EventoDeTienda) => ({
          tenant_id: tenantId,
          store_id: storeId,
          session_id: e.sessionId,
          type: e.type,
          path: e.path,
          data: (e.data ?? {}) as never,
          dedupe_key: e.dedupeKey ?? claveDeDeduplicacion(e.type, e.sessionId, e.data) ?? null,
        })),
      );

      /*
       * Un duplicado no es un error.
       *
       * El índice único parcial es lo que descarta el segundo
       * `checkout_completed` de un reintento, y PostgREST no expone
       * `on conflict do nothing`: devuelve 23505. Tragarlo acá es lo que hace que
       * el insert sea idempotente sin que el llamador tenga que saberlo.
       *
       * Se compara el código y no el texto: el mensaje viene traducido y cambia
       * entre versiones.
       */
      if (error && error.code !== '23505') {
        throw new Error(`No se pudieron registrar los eventos: ${error.message}`);
      }
    },

    async purgar(storeId, dias): Promise<number> {
      const limite = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await db
        .from('store_events')
        .delete()
        .eq('store_id', storeId)
        .lt('occurred_at', limite)
        .select('id');

      if (error) throw new Error(`No se pudieron purgar los eventos: ${error.message}`);
      return data?.length ?? 0;
    },
  };
}

/** Lo que lee el Admin. Todo lo agrega el RPC; acá no se suma nada. */
export function repositorioAnalytics(db: PickSupabaseClient): RepositorioAnalytics {
  return {
    async resumen(storeId, from, to): Promise<ResumenDeAnalytics> {
      const { data, error } = await db.rpc('admin_analytics', {
        p_store_id: storeId,
        p_from: from,
        p_to: to,
      });

      if (error) throw new Error(`No se pudo consultar el resumen de navegación: ${error.message}`);
      return data as unknown as ResumenDeAnalytics;
    },
  };
}
