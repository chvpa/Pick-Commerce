import type { ProductStatus } from '@pick/commerce-types';
import type { FieldSources } from './field-sources.ts';

/**
 * Contrato del catálogo desde el Admin.
 *
 * Separado del `RepositorioCatalogo` del storefront a propósito: éste ve
 * borradores y archivados, y escribe. Mezclarlos dejaría al storefront con
 * métodos de escritura a un `import` de distancia.
 */

/** Fila de la tabla de productos. */
export interface ResumenProducto {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly status: ProductStatus;
  readonly brand?: string;
  readonly updatedAt: string;
  readonly variantes: number;
  /** Espejo del ERP: informativo, nunca autoridad. Ver ADR-009. */
  readonly stock: number;
  readonly precioDesde?: number;
  readonly currency?: string;
  readonly imagen?: string;
}

export interface ConsultaProductos {
  /** Busca en título, handle, marca y SKU. Todos los términos deben aparecer. */
  readonly query?: string;
  readonly status?: ProductStatus;
  readonly page?: number;
  readonly perPage?: number;
}

export interface PaginaProductos {
  readonly items: readonly ResumenProducto[];
  readonly total: number;
  readonly page: number;
  readonly perPage: number;
  readonly pageCount: number;
}

/** Variante tal como la edita el formulario: precio y stock en un mismo lugar. */
export interface VarianteEditable {
  /** Ausente en una variante nueva. */
  readonly id?: string;
  readonly sku: string;
  readonly title: string;
  readonly barcode?: string;
  /** En unidades mínimas, como `Money`. */
  readonly price: number;
  readonly currency: string;
  readonly compareAtPrice?: number;
  readonly cost?: number;
  readonly attributes: Readonly<Record<string, string>>;
  /** Omitirlo deja el stock como está; no es lo mismo que cero. */
  readonly stock?: number;
}

export interface MedioEditable {
  readonly url: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
}

export interface ProductoEditable {
  readonly id?: string;
  readonly handle: string;
  readonly title: string;
  readonly description?: string;
  readonly brand?: string;
  readonly categoryId?: string;
  readonly status: ProductStatus;
  readonly variants: readonly VarianteEditable[];
  /**
   * Ausente significa "no tocar las imágenes"; un array —aunque esté vacío—
   * las reemplaza. Es la misma convención que el stock de una variante, y es lo
   * que permite que un import por CSV no borre las fotos que ya tenía el
   * producto: un archivo de texto no puede llevar el ancho y el alto, que son
   * obligatorios contra CLS.
   */
  readonly media?: readonly MedioEditable[];
}

/** Un producto para editar, más de quién es cada campo. */
export interface ProductoCargado {
  readonly producto: ProductoEditable;
  readonly fieldSources: FieldSources;
}

/**
 * Los dos estados que el listado alterna: en la tienda o archivado.
 *
 * `draft` e `inactive` existen y siguen siendo válidos; se eligen desde el
 * formulario, que es donde caben los cuatro.
 */
export type EstadoAlternable = Extract<ProductStatus, 'active' | 'archived'>;

/**
 * Una foto con el fondo limpiado por la IA, esperando que alguien la mire
 * (ADR-130). Viaja con la original al lado: aprobar sin verlas juntas sería
 * publicar a ciegas.
 */
export interface PropuestaDeFoto {
  readonly id: string;
  readonly productId: string;
  readonly title: string;
  readonly originalUrl: string;
  readonly proposedUrl: string;
  readonly createdAt: string;
}

export interface PaginaDePropuestas {
  readonly items: readonly PropuestaDeFoto[];
  readonly total: number;
  readonly page: number;
  readonly perPage: number;
  readonly pageCount: number;
}

/** Un producto que ya tiene foto y se le puede pedir la limpieza de fondo. */
export interface FotoParaLimpiar {
  readonly productId: string;
  readonly title: string;
  readonly url: string;
}

/** Un producto que espera su foto, con lo justo para encontrarlo en el depósito. */
export interface ProductoSinFoto {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly brand?: string;
  readonly sku?: string;
  readonly stock: number;
}

/**
 * Cuánto de la vitrina se ve (v2 Fase 5). `listables` es «con foto y con stock»:
 * lo que una tienda que oculta lo agotado y lo que no tiene foto termina
 * mostrando.
 */
export interface CuentasDeVitrina {
  readonly activos: number;
  readonly listables: number;
  readonly sinFotoConStock: number;
  readonly recuperadosSemana: number;
}

export interface PaginaSinFoto {
  readonly items: readonly ProductoSinFoto[];
  readonly total: number;
  readonly page: number;
  readonly perPage: number;
  readonly pageCount: number;
  readonly cuentas: CuentasDeVitrina;
}

// ---------------------------------------------------------------------------
// Descripciones (v2 Fase 8)
// ---------------------------------------------------------------------------

