import { TOPE_DE_COLECCIONES } from '@pick/commerce-core';
import type {
  Banner,
  CatalogFilters,
  CatalogSort,
  CategoriaAdmin,
  Coleccion,
  LayoutDeSeccion,
  PaginaColecciones,
  RepositorioContenido,
  SeccionDeHome,
  TipoDeSeccion,
} from '@pick/commerce-core';
import type { ProductImage } from '@pick/commerce-types';
import type { Json } from '@pick/commerce-types/database';
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

/**
 * Renumera desde cero según el orden recibido.
 *
 * Un update por fila y no un upsert en bloque: el upsert de PostgREST exige
 * mandar la fila entera —y con ella `tenant_id`, `type`, `layout`— así que un
 * reordenamiento podría pisar campos que nadie quiso tocar. Son cinco o seis
 * filas; el viaje de más es más barato que ese riesgo.
 *
 * `store_id` va en cada update aunque el id ya sea único: es la misma barrera
 * que el resto del repositorio, y sin ella un id de otra tienda se escribiría
 * igual cuando la llamada viene con la secret key.
 */
async function reordenar(
  db: PickSupabaseClient,
  tabla: 'home_sections' | 'banners',
  storeId: string,
  idsEnOrden: readonly string[],
): Promise<void> {
  const ahora = new Date().toISOString();

  for (const [position, id] of idsEnOrden.entries()) {
    const { data, error } = await db
      .from(tabla)
      .update({ position, updated_at: ahora })
      .eq('id', id)
      .eq('store_id', storeId)
      .select('id');

    if (error) throw new Error(`No se pudo reordenar: ${error.message}`);

    /*
     * Comprobar que **tocó una fila** no es paranoia: si RLS filtra el update,
     * PostgREST devuelve éxito con cero filas. Sin esto, un reordenamiento sin
     * permiso se veía como si hubiera funcionado hasta que la pantalla se
     * recargaba con el orden viejo, y no había ningún error en ninguna parte que
     * explicara por qué.
     */
    if ((data ?? []).length !== 1) {
      throw new Error('No se pudo reordenar: la base no aceptó el cambio.');
    }
  }
}

const COLUMNAS_COLECCION = 'id, title, handle, subtitle, published, home_position, sort, rules';
const COLUMNAS_BANNER =
  'id, title, subtitle, image, image_mobile, href, cta_label, position, published, section_id';

