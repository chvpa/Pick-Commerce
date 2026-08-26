import type {
  CatalogQuery,
  CategoriaCatalogo,
  DefinicionFaceta,
  RepositorioCatalogo,
  ResultadoCatalogo,
} from '@pick/commerce-core';
import type { Product } from '@pick/commerce-types';
import type { PickSupabaseClient } from './client.ts';

/**
 * Traduce la respuesta de `catalog_search` al contrato del core.
 *
 * Se exporta para que el test de paridad ejecute el camino real de producción
 * menos el transporte: si el mapper rompe algo que el RPC devolvía bien, el
 * test lo ve igual.
 *
 * El RPC ya devuelve la forma del dominio —el trabajo pesado está en SQL—, así
 * que esto es un cast validado, no una transformación.
 */
export function mapearResultadoCatalogo(json: unknown): ResultadoCatalogo {
  const r = json as ResultadoCatalogo | null;
  if (!r || !Array.isArray(r.items)) {
    throw new Error('catalog_search devolvió una respuesta inesperada');
  }
  return r;
}

function filtrosAJson(query: CatalogQuery): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const [nombre, valores] of Object.entries(query.filters ?? {})) {
    if (valores.length > 0) salida[nombre] = [...valores];
  }
  return salida;
}

export function repositorioCatalogo(db: PickSupabaseClient): RepositorioCatalogo {
  return {
    async buscar(storeId, query) {
      const { data, error } = await db.rpc('catalog_search', {
        p_store_id: storeId,
        p_filters: filtrosAJson(query),
        p_search: query.search ?? '',
        p_sort: query.sort ?? 'relevance',
        p_page: query.page ?? 1,
        p_per_page: query.perPage ?? 24,
        p_price_min: query.precioMin,
        p_price_max: query.precioMax,
      });

      if (error) throw new Error(`No se pudo consultar el catálogo: ${error.message}`);
      return mapearResultadoCatalogo(data);
    },

    async porHandle(storeId, handle): Promise<Product | null> {
      // Se reusa `catalog_search` acotado por handle en vez de escribir otra
      // consulta: así el PDP y la PLP no pueden divergir en qué consideran
      // publicado ni en cómo suman el stock.
      const { data, error } = await db.rpc('catalog_search', {
        p_store_id: storeId,
        p_filters: {},
        p_search: '',
        p_sort: 'relevance',
        p_page: 1,
        p_per_page: 1,
        p_handle: handle,
      });

      if (error) throw new Error(`No se pudo leer el producto ${handle}: ${error.message}`);
      return mapearResultadoCatalogo(data).items[0] ?? null;
    },

    async porColeccion(storeId, handle, limite) {
      const { data, error } = await db.rpc('catalog_search', {
        p_store_id: storeId,
        p_filters: {},
        p_search: '',
        p_sort: 'relevance',
        p_page: 1,
        p_per_page: limite,
        p_collection: handle,
      });

      if (error) throw new Error(`No se pudo leer la colección ${handle}: ${error.message}`);
      return mapearResultadoCatalogo(data).items;
    },

    async categorias(storeId): Promise<readonly CategoriaCatalogo[]> {
      const { data, error } = await db
        .from('categories')
        .select('name, slug, image')
        .eq('store_id', storeId)
        .order('position');

      if (error) throw new Error(`No se pudieron leer las categorías: ${error.message}`);
      return (data ?? []).map((c) => ({
        name: c.name,
        slug: c.slug,
        ...(c.image ? { image: c.image as CategoriaCatalogo['image'] } : {}),
      }));
    },

    async facetasFiltrables(storeId): Promise<readonly DefinicionFaceta[]> {
      const { data, error } = await db
        .from('attribute_definitions')
        .select('name, label, position')
        .eq('store_id', storeId)
        .eq('filterable', true)
        .order('position');

      if (error) throw new Error(`No se pudieron leer las facetas: ${error.message}`);
      return data ?? [];
    },
  };
}
