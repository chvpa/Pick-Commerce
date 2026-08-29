import type {
  Banner,
  CatalogFilters,
  CatalogSort,
  CategoriaAdmin,
  Coleccion,
  RepositorioContenido,
} from '@pick/commerce-core';
import type { ProductImage } from '@pick/commerce-types';
import type { PickSupabaseClient } from './client.ts';

/**
 * Colecciones, banners y categorías desde el Admin.
 *
 * Sin RPC: son tablas planas y RLS ya decide quién puede escribir. Lo único que
 * pide cuidado son los productos de una colección manual, que viven en una tabla
 * puente y hay que reemplazar en bloque.
 */

/** El tenant sale de la tienda y no del cliente: el formulario no lo manda. */
async function tenantDe(db: PickSupabaseClient, storeId: string): Promise<string> {
  const { data, error } = await db.from('stores').select('tenant_id').eq('id', storeId).single();
  if (error) throw new Error(`No se pudo resolver la tienda: ${error.message}`);
  return data.tenant_id;
}

interface FilaColeccion {
  id: string;
  title: string;
  handle: string;
  subtitle: string | null;
  published: boolean;
  home_position: number | null;
  sort: string | null;
  rules: unknown;
}

function aColeccion(f: FilaColeccion, productIds?: readonly string[]): Coleccion {
  return {
    id: f.id,
    title: f.title,
    handle: f.handle,
    ...(f.subtitle ? { subtitle: f.subtitle } : {}),
    published: f.published,
    ...(f.home_position !== null ? { homePosition: f.home_position } : {}),
    ...(f.sort ? { sort: f.sort as CatalogSort } : {}),
    ...(f.rules ? { rules: f.rules as CatalogFilters } : {}),
    ...(productIds ? { productIds } : {}),
  };
}

const COLUMNAS_COLECCION = 'id, title, handle, subtitle, published, home_position, sort, rules';
const COLUMNAS_BANNER = 'id, title, subtitle, image, image_mobile, href, position, published';