export function repositorioContenido(db: PickSupabaseClient): RepositorioContenido {
  return {
    // --- Colecciones ---------------------------------------------------------

    async colecciones(storeId, consulta = {}): Promise<PaginaColecciones> {
      const perPage = Math.min(Math.max(consulta.perPage ?? 20, 1), TOPE_DE_COLECCIONES);
      const page = Math.max(consulta.page ?? 1, 1);
      const desde = (page - 1) * perPage;

      const { data, error, count } = await db
        .from('collections')
        .select(COLUMNAS_COLECCION, { count: 'exact' })
        .eq('store_id', storeId)
        // Las de la home primero y en su orden; el resto después, por título.
        // El orden no es cosmético acá: sin `order` dos páginas de PostgREST no
        // están garantizadas disjuntas (ADR-111).
        .order('home_position', { nullsFirst: false })
        .order('title')
        .range(desde, desde + perPage - 1);

      if (error) throw new Error(`No se pudieron leer las colecciones: ${error.message}`);

      const total = count ?? 0;
      return {
        items: ((data ?? []) as unknown as FilaColeccion[]).map((f) => aColeccion(f)),
        total,
        page,
        perPage,
        pageCount: Math.max(Math.ceil(total / perPage), 1),
      };
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
      const { error } = await db.from('collections').delete().eq('id', id).eq('store_id', storeId);
      if (error) throw new Error(`No se pudo borrar la colección: ${error.message}`);
    },

    // --- Secciones -----------------------------------------------------------

    async estadoDeRecomendaciones(storeId) {
      const { data, error } = await db
        .from('affinity_runs')
        .select('computed_at, products_count, pairs_count')
        .eq('store_id', storeId)
        .maybeSingle();

      if (error)
        throw new Error(`No se pudo leer el estado de las recomendaciones: ${error.message}`);
      if (!data) return null;

      return {
        computedAt: data.computed_at,
        productsCount: data.products_count,
        pairsCount: data.pairs_count,
      };
    },

    async secciones(storeId): Promise<readonly SeccionDeHome[]> {
      const { data, error } = await db
        .from('home_sections')
        .select('id, type, title, subtitle, layout, settings, collection_id, position, published')
        .eq('store_id', storeId)
        .order('position');

      if (error) throw new Error(`No se pudieron leer las secciones: ${error.message}`);

      return (data ?? []).map((s) => ({
        id: s.id,
        type: s.type as TipoDeSeccion,
        ...(s.title ? { title: s.title } : {}),
        ...(s.subtitle ? { subtitle: s.subtitle } : {}),
        layout: s.layout as LayoutDeSeccion,
        settings: (s.settings ?? {}) as Record<string, string | number | boolean>,
        ...(s.collection_id ? { collectionId: s.collection_id } : {}),
        position: s.position,
        published: s.published,
      }));
    },

    async guardarSeccion(storeId, datos, id): Promise<string> {
      const fila = {
        tenant_id: await tenantDe(db, storeId),
        store_id: storeId,
        type: datos.type,
        title: datos.title ?? null,
        subtitle: datos.subtitle ?? null,
        layout: datos.layout,
        /*
         * `as Json`: los tipos generados describen la columna como el `Json` de
         * PostgREST, que no acepta `readonly`. Los ajustes son un jsonb y llevan
         * arreglos desde que la sección de categorías guarda cuáles muestra.
         */
        settings: { ...datos.settings } as unknown as Json,
        // El check de la base exige colección si y sólo si el tipo es `products`.
        collection_id: datos.type === 'products' ? (datos.collectionId ?? null) : null,
        position: datos.position,
        published: datos.published,
        updated_at: new Date().toISOString(),
      };

      const consulta = id
        ? db.from('home_sections').update(fila).eq('id', id).eq('store_id', storeId).select('id')
        : db.from('home_sections').insert(fila).select('id');

      const { data, error } = await consulta.single();
      if (error) {
        if (error.message.includes('home_sections_coleccion_coherente')) {
          throw new Error('Un carrusel de productos necesita una colección.');
        }
        throw new Error(`No se pudo guardar la sección: ${error.message}`);
      }
      return data.id;
    },

    async borrarSeccion(storeId, id): Promise<void> {
      // Las piezas se van en cascada: pertenecen a la sección, no a la tienda.
      const { error } = await db
        .from('home_sections')
        .delete()
        .eq('id', id)
        .eq('store_id', storeId);
      if (error) throw new Error(`No se pudo borrar la sección: ${error.message}`);
    },

    async reordenarSecciones(storeId, idsEnOrden): Promise<void> {
      await reordenar(db, 'home_sections', storeId, idsEnOrden);
    },

    async reordenarPiezas(storeId, idsEnOrden): Promise<void> {
      await reordenar(db, 'banners', storeId, idsEnOrden);
    },

    // --- Piezas (slides del hero y mosaicos) ---------------------------------

    async piezas(storeId, sectionId): Promise<readonly Banner[]> {
      const { data, error } = await db
        .from('banners')
        .select(COLUMNAS_BANNER)
        .eq('store_id', storeId)
        .eq('section_id', sectionId)
        .order('position');

      if (error) throw new Error(`No se pudieron leer las piezas: ${error.message}`);

      return (data ?? []).map((b) => ({
        id: b.id,
        title: b.title,
        ...(b.subtitle ? { subtitle: b.subtitle } : {}),
        image: b.image as unknown as ProductImage,
        ...(b.image_mobile ? { imageMobile: b.image_mobile as unknown as ProductImage } : {}),
        ...(b.href ? { href: b.href } : {}),
        ...(b.cta_label ? { ctaLabel: b.cta_label } : {}),
        position: b.position,
        published: b.published,
        ...(b.section_id ? { sectionId: b.section_id } : {}),
      }));
    },

    async guardarBanner(storeId, datos, id): Promise<string> {
      const fila = {
        tenant_id: await tenantDe(db, storeId),
        store_id: storeId,
        section_id: datos.sectionId ?? null,
        title: datos.title,
        subtitle: datos.subtitle ?? null,
        image: { ...datos.image },
        image_mobile: datos.imageMobile ? { ...datos.imageMobile } : null,
        href: datos.href ?? null,
        cta_label: datos.ctaLabel ?? null,
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

    async paginaDeCategorias(storeId, { page, perPage, query }) {
      const desde = (Math.max(1, page) - 1) * perPage;

      let consulta = db
        .from('categories')
        .select('id, name, slug, parent_id, position, image', { count: 'exact' })
        .eq('store_id', storeId);

      // Coincidencia de subcadena, insensible a mayúsculas: es lo que espera
      // quien busca «cal» para encontrar «Calzado».
      if (query && query.trim() !== '') consulta = consulta.ilike('name', `%${query.trim()}%`);

      const { data, error, count } = await consulta
        // Por nombre y no por posición: la posición dejó de editarse desde que
        // el orden de la portada lo decide la sección de categorías, así que
        // ordenar por ella dejaría la lista en el orden de creación.
        .order('name')
        .range(desde, desde + perPage - 1);

      if (error) throw new Error(`No se pudieron leer las categorías: ${error.message}`);

      const total = count ?? 0;
      return {
        items: (data ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          ...(c.parent_id ? { parentId: c.parent_id } : {}),
          position: c.position,
          ...(c.image ? { image: c.image as unknown as ProductImage } : {}),
        })),
        total,
        page: Math.max(1, page),
        pageCount: Math.max(1, Math.ceil(total / perPage)),
      };
    },

    async borrarCategoria(storeId, id): Promise<void> {
      const { error } = await db
        .from('categories')
        .delete()
        .eq('id', id)
        // Acotado por tienda además de por id: RLS ya impide tocar otra
        // organización, pero dentro de una con dos tiendas el id solo no dice
        // de cuál es.
        .eq('store_id', storeId);

      if (error) throw new Error(`No se pudo borrar la categoría: ${error.message}`);
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
