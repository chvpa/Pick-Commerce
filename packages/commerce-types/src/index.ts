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

// --- Multitenancy -----------------------------------------------------------
// Un "tenant" es una organización. Toda entidad de negocio pertenece a una y se
// protege con RLS más autorización en el servicio de dominio. Ver ADR-052.

export type MemberRole = 'owner' | 'admin' | 'staff' | 'viewer';

/**
 * Permisos del Core. Son verbos sobre capacidades, no sobre pantallas: una
 * pantalla nueva no debería exigir un permiso nuevo.
 */
export type Permission =
  | 'organization.manage'
  | 'store.manage'
  | 'member.manage'
  | 'catalog.write'
  | 'order.write'
  | 'settings.write';

export interface Organization {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

export interface Store {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly slug: string;
  /** Dominio propio del storefront. Es lo que resuelve el tenant en runtime. */
  readonly domain?: string;
  readonly currency: CurrencyCode;
  readonly locale: string;
}

export interface Location {
  readonly id: string;
  readonly tenantId: string;
  readonly storeId: string;
  readonly name: string;
  /** El ERP conserva autoridad sobre la sucursal cuando existe. Ver ADR-010. */
  readonly erpLocationId?: string;
  readonly isPickupPoint: boolean;
}

export interface Membership {
  readonly tenantId: string;
  readonly userId: string;
  readonly role: MemberRole;
}

/** Identidad resuelta de quien hace una petición al Admin o al MCP. */
export interface ActorContext {
  readonly userId: string;
  readonly tenantId: string;
  readonly role: MemberRole;
}
