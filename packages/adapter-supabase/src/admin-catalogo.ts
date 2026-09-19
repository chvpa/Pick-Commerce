import type {
  ConsultaProductos,
  PaginaProductos,
  PaginaSinFoto,
  ProductoCargado,
  ProductoEditable,
  RepositorioAdminCatalogo,
  ResultadoImport,
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
const SELECT_COMPLETO = `id, handle, title, description, brand, category_id, status, field_sources,
   product_variants(id, sku, title, barcode, price, currency, compare_at_price, cost,
                    attributes, position, inventory_levels(available)),
   product_media(url, alt, width, height, position)`;

/** Fila cruda de `SELECT_COMPLETO` traducida al contrato del core. */
function aProductoEditable(data: {
  id: string;
  handle: string;
  title: string;
  description: string | null;
  brand: string | null;
  category_id: string | null;
  status: ProductoEditable['status'];
  product_variants: {
    id: string;
    sku: string;
    title: string;
    barcode: string | null;
    price: number;
    currency: string;
    compare_at_price: number | null;
    cost: number | null;
    attributes: unknown;
    position: number;
    inventory_levels: { available: number }[];
  }[];
  product_media: { url: string; alt: string; width: number; height: number; position: number }[];
}): ProductoEditable {
  const variantes = [...data.product_variants].sort((a, b) => a.position - b.position);
  const medios = [...data.product_media].sort((a, b) => a.position - b.position);

  return {
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
  };
}

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

    async sinFoto(storeId, page, perPage = 20): Promise<PaginaSinFoto> {
      const { data, error } = await db.rpc('admin_products_without_photo', {
        p_store_id: storeId,
        p_page: page,
        p_per_page: perPage,
      });

      if (error) throw new Error(`No se pudo leer la cola de fotos: ${error.message}`);
      return data as unknown as PaginaSinFoto;
    },

    async agregarFoto(tenantId, storeId, productId, foto): Promise<void> {
      /*
       * La posición es «después de la última». Se pregunta en vez de suponer
       * cero: el producto puede haber recibido otra foto entre que se cargó la
       * cola y ahora, y dos filas en la posición cero dejan indeterminado cuál
       * sale primera en la vitrina.
       */
      const { data: ultima, error: errorUltima } = await db
        .from('product_media')
        .select('position, products!inner(store_id)')
        .eq('product_id', productId)
        .eq('products.store_id', storeId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (errorUltima) throw new Error(`No se pudo leer las fotos: ${errorUltima.message}`);

      const { error } = await db.from('product_media').insert({
        tenant_id: tenantId,
        product_id: productId,
        url: foto.url,
        alt: foto.alt,
        width: foto.width,
        height: foto.height,
        position: ultima ? ultima.position + 1 : 0,
      });

      if (error) throw new Error(`No se pudo guardar la foto: ${error.message}`);
    },

    async porId(storeId, id): Promise<ProductoCargado | null> {
      // Consultas planas y no una función: leer un producto es una sola tabla
      // con sus hijas, y PostgREST ya sabe hacer eso con RLS aplicando.
      const { data, error } = await db
        .from('products')
        .select(SELECT_COMPLETO)
        .eq('store_id', storeId)
        .eq('id', id)
        // `maybeSingle`: que no exista es un 404, no una excepción.
        .maybeSingle();

      if (error) throw new Error(`No se pudo leer el producto: ${error.message}`);
      if (!data) return null;

      return {
        fieldSources: (data.field_sources ?? {}) as Record<string, string>,
        producto: aProductoEditable(data),
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

    async cambiarEstadoEnLote(storeId, ids, status): Promise<void> {
      if (ids.length === 0) return;

      // Un solo update y no un RPC: no hay nada transaccional que coordinar —una
      // columna de una tabla— y el `store_id` más RLS ya acotan qué filas
      // alcanza. Los ids llegan del browser, así que el filtro por tienda no es
      // decoración: sin él, un id ajeno pasaría a depender sólo de las políticas.
      const { error } = await db
        .from('products')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('store_id', storeId)
        .in('id', ids as string[]);

      if (error) throw new Error(`No se pudieron actualizar los productos: ${error.message}`);
    },

    async completos(storeId, page, perPage): Promise<readonly ProductoEditable[]> {
      // Paginado también para exportar: un catálogo grande no entra en una
      // consulta, y traerlo entero es lo que ADR-024 prohíbe.
      const desde = (page - 1) * perPage;
      const { data, error } = await db
        .from('products')
        .select(SELECT_COMPLETO)
        .eq('store_id', storeId)
        .order('created_at')
        .range(desde, desde + perPage - 1);

      if (error) throw new Error(`No se pudo exportar el catálogo: ${error.message}`);
      return (data ?? []).map(aProductoEditable);
    },

    async importar(storeId, productos): Promise<readonly ResultadoImport[]> {
      const { data, error } = await db.rpc('import_products', {
        p_store_id: storeId,
        p_productos: productos as unknown as Json,
      });

      if (error) throw new Error(`No se pudo importar: ${error.message}`);
      return data as unknown as ResultadoImport[];
    },
  };
}
