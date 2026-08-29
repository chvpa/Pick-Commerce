import type { ProductImage } from '@pick/commerce-types';
import type { CatalogFilters, CatalogSort } from './catalog.ts';

/**
 * Lo que el comercio cura: colecciones, banners y categorías.
 *
 * Las tres secciones que el ROADMAP pide para la home —destacados, novedades,
 * más vendidos— **no son tres cosas distintas**: son una colección cada una.
 * Destacados es manual, las otras dos son dinámicas con su orden. Un modelo de
 * «secciones» aparte habría dado tres formas de decir lo mismo y el comercio
 * tendría que aprender cuál usar cuándo.
 */

/** Manual: lista explícita. Dinámica: consulta guardada (ADR-056). */
export type TipoDeColeccion = 'manual' | 'dinamica';

export interface Coleccion {
  readonly id: string;
  readonly title: string;
  readonly handle: string;
  readonly subtitle?: string;
  readonly published: boolean;
  /** Posición del carrusel en la home. Ausente = no aparece. */
  readonly homePosition?: number;
  /** Sólo para las dinámicas. Para las manuales manda el orden editorial. */
  readonly sort?: CatalogSort;
  /** Presente = dinámica. Tiene la forma de `CatalogFilters`. */
  readonly rules?: CatalogFilters;
  /** Sólo para las manuales, en orden. */
  readonly productIds?: readonly string[];
}

export function tipoDe(c: Pick<Coleccion, 'rules'>): TipoDeColeccion {
  return c.rules ? 'dinamica' : 'manual';
}

export interface Banner {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly image: ProductImage;
  /** Propia para teléfono. Ausente = se usa la de escritorio. */
  readonly imageMobile?: ProductImage;
  /** Ruta del storefront. Ausente = el banner no enlaza a ninguna parte. */
  readonly href?: string;
  readonly position: number;
  readonly published: boolean;
}

export interface CategoriaAdmin {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly parentId?: string;
  readonly position: number;
  readonly image?: ProductImage;
}

/** Lo que el formulario manda. Sin `id`: al crear todavía no hay. */
export type DatosDeColeccion = Omit<Coleccion, 'id'>;
export type DatosDeBanner = Omit<Banner, 'id'>;
export type DatosDeCategoria = Omit<CategoriaAdmin, 'id'>;

/**
 * El contenido, desde el Admin.
 *
 * Todo detrás de `catalog.write` y sin permiso propio: el precedente de ADR-056
 * dice no inventar uno cuando ningún rol distingue, y acá no distingue —quien
 * cura el catálogo cura la vidriera—. Las promociones fueron la excepción porque
 * son una decisión de precio.
 */
export interface RepositorioContenido {
  colecciones(storeId: string): Promise<readonly Coleccion[]>;
  coleccion(storeId: string, id: string): Promise<Coleccion | null>;
  guardarColeccion(storeId: string, datos: DatosDeColeccion, id?: string): Promise<string>;
  borrarColeccion(storeId: string, id: string): Promise<void>;

  banners(storeId: string): Promise<readonly Banner[]>;
  banner(storeId: string, id: string): Promise<Banner | null>;
  guardarBanner(storeId: string, datos: DatosDeBanner, id?: string): Promise<string>;
  borrarBanner(storeId: string, id: string): Promise<void>;

  categorias(storeId: string): Promise<readonly CategoriaAdmin[]>;
  guardarCategoria(storeId: string, datos: DatosDeCategoria, id?: string): Promise<string>;
}

/**
 * Una sección de la home ya resuelta: la colección y sus productos.
 *
 * El storefront pide esto y no arma la consulta: qué se destaca es una decisión
 * del comercio, guardada, no una constante del código. Antes vivía en
 * `COLECCION_DESTACADA`, un literal en el storefront de la demo.
 */
export interface SeccionDeHome {
  readonly title: string;
  readonly subtitle?: string;
  readonly handle: string;
  readonly sort?: CatalogSort;
}

/** Cuántos productos entran en un carrusel de la home. */
export const PRODUCTOS_POR_SECCION = 8;
