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

/** Una foto recién subida, lista para colgar de su producto. */
export interface FotoNueva {
  readonly url: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
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
   * Cuelga una foto de un producto, **al final** de las que tenga. No pasa por
   * `guardar` a propósito: ése reescribe todos los medios del producto, y una
   * foto sacada desde el teléfono no tiene por qué conocer las demás.
   */
  agregarFoto(tenantId: string, storeId: string, productId: string, foto: FotoNueva): Promise<void>;
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
