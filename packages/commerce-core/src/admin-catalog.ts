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
   * Cambia el estado de varios productos de una vez, para la selección múltiple.
   *
   * Desarchivar deja en `draft` y no en `active` a propósito: volver a publicar
   * es una decisión producto por producto —precio, stock, fotos— y hacerla en
   * lote para veinte devolvería al storefront cosas que se archivaron por algo.
   */
  cambiarEstadoEnLote(
    storeId: string,
    ids: readonly string[],
    status: 'archived' | 'draft',
  ): Promise<void>;
  /**
   * Productos completos, paginados. Es lo que necesita el export: el listado de
   * la tabla no trae variantes ni atributos.
   */
  completos(storeId: string, page: number, perPage: number): Promise<readonly ProductoEditable[]>;
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