/**
 * Un producto sin descripción.
 *
 * Es el techo del buscador y no una cuestión de prolijidad: `search_doc` es
 * título más marca, y el vector semántico se arma con eso más categoría y
 * atributos. Sin una línea que diga qué es, no hay con qué encontrarlo cuando
 * alguien lo pide con otras palabras.
 */
export interface ProductoSinDescripcion {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly brand?: string;
  readonly stock: number;
}

/** Cuánto del catálogo se puede encontrar, y si el trabajo avanza. */
export interface CuentasDeDescripcion {
  readonly activos: number;
  readonly conDescripcion: number;
  readonly sinDescripcion: number;
  readonly pendientes: number;
  readonly escritasSemana: number;
}

export interface PaginaSinDescripcion {
  readonly items: readonly ProductoSinDescripcion[];
  readonly total: number;
  readonly page: number;
  readonly perPage: number;
  readonly pageCount: number;
  readonly cuentas: CuentasDeDescripcion;
}

/** Todo lo que la IA necesita mirar para escribir una descripción. */
export interface ProductoParaDescribir {
  readonly productId: string;
  readonly title: string;
  readonly brand?: string;
  readonly categoria?: string;
  readonly variantes: readonly { title: string; atributos: Record<string, string> }[];
  readonly imagenes: readonly string[];
}

/** Una descripción propuesta, esperando que alguien la lea. */
export interface PropuestaDeDescripcion {
  readonly id: string;
  readonly productId: string;
  readonly title: string;
  readonly proposed: string;
  readonly createdAt: string;
}

export interface PaginaDeDescripciones {
  readonly items: readonly PropuestaDeDescripcion[];
  readonly total: number;
  readonly page: number;
  readonly perPage: number;
  readonly pageCount: number;
}

/** Una foto recién subida, lista para colgar de su producto. */
export interface FotoNueva {
  readonly url: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
}

// ---------------------------------------------------------------------------
// Antigüedad del stock (ADR-135)
// ---------------------------------------------------------------------------
//
// La base no guarda cuándo entró cada unidad, así que la antigüedad es la que sí
// se sabe: días desde la última venta de la variante, o desde el alta del
// producto si nunca se vendió. Los tramos los decide `admin_inventory_aging`,
// porque la lista se filtra por ellos en el servidor.

export const TRAMOS_DE_ANTIGUEDAD = ['0_30', '31_90', '91_180', '180_plus'] as const;

export type TramoDeAntiguedad = (typeof TRAMOS_DE_ANTIGUEDAD)[number];

export const ETIQUETA_TRAMO: Readonly<Record<TramoDeAntiguedad, string>> = {
  '0_30': 'Hasta 30 días',
  '31_90': '31 a 90 días',
  '91_180': '91 a 180 días',
  '180_plus': 'Más de 180 días',
};

type Importe = { readonly amount: number; readonly currency: string };

export interface ResumenDeTramo {
  readonly bucket: TramoDeAntiguedad;
  readonly variants: number;
  readonly units: number;
  readonly priceValue: Importe;
  /** Sólo de las unidades con costo cargado: leerlo junto con `costCoverage`. */
  readonly costValue: Importe;
  /** Qué parte de las unidades tiene costo, de 0 a 1 (ADR-101). */
  readonly costCoverage: number;
}

export interface VarianteQuieta {
  readonly variantId: string;
  readonly productId: string;
  readonly sku: string;
  readonly title: string;
  readonly variantTitle?: string;
  readonly stock: number;
  readonly days: number;
  /** Ausente si nunca se vendió: los días cuentan desde el alta del producto. */
  readonly lastSoldAt?: string;
  readonly bucket: TramoDeAntiguedad;
  readonly priceValue: Importe;
  /** Ausente sin costo cargado: no vale cero, vale «no sé». */
  readonly costValue?: Importe;
}

export interface PaginaAntiguedad {
  /** Los cuatro, en orden, también los vacíos. */
  readonly buckets: readonly ResumenDeTramo[];
  readonly items: readonly VarianteQuieta[];
  readonly total: number;
  readonly page: number;
  readonly perPage: number;
  readonly pageCount: number;
}

export interface ConsultaAntiguedad {
  readonly tramo?: TramoDeAntiguedad;
  readonly page?: number;
  readonly perPage?: number;
}

