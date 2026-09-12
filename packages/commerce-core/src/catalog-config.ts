/**
 * Configuración del catálogo de una tienda: `store_settings.settings.catalog`.
 *
 * Por ahora una sola decisión, y es de las que se ven: si los productos sin
 * stock se listan o no. Quien la aplica es `catalog_search`, en la base, que lee
 * la misma clave; este lector existe para que el Admin muestre y guarde el
 * valor con la misma forma y el mismo default que la función.
 */
export interface ConfiguracionDeCatalogo {
  /**
   * Listar los productos cuyas variantes están todas en cero. Por defecto no:
   * es lo que espera quien entra a comprar. Una tienda que quiera enseñar la
   * insignia de «Sin stock» —la demo— lo enciende.
   */
  readonly showOutOfStock: boolean;
  /**
   * No listar los productos sin ninguna foto. Al revés que el stock, el
   * default es mostrarlos: no tener stock es universal, no tener foto es
   * merchandising, y una ferretería vende sin foto. Una tienda de ropa lo
   * enciende.
   */
  readonly hideWithoutImage: boolean;
}

const POR_DEFECTO: ConfiguracionDeCatalogo = { showOutOfStock: false, hideWithoutImage: false };

/**
 * Lee la sección `catalog`. Ausente o mal escrita cae al default, que es
 * ocultar: el mismo lado seguro que toma la función de la base.
 */
export function configuracionDeCatalogo(settings: unknown): ConfiguracionDeCatalogo {
  const bruto = (settings as { catalog?: unknown } | null)?.catalog;
  if (!bruto || typeof bruto !== 'object') return POR_DEFECTO;
  const c = bruto as { showOutOfStock?: unknown; hideWithoutImage?: unknown };
  return {
    showOutOfStock: c.showOutOfStock === true,
    hideWithoutImage: c.hideWithoutImage === true,
  };
}
