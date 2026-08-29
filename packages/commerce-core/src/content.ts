import type { ProductImage } from '@pick/commerce-types';
import type { CatalogFilters, CatalogSort } from './catalog.ts';

/**
 * Lo que el comercio cura: la home y lo que la llena.
 *
 * La home se compone por **secciones** ordenadas, cada una con su tipo: el hero
 * de arriba, los mosaicos promocionales, los carruseles de productos y la tira
 * de categorías. Ver `TipoDeSeccion` más abajo, que es donde queda fijado el
 * vocabulario.
 *
 * Dentro de eso, los carruseles siguen siendo **colecciones**: destacados es una
 * manual, novedades y más vendidos son dinámicas con su orden. Eso no cambió y
 * es lo que evita tres tipos de sección para tres carruseles.
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

/**
 * Una pieza gráfica: un slide del hero o un mosaico promocional.
 *
 * Es la **misma fila** en los dos casos; lo que cambia es el tipo de la sección
 * que la contiene. Un slide y un mosaico llevan lo mismo —imagen, título,
 * bajada, enlace— y separarlos en dos tablas habría duplicado el formulario, la
 * subida de imagen y la política de Storage para ganar nada.
 */
export interface Banner {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly image: ProductImage;
  /** Propia para teléfono. Ausente = se usa la de escritorio. */
  readonly imageMobile?: ProductImage;
  /** Ruta del storefront. Ausente = la pieza no enlaza a ninguna parte. */
  readonly href?: string;
  /**
   * Texto del botón. Con él la pieza dibuja un botón —lo típico de un hero—;
   * sin él, el bloque entero es el enlace, que es lo típico de un mosaico.
   */
  readonly ctaLabel?: string;
  readonly position: number;
  readonly published: boolean;
  /** La sección que la contiene. */
  readonly sectionId?: string;
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

  secciones(storeId: string): Promise<readonly SeccionDeHome[]>;
  guardarSeccion(storeId: string, datos: DatosDeSeccion, id?: string): Promise<string>;
  borrarSeccion(storeId: string, id: string): Promise<void>;

  /**
   * Escribe el orden a partir de la lista de ids.
   *
   * La posición se **deriva** del orden en vez de pedirla: la interfaz mueve
   * elementos en una lista y esto renumera desde cero. Guardar la posición de a
   * una dejaría huecos y empates que después hay que desempatar.
   */
  reordenarSecciones(storeId: string, idsEnOrden: readonly string[]): Promise<void>;
  reordenarPiezas(storeId: string, idsEnOrden: readonly string[]): Promise<void>;

  /** Las piezas de una sección, en orden. */
  piezas(storeId: string, sectionId: string): Promise<readonly Banner[]>;
  guardarBanner(storeId: string, datos: DatosDeBanner, id?: string): Promise<string>;
  borrarBanner(storeId: string, id: string): Promise<void>;

  categorias(storeId: string): Promise<readonly CategoriaAdmin[]>;
  guardarCategoria(storeId: string, datos: DatosDeCategoria, id?: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Las secciones de la home
// ---------------------------------------------------------------------------

/**
 * Los bloques que componen la home.
 *
 * `hero` es la pieza grande de arriba; con varias es un slideshow y cada una es
 * un slide. `tiles` son los mosaicos promocionales de más abajo. `products` es
 * un carrusel, o sea una colección. `categories` es la tira de categorías.
 *
 * Ese vocabulario no es decoración: «banner» se usaba para las dos primeras y
 * eso hacía imposible pedir una sin la otra.
 */
export type TipoDeSeccion = 'hero' | 'tiles' | 'products' | 'categories';

/**
 * Estático o carrusel.
 *
 * Con una sola pieza dan lo mismo; la elección importa cuando hay varias, que es
 * justo cuando el comercio quiere decidirlo.
 */
export type LayoutDeSeccion = 'static' | 'slider';

export interface SeccionDeHome {
  readonly id: string;
  readonly type: TipoDeSeccion;
  readonly title?: string;
  readonly subtitle?: string;
  readonly layout: LayoutDeSeccion;
  /**
   * Ajustes de presentación por tipo. Hoy sólo `columns` en `tiles`.
   *
   * Valores escalares y no `unknown`: son ajustes que se guardan en un jsonb y
   * se leen en una plantilla, y un `unknown` obliga a castear en cada uso además
   * de admitir formas que la base no acepta.
   */
  readonly settings: Readonly<Record<string, string | number | boolean>>;
  /** Sólo en `products`, y obligatorio ahí: la base lo comprueba. */
  readonly collectionId?: string;
  readonly position: number;
  readonly published: boolean;
}

/**
 * Una sección con su contenido ya resuelto, lista para dibujar.
 *
 * El storefront recibe esto y no arma consultas: qué se muestra en la home es
 * una decisión del comercio, guardada. Antes media home vivía en constantes del
 * código —`COLECCION_DESTACADA`, un hero fijo— y cambiarla exigía desplegar.
 */
export type SeccionResuelta =
  | {
      readonly kind: 'hero';
      readonly id: string;
      readonly layout: LayoutDeSeccion;
      readonly piezas: readonly Banner[];
    }
  | {
      readonly kind: 'tiles';
      readonly id: string;
      readonly title?: string;
      readonly subtitle?: string;
      readonly layout: LayoutDeSeccion;
      readonly columns: number;
      readonly piezas: readonly Banner[];
    }
  | {
      readonly kind: 'products';
      readonly id: string;
      readonly title?: string;
      readonly subtitle?: string;
      readonly productos: readonly ProductoDeSeccion[];
    }
  | {
      readonly kind: 'categories';
      readonly id: string;
      readonly title?: string;
      readonly layout: LayoutDeSeccion;
    };

/** Lo que un carrusel de la home necesita de un producto. Es `Product`. */
export type ProductoDeSeccion = import('@pick/commerce-types').Product;

/** Cuántos productos entran en un carrusel de la home. */
export const PRODUCTOS_POR_SECCION = 8;

/** Columnas por defecto de un bloque de mosaicos. */
export const COLUMNAS_POR_DEFECTO = 2;

/** Las columnas declaradas en `settings`, acotadas a lo que la grilla admite. */
export function columnasDe(settings: Readonly<Record<string, string | number | boolean>>): number {
  const crudo = settings.columns;
  const n = typeof crudo === 'number' ? crudo : Number(crudo);
  // Fuera de rango o ausente cae al defecto: el dato viene de un jsonb, y un
  // `columns: 97` dibujaría mosaicos de dos píxeles sin avisar.
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : COLUMNAS_POR_DEFECTO;
}

export type DatosDeSeccion = Omit<SeccionDeHome, 'id'>;

/**
 * Mover un elemento de una lista a otra posición.
 *
 * Devuelve la lista nueva; no toca la original. Fuera de rango devuelve la misma
 * lista en vez de lanzar: quien llama es un botón de flecha, y el caso «ya está
 * primero» tiene que ser inofensivo, no un error.
 *
 * Vive en el core y no en el Admin porque es la semántica del orden —qué
 * significa «subir»— y no una decisión de interfaz: quien la reimplemente en
 * otra pantalla debería obtener exactamente esto.
 */
export function moverEn<T>(lista: readonly T[], desde: number, hacia: number): readonly T[] {
  if (
    desde === hacia ||
    desde < 0 ||
    hacia < 0 ||
    desde >= lista.length ||
    hacia >= lista.length
  ) {
    return lista;
  }

  const copia = [...lista];
  const [movido] = copia.splice(desde, 1);
  copia.splice(hacia, 0, movido!);
  return copia;
}