export interface RepositorioAdminCatalogo {
  listar(storeId: string, consulta: ConsultaProductos): Promise<PaginaProductos>;
  porId(storeId: string, id: string): Promise<ProductoCargado | null>;
  /** Devuelve el id: en un alta es el único lugar donde aparece. */
  guardar(storeId: string, producto: ProductoEditable): Promise<string>;
  /**
   * Archivar y no borrar: un producto puede estar en pedidos, y borrarlo dejaría
   * historial huérfano. `archived` lo saca del storefront y lo conserva.
   */
  archivar(storeId: string, id: string): Promise<void>;
  /**
   * Publica o archiva productos: uno desde el interruptor de su fila, varios
   * desde la selección múltiple.
   *
   * Los dos estados que faltan —`draft` e `inactive`— se eligen desde el
   * formulario. Un interruptor no puede representar cuatro estados, y el que la
   * lista necesita resolver es el único que era de ida: archivar sacaba el
   * producto de la tienda y desde el listado no había forma de volver.
   */
  cambiarEstadoEnLote(
    storeId: string,
    ids: readonly string[],
    status: EstadoAlternable,
  ): Promise<void>;
  /**
   * Productos completos, paginados. Es lo que necesita el export: el listado de
   * la tabla no trae variantes ni atributos.
   */
  completos(storeId: string, page: number, perPage: number): Promise<readonly ProductoEditable[]>;
  /**
   * Los productos activos sin foto, primero los que tienen stock, con las
   * cuentas de la vitrina. Es la lista con la que se sale a fotografiar.
   */
  sinFoto(storeId: string, page: number, perPage?: number): Promise<PaginaSinFoto>;
  /**
   * El stock por días desde la última venta, en cuatro tramos (ADR-135). Lo más
   * viejo primero: es la lista con la que se decide una liquidación.
   */
  antiguedad(storeId: string, consulta: ConsultaAntiguedad): Promise<PaginaAntiguedad>;
  /**
   * Cuelga una foto de un producto, **al final** de las que tenga. No pasa por
   * `guardar` a propósito: ése reescribe todos los medios del producto, y una
   * foto sacada desde el teléfono no tiene por qué conocer las demás.
   */
  agregarFoto(tenantId: string, storeId: string, productId: string, foto: FotoNueva): Promise<void>;
  /**
   * La primera foto de cada producto pedido, para mandarla a limpiar. Se
   * resuelve en el servidor: la lista de la tabla no trae las fotos de todos los
   * productos seleccionados.
   */
  fotosParaLimpiar(
    storeId: string,
    productIds: readonly string[],
  ): Promise<readonly FotoParaLimpiar[]>;
  /** Guarda lo que devolvió la IA como propuesta pendiente (ADR-130). */
  proponerFoto(
    tenantId: string,
    storeId: string,
    productId: string,
    urls: { readonly original: string; readonly propuesta: string },
  ): Promise<void>;
  /** Lo que espera revisión, lo último primero. */
  propuestasPendientes(
    storeId: string,
    page: number,
    perPage?: number,
  ): Promise<PaginaDePropuestas>;
  /** Publica las fotos aprobadas. Devuelve cuántas se aplicaron. */
  aprobarPropuestas(storeId: string, ids: readonly string[]): Promise<number>;
  /** Descarta propuestas sin tocar la foto publicada. */
  rechazarPropuestas(storeId: string, ids: readonly string[]): Promise<void>;

  /** La cola de productos sin descripción, primero los que tienen stock. */
  sinDescripcion(storeId: string, page: number, perPage?: number): Promise<PaginaSinDescripcion>;
  /** Lo que la IA mira para escribir: ficha, variantes y fotos. */
  productosParaDescribir(
    storeId: string,
    productIds: readonly string[],
  ): Promise<readonly ProductoParaDescribir[]>;
  proponerDescripcion(
    tenantId: string,
    storeId: string,
    productId: string,
    texto: string,
  ): Promise<void>;
  descripcionesPendientes(
    storeId: string,
    page: number,
    perPage?: number,
  ): Promise<PaginaDeDescripciones>;
  /** Devuelve cuántas se escribieron: las que administra el ERP no se pisan. */
  aprobarDescripciones(storeId: string, ids: readonly string[]): Promise<number>;
  rechazarDescripciones(storeId: string, ids: readonly string[]): Promise<void>;
  /**
   * Importa un lote. Cada producto es atómico por separado, así que el reporte
   * puede traer éxitos y fallos a la vez.
   */
  importar(
    storeId: string,
    productos: readonly ProductoEditable[],
  ): Promise<readonly ResultadoImport[]>;
}

/** Qué pasó con un producto del archivo. */
export interface ResultadoImport {
  readonly indice: number;
  readonly handle: string;
  readonly ok: boolean;
  readonly accion: 'creado' | 'actualizado' | 'rechazado';
  readonly id?: string;
  readonly error?: string;
}

/**
 * Handle a partir del título.
 *
 * Quita los acentos antes de descartar lo que no sea alfanumérico: sin eso
 * "Campera técnica" daría `campera-t-cnica`, con un hueco donde estaba la í.
 */
export function slugify(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Etiqueta legible de un estado, para la tabla y el selector. */
export const ETIQUETA_ESTADO: Readonly<Record<ProductStatus, string>> = {
  draft: 'Borrador',
  active: 'Publicado',
  inactive: 'Pausado',
  archived: 'Archivado',
};
