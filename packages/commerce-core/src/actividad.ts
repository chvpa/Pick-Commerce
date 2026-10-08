import type { MemberRole, OrderStatus, PaymentStatus, ProductStatus } from '@pick/commerce-types';
import { formatMoney } from './money.ts';
import { ETIQUETA_ESTADO } from './admin-catalog.ts';
import { ETIQUETA_ESTADO_PAGO, ETIQUETA_ESTADO_PEDIDO } from './orders.ts';

/**
 * Una fila del registro de actividad, dicha como la lee una persona (ADR-158,
 * ADR-159): «cambió el precio», «Gs. 150.000 → Gs. 175.000».
 *
 * Pura y en el core porque la usan la franja del pedido y del producto y la
 * pantalla del registro: dos traducciones del mismo campo que no coinciden son
 * peores que ninguna.
 */

export interface EntradaDeActividad {
  readonly id: number;
  readonly at: string;
  /** El nombre o el correo. Ausente si la persona se borró. */
  readonly actor?: string;
  readonly role?: MemberRole;
  /** `insert`, `update`, `delete`, o una acción explícita como `currency.rate_updated`. */
  readonly action: string;
  readonly entity: string;
  readonly changes?: Readonly<Record<string, readonly [unknown, unknown]>>;
  readonly sensitive?: boolean;
  /** El título, el SKU o el número de lo que cambió. */
  readonly label?: string;
}

export interface HistorialDeActividad {
  readonly total: number;
  readonly items: readonly EntradaDeActividad[];
}

export interface CambioLegible {
  readonly campo: string;
  readonly antes: string;
  readonly despues: string;
}

const DINERO = new Set([
  'price',
  'compare_at_price',
  'cost',
  'total_amount',
  'subtotal_amount',
  'discount_amount',
  'shipping_amount',
]);

const CAMPOS: Readonly<Record<string, string>> = {
  title: 'Título',
  description: 'Descripción',
  brand: 'Marca',
  category_id: 'Categoría',
  product_group_id: 'Modelo',
  status: 'Estado',
  handle: 'Dirección',
  sku: 'SKU',
  barcode: 'Código de barras',
  internal_code: 'Código interno',
  weight_grams: 'Peso',
  position: 'Orden',
  attributes: 'Atributos',
  price: 'Precio',
  compare_at_price: 'Precio anterior',
  cost: 'Costo',
  available: 'Stock',
  payment_status: 'Pago',
  payment_method: 'Forma de pago',
  notes: 'Nota',
  address: 'Dirección de entrega',
  customer: 'Cliente',
  total_amount: 'Total',
  subtotal_amount: 'Subtotal',
  discount_amount: 'Descuento',
  shipping_amount: 'Envío',
};

function etiquetaDeEstado(entity: string, valor: string): string {
  if (entity === 'orders') return ETIQUETA_ESTADO_PEDIDO[valor as OrderStatus] ?? valor;
  return ETIQUETA_ESTADO[valor as ProductStatus] ?? valor;
}

function valorLegible(
  entity: string,
  campo: string,
  valor: unknown,
  ctx: { readonly currency: string; readonly locale: string },
): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (DINERO.has(campo) && typeof valor === 'number') {
    return formatMoney({ amount: valor, currency: ctx.currency as 'PYG' }, ctx.locale);
  }
  if (campo === 'status' && typeof valor === 'string') return etiquetaDeEstado(entity, valor);
  if (campo === 'payment_status' && typeof valor === 'string') {
    return ETIQUETA_ESTADO_PAGO[valor as PaymentStatus] ?? valor;
  }
  // Un id no le dice nada a nadie: que cambió alcanza.
  if (campo.endsWith('_id')) return 'otra';
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (typeof valor === 'object') {
    const texto = Array.isArray(valor)
      ? valor.join(', ')
      : Object.entries(valor as Record<string, unknown>)
          .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
          .join(', ');
    return recortar(texto || '—');
  }
  return recortar(String(valor));
}

function recortar(texto: string): string {
  return texto.length > 80 ? `${texto.slice(0, 79)}…` : texto;
}

/** Cada campo que cambió, en el orden en que la fila los trae. */
export function cambiosLegibles(
  e: EntradaDeActividad,
  ctx: { readonly currency: string; readonly locale: string },
): CambioLegible[] {
  return Object.entries(e.changes ?? {}).map(([campo, [antes, despues]]) => ({
    campo: CAMPOS[campo] ?? campo,
    antes: valorLegible(e.entity, campo, antes, ctx),
    despues: valorLegible(e.entity, campo, despues, ctx),
  }));
}

/** Qué hizo, en una frase que va después del nombre: «Ana cambió el precio». */
export function queHizo(e: EntradaDeActividad): string {
  const cosa = e.label ? ` «${e.label}»` : '';
  const cambios = Object.keys(e.changes ?? {});
  const soloCambio = (campo: string) => cambios.length === 1 && cambios[0] === campo;

  switch (e.entity) {
    case 'orders':
      if (e.action === 'insert') return 'creó el pedido';
      if (e.action === 'delete') return 'borró el pedido';
      if (e.changes?.status?.[1] === 'cancelled') return 'anuló el pedido';
      if (e.changes?.status) return 'cambió el estado';
      if (e.changes?.payment_status) return 'cambió el pago';
      return 'editó el pedido';
    case 'products':
      if (e.action === 'insert') return 'creó el producto';
      if (e.action === 'delete') return 'borró el producto';
      if (soloCambio('status')) return 'cambió el estado';
      return 'editó el producto';
    case 'product_variants':
      if (e.action === 'insert') return `agregó la variante${cosa}`;
      if (e.action === 'delete') return `quitó la variante${cosa}`;
      if (soloCambio('price')) return `cambió el precio de${cosa || ' una variante'}`;
      return `editó la variante${cosa}`;
    case 'inventory_levels':
      return 'ajustó el stock';
    default:
      if (e.action === 'insert') return `creó ${e.entity}${cosa}`;
      if (e.action === 'delete') return `borró ${e.entity}${cosa}`;
      if (e.action === 'update') return `editó ${e.entity}${cosa}`;
      return e.action;
  }
}
