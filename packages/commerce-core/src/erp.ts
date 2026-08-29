import type { Money } from '@pick/commerce-types';

/**
 * El puerto del ERP (PROJECT.md §10 y §12, ADR-009).
 *
 * Lo que vive acá es lo que **todo** ERP tiene: una forma normalizada de fila,
 * la agregación por variante y la declaración de capacidades. Lo que no vive
 * acá es cómo cada ERP deforma sus datos —el ancho fijo de un campo, un JSON
 * doble-codificado, una talla sin punto decimal—: eso es del adapter, y
 * subirlo al core sería convertir la rareza de un proveedor en una regla
 * universal a partir de una sola muestra.
 */

/**
 * Lo que el adapter promete, declarado y no supuesto.
 *
 * Existe porque la alternativa es que el checkout adivine. Un ERP sin reservas
 * no puede prometer cero overselling (PROJECT.md §12), y el único lugar honesto
 * para decirlo es el adapter que sabe con qué está hablando.
 */
export interface ERPCapabilities {
  /** Puede retener stock antes de cobrar. Sin esto: validar → cobrar → empujar. */
  readonly supportsReservations: boolean;
  /** Puede devolver sólo lo que cambió desde una fecha. Sin esto, cada sync trae todo. */
  readonly supportsDeltaSync: boolean;
  /** Avisa cuando algo cambia. Sin esto, la única forma de enterarse es preguntar. */
  readonly supportsWebhooks: boolean;
  /** Dice en qué depósito está cada unidad. Sin esto, el stock es un solo número. */
  readonly supportsLocationBreakdown: boolean;
  /** Se le puede preguntar por un artículo puntual, para validar al agregar al carrito. */
  readonly supportsLiveStock: boolean;
  /** Acepta que se le cargue un pedido. */
  readonly supportsOrderPush: boolean;
}

/**
 * Una fila del ERP ya normalizada: una variante vendible.
 *
 * `available` es lo que el ERP dice, **sin recortar**. Un negativo es un
 * descuadre real del comercio y esconderlo acá lo volvería invisible en todas
 * las lecturas de arriba — que es justamente lo que el espejo quería evitar
 * (ver el comentario de `inventory_levels.available` en la migración de
 * catálogo).
 */
export interface ERPItem {
  /**
   * Código del **modelo**. Todas las variantes del mismo producto lo comparten,
   * y es lo que identifica al producto: `NK123-01`, donde `-01` suele ser el
   * color. Es el único de los tres códigos que se puede dar por estable a nivel
   * producto, así que es el que agrupa.
   */
  readonly sku: string;
  /**
   * Código del ERP del comercio. **No se puede asumir único por variante**:
   * según el ERP se repite en todo el modelo o cambia en cada talla.
   */
  readonly internalCode: string;
  /**
   * Código impreso en la caja, del proveedor. **Tampoco se puede asumir único
   * por variante**: hay modelos con un solo código para todas las tallas.
   */
  readonly barcode: string;
  readonly title: string;
  /** Talla, color o lo que distinga a esta variante, en el formato de Pick. */
  readonly size: string;
  /**
   * La misma talla en el formato nativo del ERP. Se guarda tal cual porque
   * convertir de vuelta no siempre es reversible, y un pedido con la talla mal
   * escrita se factura mal.
   */
  readonly erpSize: string;
  readonly available: number;
  readonly price: Money;
  /** Pista de categoría, cuando el ERP la tenga. */
  readonly family?: string;
  readonly brand?: string;
}

/** Un producto del ERP con sus variantes, listo para cruzar contra el catálogo. */
export interface ERPProduct {
  /** El código de modelo. Identifica al producto. */
  readonly sku: string;
  readonly title: string;
  readonly family?: string;
  readonly brand?: string;
  readonly items: readonly ERPItem[];
}

/**
 * Qué distingue a una variante dentro de su modelo.
 *
 * **No es el código de barras**, y esa fue la primera versión de esto. Un modelo
 * puede traer el mismo código impreso en todas las tallas, y agregando por
 * código de barras las cuatro tallas se fundirían en una sola con el stock
 * sumado — el catálogo quedaría con una variante y cuatro veces las unidades.
 * Lo que separa una variante de otra es la talla dentro del modelo.
 */
function claveDeVariante(item: ERPItem): string {
  return JSON.stringify([item.sku, item.erpSize]);
}

export interface Agregado {
  readonly items: readonly ERPItem[];
  /**
   * Lo que el ERP trae dos veces para la misma variante con códigos distintos.
   * No se descarta en silencio: la corrida lo registra para que alguien lo
   * corrija en el ERP, que es donde está el problema.
   */
  readonly duplicados: readonly ERPItem[];
}

export interface ERPAdapter {
  readonly id: string;
  readonly capabilities: ERPCapabilities;
  /**
   * El catálogo entero. Con `supportsDeltaSync` en false, no hay otra forma.
   *
   * Devuelve el agregado y no sólo las filas: los duplicados que el ERP trae
   * para una misma variante son un problema de carga que hay que reportar, y un
   * contrato que los descarte obliga a cada llamador a redescubrirlos.
   */
  fetchInventory(): Promise<Agregado>;
  /** Un producto puntual, para validar stock sin traer todo. */
  fetchItem(internalCode: string): Promise<Agregado>;
  healthCheck(): Promise<boolean>;
}

