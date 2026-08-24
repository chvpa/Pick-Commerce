/**
 * Contratos compartidos del Commerce Core.
 *
 * Este paquete sólo contiene tipos: no debe importar runtime ni depender de un
 * proveedor concreto. Ver PROJECT.md §8 (catálogo universal) y §33 (monedas).
 */

/** Código ISO 4217. El core no asume una moneda por defecto. */
export type CurrencyCode = string;

/**
 * Importe monetario. Se guarda en la unidad mínima de la moneda (`minorUnits`)
 * para evitar errores de punto flotante: PYG usa 0 decimales, USD usa 2.
 */
export interface Money {
  readonly amount: number;
  readonly currency: CurrencyCode;
}

/** Toda entidad de negocio pertenece explícitamente a un tenant. Ver PROJECT.md §7. */
export interface TenantScoped {
  readonly tenantId: string;
  readonly storeId: string;
}

/**
 * Origen autoritativo de un campo sincronizable. Ver PROJECT.md §10.
 * Cuando el origen es un ERP, la edición local debe bloquearse.
 */
export type FieldSource = 'COMMERCE' | 'ERP';

export type ProductStatus = 'draft' | 'active' | 'inactive' | 'archived';

export interface ProductImage {
  readonly url: string;
  /** Texto alternativo. Vacío sólo si la imagen es decorativa. */
  readonly alt: string;
  /**
   * Dimensiones del original. Son obligatorias: sin ellas no se puede reservar
   * el espacio de la imagen y el layout salta al cargar (CLS). Todo medio
   * importado desde ERP, CSV o upload debe registrarlas.
   */
  readonly width: number;
  readonly height: number;
}

export interface ProductVariant {
  readonly id: string;
  readonly sku: string;
  readonly barcode?: string;
  readonly title: string;
  readonly price: Money;
  /** Precio anterior, cuando la variante está en oferta. Sirve para mostrar el descuento. */
  readonly compareAtPrice?: Money;
  /** Coste unitario, cuando el comercio lo registra. Habilita métricas de margen. */
  readonly cost?: Money;
  /** Espejo de inventario: nunca es autoridad si el ERP posee el stock. Ver ADR-009. */
  readonly availableQuantity: number;
  readonly attributes: Readonly<Record<string, string>>;
}

export interface Product extends TenantScoped {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly description?: string;
  readonly brand?: string;
  readonly categoryId?: string;
  readonly status: ProductStatus;
  readonly images: readonly ProductImage[];
  readonly variants: readonly ProductVariant[];
  /** Agrupa productos hermanos (p. ej. mismo modelo en otro color). Ver ADR-026. */
  readonly productGroupId?: string;
}

/** Página de resultados. Toda query de dataset creciente debe paginar. Ver ADR-024. */
export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}
