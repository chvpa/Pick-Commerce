import {
  aplicarAlCarrito,
  formatMoney,
  type DatosDePromocion,
  type LineaParaPromocion,
  type Promotion,
} from '@pick/commerce-core';
import type { Money } from '@pick/commerce-types';
import type { FormularioPromocion } from './esquema';

/**
 * Lo que el formulario muestra al costado: qué dice la promoción en una frase, y
 * cómo queda un carrito de ejemplo.
 *
 * El carrito **lo calcula el core**, con la misma función que es la
 * especificación del cobro (ADR-164). Una cuenta propia acá podría mostrar un
 * número que la caja después no cobra; ésta no puede, salvo que el ejemplo sea
 * distinto del carrito real. PROJECT.md §15 pide simular antes de publicar, y
 * esto es lo más barato que lo cumple.
 */

const ID = 'vista-previa';

export interface FilaDelCarrito {
  readonly etiqueta: string;
  readonly valor: string;
  /** Una línea que viene de la promoción: se pinta en verde. */
  readonly promo?: boolean;
}

export interface CarritoDeEjemplo {
  readonly filas: readonly FilaDelCarrito[];
  readonly total: string;
  /** Con este carrito no aplicó nada: casi siempre, una condición que no se cumple. */
  readonly noAplica: boolean;
}

/**
 * Un carrito que la promoción alcanza, armado con el producto de ejemplo del
 * alcance. Las cantidades son las mínimas que la hacen aplicar.
 */
export function carritoDeEjemplo(
  datos: DatosDePromocion,
  ejemplo: { readonly title: string; readonly price: Money } | undefined,
  nombreDelRegalo: string,
  locale: string,
): CarritoDeEjemplo {
  const precio = ejemplo?.price ?? { amount: 100_000, currency: 'PYG' };
  const titulo = ejemplo?.title ?? 'Producto de ejemplo';
  const r = datos.rules ?? {};
  const dinero = (n: number) => formatMoney({ amount: n, currency: precio.currency }, locale);

  // El producto del ejemplo cae dentro del alcance: el ejemplo sale de ahí.
  const t = datos.target;
  const producto = {
    productId: t.kind === 'product' ? (t.ids[0] ?? 'p') : 'p',
    ...(t.kind === 'category' && t.ids[0] ? { categoryId: t.ids[0] } : {}),
    collectionIds: t.kind === 'collection' ? [...t.ids] : [],
  };

  const paraElMinimo = Math.ceil((datos.minSubtotal ?? 0) / Math.max(precio.amount, 1));
  let cantidad = Math.max(1, datos.minQuantity ?? 0, paraElMinimo);
  let distintos = 1;
  switch (datos.kind) {
    case 'buy_x_pay_y':
      cantidad = Math.max(cantidad, r.buy ?? 1);
      break;
    case 'second_unit':
      cantidad = Math.max(cantidad, 2);
      break;
    case 'quantity':
      cantidad = Math.max(cantidad, ...(r.tiers ?? []).map((x) => x.minQuantity ?? 1));
      break;
    case 'tiered': {
      // Lo justo para caer en el último escalón.
      const topes = (r.tiers ?? []).map((x) => x.upTo ?? 0);
      cantidad = Math.min(20, Math.floor(Math.max(0, ...topes) / Math.max(precio.amount, 1)) + 1);
      break;
    }
    case 'gift':
      cantidad = Math.max(cantidad, r.buy ?? 1);
      break;
    case 'bundle':
      distintos = Math.max(2, r.count ?? 2);
      cantidad = 1;
      break;
  }

  const lineas: LineaParaPromocion[] = Array.from({ length: distintos }, (_, i) => ({
    ...producto,
    productId: distintos > 1 ? `${producto.productId}-${i}` : producto.productId,
    variantId: `v-${i}`,
    listUnitPrice: precio,
    quantity: cantidad,
  }));

  const promo: Promotion = {
    ...datos,
    id: ID,
    status: 'active',
    usageCount: 0,
    // La vigencia no se simula: el ejemplo responde «qué hace», no «cuándo».
    startsAt: undefined,
    endsAt: undefined,
    usageLimit: undefined,
  };
  const resultado = aplicarAlCarrito(lineas, [promo], new Date(), datos.code, {
    ...(r.zones?.[0] ? { zona: r.zones[0] } : {}),
    ...(r.giftVariantId ? { stockDeRegalos: { [r.giftVariantId]: r.giftQuantity ?? 1 } } : {}),
  });

  const etiqueta = datos.code ?? datos.title ?? 'Promoción';
  const filas: FilaDelCarrito[] =
    distintos > 1
      ? [
          {
            etiqueta: `${distintos} productos distintos`,
            valor: dinero(resultado.subtotal.amount),
          },
        ]
      : [{ etiqueta: `${cantidad} × ${titulo}`, valor: dinero(resultado.subtotal.amount) }];

  for (const a of resultado.applied) {
    if (a.amount.amount > 0) {
      filas.push({ etiqueta, valor: `− ${dinero(a.amount.amount)}`, promo: true });
    }
  }
  for (const g of resultado.gifts) {
    filas.push({
      etiqueta: `${g.quantity} × ${nombreDelRegalo || 'Regalo'} · regalo`,
      valor: 'Gratis',
      promo: true,
    });
  }
  if (resultado.freeShipping) filas.push({ etiqueta: 'Envío', valor: 'Gratis', promo: true });

  return { filas, total: dinero(resultado.total.amount), noAplica: resultado.applied.length === 0 };
}

