import {
  columnasDe,
  PRODUCTOS_POR_SECCION,
  type Banner,
  type CatalogQuery,
  type CatalogSort,
  type CategoriaCatalogo,
  type DefinicionFaceta,
  type LayoutDeSeccion,
  type RepositorioCatalogo,
  type ResultadoCatalogo,
  type SeccionResuelta,
} from '@pick/commerce-core';
import type { Product, ProductImage } from '@pick/commerce-types';
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

    async porColeccion(storeId, handle, limite, sort) {
      const { data, error } = await db.rpc('catalog_search', {
        p_store_id: storeId,
        p_filters: {},
        p_search: '',
        p_sort: sort ?? 'relevance',
        p_page: 1,
        p_per_page: limite,
        p_collection: handle,
      });

      if (error) throw new Error(`No se pudo leer la colección ${handle}: ${error.message}`);
      return mapearResultadoCatalogo(data).items;
    },

    async home(storeId): Promise<readonly SeccionResuelta[]> {
      /*
       * Dos consultas para todas las secciones y sus piezas, y después una por
       * cada carrusel de productos.
       *
       * Las piezas no se piden sección por sección: son pocas y una tienda con
       * cuatro bloques haría cinco viajes para traer diez filas. Los carruseles
       * sí necesitan uno cada uno —cada colección es una consulta distinta— pero
       * van en paralelo.
       */
      const [{ data: filas, error }, { data: piezas, error: errorPiezas }] = await Promise.all([
        db
          .from('home_sections')
          .select('id, type, title, subtitle, layout, settings, collection_id')
          .eq('store_id', storeId)
          .eq('published', true)
          .order('position'),
        db
          .from('banners')
          .select('id, title, subtitle, image, image_mobile, href, cta_label, position, section_id')
          .eq('store_id', storeId)
          .eq('published', true)
          .order('position'),
      ]);

      if (error) throw new Error(`No se pudieron leer las secciones: ${error.message}`);
      if (errorPiezas) throw new Error(`No se pudieron leer las piezas: ${errorPiezas.message}`);

      const porSeccion = new Map<string, Banner[]>();
      for (const b of piezas ?? []) {
        if (!b.section_id) continue;
        const lista = porSeccion.get(b.section_id) ?? [];
        lista.push({
          id: b.id,
          title: b.title,
          ...(b.subtitle ? { subtitle: b.subtitle } : {}),
          image: b.image as unknown as ProductImage,
          ...(b.image_mobile ? { imageMobile: b.image_mobile as unknown as ProductImage } : {}),
          ...(b.href ? { href: b.href } : {}),
          ...(b.cta_label ? { ctaLabel: b.cta_label } : {}),
          position: b.position,
          published: true,
        });
        porSeccion.set(b.section_id, lista);
      }

      // Las colecciones de los carruseles, para resolver cada una por su handle.
      const idsDeColeccion = (filas ?? [])
        .map((f) => f.collection_id)
        .filter((id): id is string => Boolean(id));

      const { data: colecciones } = idsDeColeccion.length
        ? await db.from('collections').select('id, handle, sort').in('id', idsDeColeccion)
        : { data: [] };

      const porColeccion = new Map((colecciones ?? []).map((c) => [c.id, c]));

      return (
        await Promise.all(
          (filas ?? []).map(async (f): Promise<SeccionResuelta | null> => {
            const settings = (f.settings ?? {}) as Record<string, string | number | boolean>;
            const layout = f.layout as LayoutDeSeccion;

            if (f.type === 'hero') {
              return { kind: 'hero', id: f.id, layout, piezas: porSeccion.get(f.id) ?? [] };
            }

            if (f.type === 'tiles') {
              return {
                kind: 'tiles',
                id: f.id,
                ...(f.title ? { title: f.title } : {}),
                ...(f.subtitle ? { subtitle: f.subtitle } : {}),
                layout,
                columns: columnasDe(settings),
                piezas: porSeccion.get(f.id) ?? [],
              };
            }

            if (f.type === 'categories') {
              return {
                kind: 'categories',
                id: f.id,
                layout,
                ...(f.title ? { title: f.title } : {}),
              };
            }

            const coleccion = f.collection_id ? porColeccion.get(f.collection_id) : undefined;
            // Una sección de productos cuya colección se despublicó o se borró no
            // se dibuja, en vez de dejar un encabezado sobre nada.
            if (!coleccion) return null;

            return {
              kind: 'products',
              id: f.id,
              ...(f.title ? { title: f.title } : {}),
              ...(f.subtitle ? { subtitle: f.subtitle } : {}),
              productos: await this.porColeccion(
                storeId,
                coleccion.handle,
                PRODUCTOS_POR_SECCION,
                (coleccion.sort as CatalogSort | null) ?? undefined,
              ),
            };
          }),
        )
      ).filter((s): s is SeccionResuelta => s !== null);
    },

    async categorias(storeId): Promise<readonly CategoriaCatalogo[]> {
      const { data, error } = await db
        .from('categories')
        .select('id, name, slug, image')
        .eq('store_id', storeId)
        .order('position');

      if (error) throw new Error(`No se pudieron leer las categorías: ${error.message}`);
      return (data ?? []).map((c) => ({
        id: c.id,
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