/**
 * Reduce las filas del ERP a una por variante vendible.
 *
 * Son dos cosas distintas y se resuelven distinto, y confundirlas cuesta plata
 * en las dos direcciones:
 *
 *   varias filas del **mismo artículo** → lotes o depósitos → se **suman**
 *   varias filas de la **misma variante** con artículos distintos → duplicado
 *                                        de carga en el ERP → **no** se suman
 *
 * El resto de los campos gana la primera fila: son atributos de la variante, no
 * del lote.
 */
export function agregarPorVariante(items: readonly ERPItem[]): Agregado {
  // La variante siempre es (modelo, talla). Agrupar por código de barras fundía
  // las tallas de un modelo que comparte uno solo.
  const grupos = new Map<string, ERPItem[]>();
  for (const item of items) {
    const clave = claveDeVariante(item);
    const grupo = grupos.get(clave);
    if (grupo) grupo.push(item);
    else grupos.set(clave, [item]);
  }

  const salida: ERPItem[] = [];
  const duplicados: ERPItem[] = [];

  for (const grupo of grupos.values()) {
    const primera = grupo[0]!;
    if (grupo.length === 1) {
      salida.push(primera);
      continue;
    }

    if (grupo.every((i) => i.barcode === primera.barcode)) {
      /*
       * Mismo artículo, varias filas: son lotes o depósitos y se **suman**. Sin
       * esto, la última pisa a las anteriores y una variante con 1+2 queda con 1
       * — el bug que Estilo Sport pagó en junio de 2026.
       */
      salida.push({
        ...primera,
        available: grupo.reduce((total, i) => total + i.available, 0),
      });
    } else {
      /*
       * Artículos **distintos** que son la misma variante: el modelo y la talla
       * cargados dos veces en el ERP con códigos diferentes. Acá **no se suma**.
       *
       * Medido sobre el catálogo real: 7 variantes vienen así, y las dos filas
       * traen *el mismo* número de unidades. Sumarlas publicaría el doble del
       * stock que existe, que es exactamente cómo se vende lo que no se tiene.
       * Los casos son de carga —`CCOB001` contra `ccob001`, `lt'005` contra
       * `lt-005`, dos EAN para la misma zapatilla— así que gana la primera y el
       * resto se devuelve para que la corrida lo reporte: el arreglo va en el
       * ERP, no acá.
       */
      salida.push(primera);
      duplicados.push(...grupo.slice(1));
    }
  }

  return { items: salida, duplicados };
}

/**
 * Si un campo alcanza para distinguir las variantes de un modelo.
 *
 * El cruce contra el catálogo local prefiere el código de barras, después el del
 * ERP y al final la talla — pero sólo puede usar los dos primeros cuando de
 * hecho discriminan. Con un código repetido en todas las tallas, cruzar por él
 * mandaría el stock de una talla a la variante de otra, y eso no se ve hasta que
 * falta mercadería.
 */
export function discrimina(items: readonly ERPItem[], campo: 'barcode' | 'internalCode'): boolean {
  const valores = items.map((i) => i[campo]).filter((v) => v !== '');
  return valores.length === items.length && new Set(valores).size === items.length;
}

/**
 * Agrupa las variantes en productos por su código interno.
 *
 * Preserva el orden de aparición: un import acotado que se queda con los
 * primeros N productos tiene que quedarse siempre con los mismos, o dos
 * corridas seguidas importan catálogos distintos.
 */
export function agruparEnProductos(items: readonly ERPItem[]): readonly ERPProduct[] {
  // Se guarda la primera aparte en vez de leer `grupo[0]`: el grupo nunca está
  // vacío, pero eso el compilador no lo sabe y la alternativa es afirmarlo.
  //
  // Agrupa por el código de **modelo** y no por el del ERP: el del ERP puede ser
  // propio de cada variante, y entonces cada talla sería un producto distinto.
  const porModelo = new Map<string, { primera: ERPItem; variantes: ERPItem[] }>();
  for (const item of items) {
    const grupo = porModelo.get(item.sku);
    if (grupo) grupo.variantes.push(item);
    else porModelo.set(item.sku, { primera: item, variantes: [item] });
  }

  return [...porModelo].map(([sku, { primera, variantes }]) => ({
    sku,
    title: primera.title,
    family: primera.family,
    brand: primera.brand,
    items: variantes,
  }));
}

/** Lo que el ERP no reporta se muestra en cero; el negativo se conserva en la base. */
export function stockVisible(available: number): number {
  return Math.max(0, available);
}

/** Cómo terminó una variante en una corrida de sincronización. */
export type ResultadoDeCruce = 'creado' | 'actualizado' | 'sin_cambios' | 'sin_match';

/**
 * El resumen de una corrida, que es lo mismo que el reporte de reconciliación:
 * en `dry_run` se calcula y no se escribe nada.
 */
export interface ResumenDeSync {
  readonly recibidos: number;
  readonly productos: number;
  readonly creados: number;
  readonly actualizados: number;
  readonly sinCambios: number;
  readonly sinMatch: number;
  readonly errores: readonly string[];
}
