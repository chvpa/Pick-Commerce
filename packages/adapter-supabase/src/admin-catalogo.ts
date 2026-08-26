import type {
  ConsultaProductos,
  PaginaProductos,
  ProductoCargado,
  ProductoEditable,
  RepositorioAdminCatalogo,
} from '@pick/commerce-core';
import type { Json } from '@pick/commerce-types/database';
import type { PickSupabaseClient } from './client.ts';

/**
 * Catálogo desde el Admin.
 *
 * Se llama con el cliente del browser, o sea con el JWT del usuario: **RLS es lo
 * que autoriza**. Las políticas de catálogo exigen `catalog.write` para
 * escribir, así que un viewer recibe un error de la base, no de la interfaz.
 * Ver ADR-052.
 */
export function repositorioAdminCatalogo(db: PickSupabaseClient): RepositorioAdminCatalogo {
  return {
    async listar(storeId, consulta: ConsultaProductos): Promise<PaginaProductos> {
      const { data, error } = await db.rpc('admin_products', {
        p_store_id: storeId,
        p_query: consulta.query ?? '',
        ...(consulta.status ? { p_status: consulta.status } : {}),
        p_page: consulta.page ?? 1,
        p_per_page: consulta.perPage ?? 20,
      });

      if (error) throw new Error(`No se pudieron listar los productos: ${error.message}`);
      return data as unknown as PaginaProductos;
    },

    async porId(storeId, id): Promise<ProductoCargado | null> {
      // Consultas planas y no una función: leer un producto es una sola tabla
      // con sus hijas, y PostgREST ya sabe hacer eso con RLS aplicando.
      const { data, error } = await db
        .from('products')
        .select(
          `id, handle, title, description, brand, category_id, status, field_sources,
           product_variants(id, sku, title, barcode, price, currency, compare_at_price, cost,
                            attributes, position, inventory_levels(available)),
           product_media(url, alt, width, height, position)`,
        )
        .eq('store_id', storeId)
        .eq('id', id)
        // `maybeSingle`: que no exista es un 404, no una excepción.
        .maybeSingle();

      if (error) throw new Error(`No se pudo leer el producto: ${error.message}`);
      if (!data) return null;

      const variantes = [...data.product_variants].sort((a, b) => a.position - b.position);
      const medios = [...data.product_media].sort((a, b) => a.position - b.position);

      return {
        fieldSources: (data.field_sources ?? {}) as Record<string, string>,
        producto: {
          id: data.id,
          handle: data.handle,
          title: data.title,
          ...(data.description ? { description: data.description } : {}),
          ...(data.brand ? { brand: data.brand } : {}),
          ...(data.category_id ? { categoryId: data.category_id } : {}),
          status: data.status,
          variants: variantes.map((v) => ({
            id: v.id,
            sku: v.sku,
            title: v.title,
            ...(v.barcode ? { barcode: v.barcode } : {}),
            price: v.price,
            currency: v.currency,
            ...(v.compare_at_price === null ? {} : { compareAtPrice: v.compare_at_price }),
            ...(v.cost === null ? {} : { cost: v.cost }),
            attributes: (v.attributes ?? {}) as Record<string, string>,
            // Suma de sucursales, como en el storefront.
            stock: v.inventory_levels.reduce((total, il) => total + il.available, 0),
          })),
          media: medios.map((m) => ({ url: m.url, alt: m.alt, width: m.width, height: m.height })),
        },
      };
    },

    async guardar(storeId, producto: ProductoEditable): Promise<string> {
      // Una función y no cuatro peticiones: producto, variantes, medios y stock
      // se escriben en una transacción. Sin eso, un fallo a mitad deja el
      // producto con las variantes viejas borradas y las nuevas sin crear.
      const { data, error } = await db.rpc('admin_save_product', {
        p_store_id: storeId,
        p_producto: producto as unknown as Json,
      });

      if (error) throw new Error(`No se pudo guardar el producto: ${error.message}`);
      return data as unknown as string;
    },

    async archivar(storeId, id): Promise<void> {
      const { error } = await db
        .from('products')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('store_id', storeId)
        .eq('id', id);

      if (error) throw new Error(`No se pudo archivar el producto: ${error.message}`);
    },
  };
}