/** «…» en lo que todavía no se escribió, como el handoff. */
function o(s: string): string {
  return s.trim() || '…';
}

/**
 * La promoción en una frase, mientras se escribe. Sale de los valores crudos del
 * formulario, no de los validados: tiene que acompañar cada tecla, también
 * cuando todavía falta algo.
 */
export function resumen(
  v: FormularioPromocion,
  nombres: {
    readonly alcance: string;
    readonly coleccion?: string;
    readonly moneda: string;
    readonly locale: string;
  },
): string {
  const dinero = (s: string) => {
    const n = Number(s.replace(/\D/g, ''));
    return n > 0 ? formatMoney({ amount: n, currency: nombres.moneda }, nombres.locale) : '…';
  };
  const regalo = `${o(v.cantidadDeRegalo)} × ${v.nombreDelRegalo || '…'}`;

  const tipo = (() => {
    switch (v.kind) {
      case 'discount':
        return `${v.discountType === 'percentage' ? `${o(v.discountValue)} %` : dinero(v.discountValue)} de descuento ${nombres.alcance}`;
      case 'buy_x_pay_y':
        return `Llevá ${o(v.lleva)}, pagá ${o(v.paga)} ${nombres.alcance}`;
      case 'second_unit':
        return `La segunda unidad con ${o(v.segunda)} % de descuento ${nombres.alcance}`;
      case 'quantity':
        return (
          `Descuento por cantidad ${nombres.alcance}: ` +
          v.escalonesDeCantidad
            .map((e) => `desde ${o(e.desde)} unidades, ${o(e.porcentaje)} %`)
            .join('; ') +
          (v.mezclar
            ? '. Se pueden combinar productos distintos; el más caro se cobra completo'
            : '. Unidades del mismo producto')
        );
      case 'tiered':
        return (
          `Descuento según el total ${nombres.alcance}: ` +
          v.escalonesDeMonto
            .map((e, i, todos) => {
              const desde = i > 0 ? todos[i - 1]!.hasta : '';
              if (i === todos.length - 1) return `más de ${dinero(desde)}, ${o(e.porcentaje)} %`;
              return `${i > 0 ? `de ${dinero(desde)} a` : 'hasta'} ${dinero(e.hasta)}, ${o(e.porcentaje)} %`;
            })
            .join('; ')
        );
      case 'gift':
        return `Comprando ${o(v.compra)} ${nombres.alcance}, se lleva ${regalo} de regalo`;
      case 'bundle': {
        const beneficio = {
          percent: `${o(v.valorDelBundle)} % en todos`,
          fixed: `${dinero(v.valorDelBundle)} menos en cada uno`,
          free_shipping: 'envío gratis',
          gift: `${regalo} de regalo`,
        }[v.beneficio];
        return `Agregando ${o(v.productosDelBundle)} productos distintos de ${nombres.coleccion ?? '…'}: ${beneficio}`;
      }
      case 'free_shipping':
        return `Envío gratis a ${v.todasLasZonas ? 'todo el país' : v.zonas.join(', ') || 'ninguna zona'}${
          v.minSubtotal.trim() ? ` en compras desde ${dinero(v.minSubtotal)}` : ''
        }`;
    }
  })();

  const como =
    v.modo === 'codigo'
      ? v.code.trim()
        ? `con el código ${v.code.trim().toUpperCase()}`
        : 'con un código'
      : 'automático en el carrito';

  let frase = `${tipo}, ${como}.`;
  if (v.minSubtotal.trim() && v.kind !== 'free_shipping' && v.kind !== 'tiered') {
    frase += ` Compra mínima ${dinero(v.minSubtotal)}.`;
  }
  if (v.usageLimit.trim()) frase += ` Máximo ${v.usageLimit.trim()} usos.`;
  frase += v.stackable ? ' Se suma a otras promociones.' : ' No se suma a otras promociones.';
  return frase;
}
