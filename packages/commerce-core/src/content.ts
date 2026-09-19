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
 * Una página de categorías. Misma forma que el resto de las listas paginadas del
 * Admin, para que `Paginacion` la reciba sin traducir nada.
 */
export interface PaginaDeCategorias {
  readonly items: readonly CategoriaAdmin[];
  readonly total: number;
  readonly page: number;
  readonly pageCount: number;
}

/**
 * El contenido, desde el Admin.
 *
 * Todo detrás de `catalog.write` y sin permiso propio: el precedente de ADR-056
 * dice no inventar uno cuando ningún rol distingue, y acá no distingue —quien
 * cura el catálogo cura la vidriera—. Las promociones fueron la excepción porque
 * son una decisión de precio.
 */
/**
 * Las colecciones son un dataset que crece —una campaña por temporada y por
 * marca se acumulan—, así que se paginan como los productos, los pedidos y los
 * clientes. La forma es la misma de `PaginaProductos` a propósito: así la
 * `Paginacion` del Admin las dibuja sin adaptador.
 */
export interface ConsultaColecciones {
  readonly page?: number;
  /** Con techo: ver `TOPE_DE_COLECCIONES`. */
  readonly perPage?: number;
}

export interface PaginaColecciones {
  readonly items: readonly Coleccion[];
  readonly total: number;
  readonly page: number;
  readonly perPage: number;
  readonly pageCount: number;
}

/**
 * El techo, para los dos llamadores que necesitan la lista entera: los
 * selectores de colección de una sección de portada.
 *
 * «Entera» no puede significar «sin límite», que es lo que hacía esta consulta
 * —ni `.range()` ni `.limit()`, contra la restricción de paginación de
 * CLAUDE.md—. Un tope explícito es peor que paginar de verdad y mucho mejor que
 * traer una tabla sin fondo: si una tienda llega acá, el selector muestra 200 y
 * no tumba la pantalla.
 */
export const TOPE_DE_COLECCIONES = 200;

/**
 * Lo que una sección trajo: entradas a un producto desde ella, pedidos de esas
 * mismas visitas que incluyeron ese producto, y lo que se pagó por esas líneas.
 */
export interface ResultadoDeSeccion {
  readonly clicks: number;
  readonly orders: number;
  readonly revenue: number;
}

export type ResultadoPorSeccion = Readonly<Record<string, ResultadoDeSeccion>>;

/** Lo que `affinity_runs` guarda de la última corrida (ADR-127). */
export interface EstadoDeRecomendaciones {
  readonly computedAt: string | null;
  readonly productsCount: number;
  readonly pairsCount: number;
}

export interface RepositorioContenido {
  colecciones(storeId: string, consulta?: ConsultaColecciones): Promise<PaginaColecciones>;
  coleccion(storeId: string, id: string): Promise<Coleccion | null>;
  guardarColeccion(storeId: string, datos: DatosDeColeccion, id?: string): Promise<string>;
  borrarColeccion(storeId: string, id: string): Promise<void>;

  secciones(storeId: string): Promise<readonly SeccionDeHome[]>;
  /**
   * Cuándo se recalcularon las recomendaciones de esta tienda y sobre cuánto.
   *
   * Nulo cuando todavía no corrió, que es el estado de una tienda recién
   * abierta. Lo muestra el Admin: un orden que se arma solo tiene que poder
   * decir cuándo se armó, o el comercio no sabe si mira algo viejo.
   */
  estadoDeRecomendaciones(storeId: string): Promise<EstadoDeRecomendaciones | null>;
  /**
   * Qué trajo cada sección de la portada en los últimos `dias`.
   *
   * Devuelve un mapa por id de sección, con ceros para las que no tuvieron nada:
   * una sección que no aparece se lee como un error de la pantalla, y un cero se
   * lee como lo que es.
   */
  resultadoDeSecciones(storeId: string, dias?: number): Promise<ResultadoPorSeccion>;
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

