import type { PickSupabaseClient } from './client.ts';

/** Cómo se muestra un modelo en la ficha de la tienda (ADR-162). */
export type VistaDeModelo = 'photo' | 'swatch' | 'text';

export interface Modelo {
  readonly id: string;
  readonly name: string;
  /** La clave de la característica que los distingue: `color`. */
  readonly axis: string | null;
  readonly display: VistaDeModelo;
  readonly count: number;
  readonly preview: readonly { readonly image?: string; readonly value?: string }[];
}

export interface ProductoDelModelo {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly image?: string;
  readonly value?: string;
  readonly stock: number;
}

/** Los modelos de una tienda. Escribe quien tiene `catalog.write`, por RLS. */
export function repositorioModelos(db: PickSupabaseClient) {
  return {
    async listar(
      storeId: string,
      filtro: { q?: string; page?: number; perPage?: number } = {},
    ): Promise<{ total: number; items: readonly Modelo[] }> {
      const { data, error } = await db.rpc('admin_product_groups', {
        p_store_id: storeId,
        ...(filtro.q ? { p_q: filtro.q } : {}),
        p_page: filtro.page ?? 1,
        p_per_page: filtro.perPage ?? 50,
      });
      if (error) throw new Error(`No se pudieron leer los modelos: ${error.message}`);
      return data as unknown as { total: number; items: readonly Modelo[] };
    },

    async productos(groupId: string): Promise<readonly ProductoDelModelo[]> {
      const { data, error } = await db.rpc('admin_group_products', { p_group_id: groupId });
      if (error) throw new Error(`No se pudieron leer los productos del modelo: ${error.message}`);
      return (data ?? []) as unknown as readonly ProductoDelModelo[];
    },

    async crear(
      storeId: string,
      tenantId: string,
      datos: { name: string; axis: string | null; display: VistaDeModelo },
    ): Promise<string> {
      const { data, error } = await db
        .from('product_groups')
        .insert({ store_id: storeId, tenant_id: tenantId, ...datos })
        .select('id')
        .single();
      if (error) throw new Error(`No se pudo crear el modelo: ${error.message}`);
      return data.id;
    },

    async actualizar(
      id: string,
      datos: { name: string; axis: string | null; display: VistaDeModelo },
    ): Promise<void> {
      const { error } = await db
        .from('product_groups')
        .update({ ...datos, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new Error(`No se pudo guardar el modelo: ${error.message}`);
    },

    /** Quiénes y en qué orden; el primero es el del catálogo. */
    async fijarProductos(id: string, productos: readonly string[]): Promise<void> {
      const { error } = await db.rpc('admin_set_group_products', {
        p_group_id: id,
        p_products: [...productos],
      });
      if (error)
        throw new Error(`No se pudieron guardar los productos del modelo: ${error.message}`);
    },

    /** El modelo de un producto, para la ficha. */
    async deProducto(productId: string): Promise<{ id: string; name: string } | null> {
      const { data, error } = await db
        .from('products')
        .select('product_group_id')
        .eq('id', productId)
        .maybeSingle();
      if (error) throw new Error(`No se pudo leer el modelo: ${error.message}`);
      if (!data?.product_group_id) return null;
      const grupo = await db
        .from('product_groups')
        .select('id, name')
        .eq('id', data.product_group_id)
        .maybeSingle();
      if (grupo.error) throw new Error(`No se pudo leer el modelo: ${grupo.error.message}`);
      return grupo.data;
    },

    /** Borrar el modelo suelta a sus productos: la clave foránea los deja sin modelo. */
    async borrar(id: string): Promise<void> {
      const { error } = await db.from('product_groups').delete().eq('id', id);
      if (error) throw new Error(`No se pudo borrar el modelo: ${error.message}`);
    },
  };
}
