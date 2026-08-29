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
  /** Identifica el producto: todas sus variantes lo comparten. */
  readonly internalCode: string;
  /** Identifica la variante. Es la llave del cruce contra el catálogo local. */
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
  /** Segundo código del ERP, cuando exista. No se usa para cruzar. */
  readonly externalCode?: string;
}

/** Un producto del ERP con sus variantes, listo para cruzar contra el catálogo. */
export interface ERPProduct {
  readonly internalCode: string;
  readonly title: string;
  readonly family?: string;
  readonly brand?: string;
  readonly items: readonly ERPItem[];
}

export interface ERPAdapter {
  readonly id: string;
  readonly capabilities: ERPCapabilities;
  /** El catálogo entero. Con `supportsDeltaSync` en false, no hay otra forma. */
  fetchInventory(): Promise<readonly ERPItem[]>;
  /** Un producto puntual, para validar stock sin traer todo. */
  fetchItem(internalCode: string): Promise<readonly ERPItem[]>;
  healthCheck(): Promise<boolean>;
}

/**
 * Suma las unidades de las filas que hablan de la misma variante.
 *
 * Un ERP puede devolver una fila por lote o por depósito con el mismo código de
 * barras. Sin sumar, la última pisa a las anteriores y una variante con 1+2
 * queda con 1 — el bug que el sistema actual de Estilo Sport pagó en junio de
 * 2026.
 *
 * Verificado el 29/08/2026 contra las 9032 filas del ERP de Estilo Sport: hoy
 * **no** vienen repetidas. Se agrega igual, porque la alternativa es que el
 * día que el ORDS cambie de consulta el error sea silencioso y cueste dinero.
 *
 * El resto de los campos gana la primera fila: son atributos de la variante, no
 * del lote.
 */
export function agregarPorVariante(items: readonly ERPItem[]): readonly ERPItem[] {
  const porBarcode = new Map<string, ERPItem>();
  for (const item of items) {
    const previo = porBarcode.get(item.barcode);
    porBarcode.set(
      item.barcode,
      previo ? { ...previo, available: previo.available + item.available } : item,
    );
  }
  return [...porBarcode.values()];
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
  const porCodigo = new Map<string, { primera: ERPItem; variantes: ERPItem[] }>();
  for (const item of items) {
    const grupo = porCodigo.get(item.internalCode);
    if (grupo) grupo.variantes.push(item);
    else porCodigo.set(item.internalCode, { primera: item, variantes: [item] });
  }

  return [...porCodigo].map(([internalCode, { primera, variantes }]) => ({
    internalCode,
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
