import type { Premio, PremioParaGuardar, ResumenDeFidelidad } from '@pick/commerce-core';
import type { PickSupabaseClient } from './client.ts';

/**
 * El programa de puntos, del lado del Admin (ADR-141).
 *
 * El resumen va por función porque **el pasivo es una agregación** y PostgREST no
 * agrupa. Los premios van directo a la tabla: RLS ya pide `promotion.write` para
 * escribir, y un premio es una fila plana sin nada que calcular.
 *
 * Las reglas del programa no están acá: viven en `store_settings.settings.loyalty` y
 * se guardan por `admin_save_settings`, como cualquier otro ajuste de la tienda.
 */
export function repositorioFidelidad(db: PickSupabaseClient) {
  return {
    async resumen(storeId: string): Promise<ResumenDeFidelidad> {
      const { data, error } = await db.rpc('admin_loyalty', { p_store_id: storeId });
      if (error) throw new Error(`No se pudo leer el programa de puntos: ${error.message}`);
      return data as unknown as ResumenDeFidelidad;
    },

    async premios(storeId: string): Promise<readonly Premio[]> {
      const { data, error } = await db
        .from('loyalty_rewards')
        .select(
          'id, title, points_cost, discount_type, discount_value, status, starts_at, ends_at, max_redemptions, redemptions, max_per_customer, valid_days',
        )
        .eq('store_id', storeId)
        .order('points_cost');

      if (error) throw new Error(`No se pudieron leer los premios: ${error.message}`);

      return (data ?? []).map((r) => ({
        id: r.id,
        title: r.title,
        pointsCost: r.points_cost,
        discountType: r.discount_type as Premio['discountType'],
        discountValue: Number(r.discount_value),
        status: r.status as Premio['status'],
        ...(r.starts_at ? { startsAt: r.starts_at } : {}),
        ...(r.ends_at ? { endsAt: r.ends_at } : {}),
        ...(r.max_redemptions === null ? {} : { maxRedemptions: r.max_redemptions }),
        redemptions: r.redemptions,
        ...(r.max_per_customer === null ? {} : { maxPerCustomer: r.max_per_customer }),
        validDays: r.valid_days,
      }));
    },

    async guardarPremio(
      tenantId: string,
      storeId: string,
      premio: PremioParaGuardar,
    ): Promise<void> {
      const fila = {
        tenant_id: tenantId,
        store_id: storeId,
        title: premio.title,
        points_cost: premio.pointsCost,
        discount_type: premio.discountType,
        discount_value: premio.discountValue,
        status: premio.status,
        starts_at: premio.startsAt ?? null,
        ends_at: premio.endsAt ?? null,
        max_redemptions: premio.maxRedemptions ?? null,
        max_per_customer: premio.maxPerCustomer ?? null,
        valid_days: premio.validDays,
        updated_at: new Date().toISOString(),
      };

      const { error } = premio.id
        ? await db.from('loyalty_rewards').update(fila).eq('id', premio.id).eq('store_id', storeId)
        : await db.from('loyalty_rewards').insert(fila);

      if (error) throw new Error(`No se pudo guardar el premio: ${error.message}`);
    },

    /**
     * Archiva un premio; no lo borra.
     *
     * Mismo criterio que las promociones (ADR-060): un canje viejo tiene que poder
     * seguir explicando de dónde salió su cupón, y el libro de puntos apunta acá.
     */
    async archivarPremio(storeId: string, id: string): Promise<void> {
      const { error } = await db
        .from('loyalty_rewards')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('store_id', storeId);

      if (error) throw new Error(`No se pudo archivar el premio: ${error.message}`);
    },
  };
}