export function repositorioContenido(db: PickSupabaseClient): RepositorioContenido {
  return {
    // --- Colecciones ---------------------------------------------------------

    async colecciones(storeId): Promise<readonly Coleccion[]> {
      const { data, error } = await db
        .from('collections')
        .select(COLUMNAS_COLECCION)
        .eq('store_id', storeId)
        // Las de la home primero y en su orden; el resto después, por título.
        .order('home_position', { nullsFirst: false })
        .order('title');

      if (error) throw new Error(`No se pudieron leer las colecciones: ${error.message}`);
      return ((data ?? []) as unknown as FilaColeccion[]).map((f) => aColeccion(f));
    },

    async coleccion(storeId, id): Promise<Coleccion | null> {
      const { data, error } = await db
        .from('collections')
        .select(COLUMNAS_COLECCION)
        .eq('store_id', storeId)
        .eq('id', id)
        .maybeSingle();

      if (error) throw new Error(`No se pudo leer la colección: ${error.message}`);
      if (!data) return null;

      const { data: productos } = await db
        .from('collection_products')
        .select('product_id, position')
        .eq('collection_id', id)
        .order('position');

      return aColeccion(
        data as unknown as FilaColeccion,
        (productos ?? []).map((p) => p.product_id),
      );
    },

    async guardarColeccion(storeId, datos, id): Promise<string> {
      const tenant = await tenantDe(db, storeId);

      const fila = {
        tenant_id: tenant,
        store_id: storeId,
        title: datos.title,
        handle: datos.handle,
        subtitle: datos.subtitle ?? null,
        published: datos.published,
        home_position: datos.homePosition ?? null,
        sort: datos.sort ?? null,
        // Copia mutable: el tipo generado no acepta readonly.
        rules: datos.rules
          ? Object.fromEntries(Object.entries(datos.rules).map(([k, v]) => [k, [...v]]))
          : null,
        updated_at: new Date().toISOString(),
      };

      const consulta = id
        ? db.from('collections').update(fila).eq('id', id).eq('store_id', storeId).select('id')
        : db.from('collections').insert(fila).select('id');

      const { data, error } = await consulta.single();
      if (error) {
        if (error.code === '23505') {
          throw new Error(`Ya existe otra colección con el handle «${datos.handle}».`);
        }
        throw new Error(`No se pudo guardar la colección: ${error.message}`);
      }

      /*
       * Los productos de una manual se reemplazan en bloque: borrar y volver a
       * insertar es más simple que calcular el diff, y la lista es corta. Para
       * una dinámica no hay tabla puente que tocar, y si la colección **pasó** de
       * manual a dinámica hay que limpiar lo que había: si no, quedaría una
       * pertenencia fantasma que nadie ve y que reaparece al volver a manual.
       */
      await db.from('collection_products').delete().eq('collection_id', data.id);

      if (!datos.rules && datos.productIds && datos.productIds.length > 0) {
        const { error: errorProductos } = await db.from('collection_products').insert(
          datos.productIds.map((productId, position) => ({
            tenant_id: tenant,
            collection_id: data.id,
            product_id: productId,
            position,
          })),
        );
        if (errorProductos) {
          throw new Error(`No se pudieron guardar los productos: ${errorProductos.message}`);
        }
      }

      return data.id;
    },

    async borrarColeccion(storeId, id): Promise<void> {
      const { error } = await db
        .from('collections')
        .delete()
        .eq('id', id)
        .eq('store_id', storeId);
      if (error) throw new Error(`No se pudo borrar la colección: ${error.message}`);
    },

    // --- Banners -------------------------------------------------------------

    async banners(storeId): Promise<readonly Banner[]> {
      const { data, error } = await db
        .from('banners')
        .select(COLUMNAS_BANNER)
        .eq('store_id', storeId)
        .order('position');

      if (error) throw new Error(`No se pudieron leer los banners: ${error.message}`);

      return (data ?? []).map((b) => ({
        id: b.id,
        title: b.title,
        ...(b.subtitle ? { subtitle: b.subtitle } : {}),
        image: b.image as unknown as ProductImage,
        ...(b.image_mobile ? { imageMobile: b.image_mobile as unknown as ProductImage } : {}),
        ...(b.href ? { href: b.href } : {}),
        position: b.position,
        published: b.published,
      }));
    },

    async banner(storeId, id): Promise<Banner | null> {
      const todos = await this.banners(storeId);
      return todos.find((b) => b.id === id) ?? null;
    },

    async guardarBanner(storeId, datos, id): Promise<string> {
      const fila = {
        tenant_id: await tenantDe(db, storeId),
        store_id: storeId,
        title: datos.title,
        subtitle: datos.subtitle ?? null,
        image: { ...datos.image },
        image_mobile: datos.imageMobile ? { ...datos.imageMobile } : null,
        href: datos.href ?? null,
        position: datos.position,
        published: datos.published,
        updated_at: new Date().toISOString(),
      };

      const consulta = id
        ? db.from('banners').update(fila).eq('id', id).eq('store_id', storeId).select('id')
        : db.from('banners').insert(fila).select('id');

      const { data, error } = await consulta.single();
      if (error) throw new Error(`No se pudo guardar el banner: ${error.message}`);
      return data.id;
    },

    async borrarBanner(storeId, id): Promise<void> {
      const { error } = await db.from('banners').delete().eq('id', id).eq('store_id', storeId);
      if (error) throw new Error(`No se pudo borrar el banner: ${error.message}`);
    },

    // --- Categorías ----------------------------------------------------------

    async categorias(storeId): Promise<readonly CategoriaAdmin[]> {
      const { data, error } = await db
        .from('categories')
        .select('id, name, slug, parent_id, position, image')
        .eq('store_id', storeId)
        .order('position');

      if (error) throw new Error(`No se pudieron leer las categorías: ${error.message}`);

      return (data ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        ...(c.parent_id ? { parentId: c.parent_id } : {}),
        position: c.position,
        ...(c.image ? { image: c.image as unknown as ProductImage } : {}),
      }));
    },

    async guardarCategoria(storeId, datos, id): Promise<string> {
      const fila = {
        tenant_id: await tenantDe(db, storeId),
        store_id: storeId,
        name: datos.name,
        slug: datos.slug,
        parent_id: datos.parentId ?? null,
        position: datos.position,
        image: datos.image ? { ...datos.image } : null,
        updated_at: new Date().toISOString(),
      };

      const consulta = id
        ? db.from('categories').update(fila).eq('id', id).eq('store_id', storeId).select('id')
        : db.from('categories').insert(fila).select('id');

      const { data, error } = await consulta.single();
      if (error) {
        if (error.code === '23505') {
          throw new Error(`Ya existe otra categoría con el slug «${datos.slug}».`);
        }
        throw new Error(`No se pudo guardar la categoría: ${error.message}`);
      }
      return data.id;
    },
  };
}