  /** Todas, para los selectores. Un `<select>` con miles de opciones ya es otro problema. */
  categorias(storeId: string): Promise<readonly CategoriaAdmin[]>;
  /**
   * La página que muestra la pantalla de categorías.
   *
   * Separada de `categorias` y no un parámetro opcional: son dos usos con
   * necesidades opuestas —una lista que crece y hay que acotar, y un selector
   * que necesita el conjunto entero— y un método que hace las dos cosas termina
   * llamándose sin paginar desde donde importaba paginar.
   */
  paginaDeCategorias(
    storeId: string,
    opciones: { page: number; perPage: number; query?: string },
  ): Promise<PaginaDeCategorias>;
  guardarCategoria(storeId: string, datos: DatosDeCategoria, id?: string): Promise<string>;
  /**
   * Borra una categoría.
   *
   * Los productos que la tenían **no se borran**: quedan sin categoría, porque
   * `products.category_id` es `on delete set null`. Las subcategorías sí caen
   * con ella. Las dos cosas las decide el esquema y la pantalla las anuncia.
   */
  borrarCategoria(storeId: string, id: string): Promise<void>;
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
  /**
   * Ajustes de presentación por tipo.
   *
   * Admite arreglos porque la sección de categorías guarda **cuáles** muestra y
   * en qué orden (`categoryIds`). Va acá y no en una tabla intermedia por el
   * mismo motivo que `columns`: es una decisión de presentación de una sección,
   * y una tabla por cada una sería una migración por retoque visual.
   */
  readonly settings: Readonly<Record<string, string | number | boolean | readonly string[]>>;
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
      /**
       * Cuáles muestra, en su orden. Vacío es todas.
       *
       * Resuelto acá y no leído de `settings` en la plantilla: este tipo existe
       * justamente para que el storefront reciba la decisión tomada en vez de
       * interpretar un jsonb en medio del render.
       */
      readonly categoryIds: readonly string[];
    };

/** Lo que un carrusel de la home necesita de un producto. Es `Product`. */
export type ProductoDeSeccion = import('@pick/commerce-types').Product;

/** Cuántos productos entran en un carrusel de la home. */
export const PRODUCTOS_POR_SECCION = 8;

/** Columnas por defecto de un bloque de mosaicos. */
export const COLUMNAS_POR_DEFECTO = 2;

/** Las columnas declaradas en `settings`, acotadas a lo que la grilla admite. */
export function columnasDe(
  settings: Readonly<Record<string, string | number | boolean | readonly string[]>>,
): number {
  const crudo = settings.columns;
  const n = typeof crudo === 'number' ? crudo : Number(crudo);
  // Fuera de rango o ausente cae al defecto: el dato viene de un jsonb, y un
  // `columns: 97` dibujaría mosaicos de dos píxeles sin avisar.
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : COLUMNAS_POR_DEFECTO;
}

/**
 * Qué categorías muestra una sección de categorías, en su orden.
 *
 * Vacío significa **todas**, y no «ninguna». Es lo que hace que las secciones
 * que ya existían sigan mostrando lo mismo: antes no había forma de elegir, así
 * que la ausencia de elección tiene que seguir queriendo decir lo de siempre.
 * Una tira de categorías vacía tampoco tendría sentido como estado guardable.
 */
export function categoriasDe(
  settings: Readonly<Record<string, string | number | boolean | readonly string[]>>,
): readonly string[] {
  const crudo = settings.categoryIds;
  if (!Array.isArray(crudo)) return [];
  return crudo.filter((id): id is string => typeof id === 'string' && id !== '');
}

/**
 * Ordena y filtra las categorías según lo que la sección eligió.
 *
 * En el orden de la selección, no en el del catálogo: elegir el orden es la
 * mitad de para qué se eligen. Un id que ya no existe —una categoría borrada—
 * simplemente no aparece, sin romper la sección.
 */
export function categoriasDeLaSeccion<T extends { readonly id: string }>(
  todas: readonly T[],
  seleccion: readonly string[],
): readonly T[] {
  if (seleccion.length === 0) return todas;
  const porId = new Map(todas.map((c) => [c.id, c]));
  return seleccion.flatMap((id) => {
    const c = porId.get(id);
    return c ? [c] : [];
  });
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
  if (desde === hacia || desde < 0 || hacia < 0 || desde >= lista.length || hacia >= lista.length) {
    return lista;
  }

  const copia = [...lista];
  const [movido] = copia.splice(desde, 1);
  copia.splice(hacia, 0, movido!);
  return copia;
}
