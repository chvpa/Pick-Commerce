import { useEffect, useState } from 'preact/hooks';
import { formatMoney } from '@pick/commerce-core';
import type { Money } from '@pick/commerce-types';
import { cn } from '../lib/cn.ts';
import type { CartLine } from './store.ts';

/**
 * Lo que las promociones le hacen a un carrito, dicho en el carrito (ADR-164):
 * lo descontado, los regalos, el envío gratis y cuánto falta para él.
 *
 * Lo comparten el drawer y el checkout, y en los dos los números salen de
 * `/api/cart/validate`, que los toma de `cart_promotions`: la misma cuenta que
 * cobra `create_order`. Acá no se calcula nada, se muestra.
 */

export interface PromocionMostrada {
  readonly promotionId: string;
  readonly title: string;
  readonly kind?: string;
  readonly amount: Money;
}

export interface RegaloMostrado {
  readonly variantId: string;
  readonly quantity: number;
  readonly title?: string;
  readonly variantTitle?: string;
}

/** La parte de la respuesta de `/api/cart/validate` que habla de promociones. */
export interface DineroDelCarrito {
  readonly subtotal?: Money;
  readonly discount?: Money;
  readonly appliedPromotions?: readonly PromocionMostrada[];
  readonly gifts?: readonly RegaloMostrado[];
  readonly freeShipping?: boolean;
  /** El umbral de envío gratis de la tienda, si tiene. */
  readonly freeShippingFrom?: Money;
}

export function ResumenDePromociones({
  dinero,
  totalDeProductos,
  locale,
  conLineaDeEnvio = false,
  className,
}: {
  dinero: DineroDelCarrito;
  /** Lo que se paga por los productos, ya descontado: contra eso se mide el umbral. */
  totalDeProductos: Money;
  locale?: string;
  /**
   * Si quien lo usa ya muestra el envío. El checkout dice «Envío: Gratis» en su
   * renglón, y repetirlo acá serían dos frases para lo mismo.
   */
  conLineaDeEnvio?: boolean;
  /** Sin clase, `contents`: las filas quedan en el layout de quien lo usa. */
  className?: string;
}) {
  const promos = (dinero.appliedPromotions ?? []).filter((p) => p.amount.amount > 0);
  const regalos = dinero.gifts ?? [];
  const umbral = dinero.freeShippingFrom;
  const falta = umbral ? umbral.amount - totalDeProductos.amount : 0;

  return (
    <div className={cn('contents', className)}>
      {promos.map((p) => (
        <div key={p.promotionId} className="flex justify-between gap-3 text-sm text-success">
          <span className="min-w-0 truncate">{p.title}</span>
          <span className="shrink-0 tabular-nums">−{formatMoney(p.amount, locale)}</span>
        </div>
      ))}

      {regalos.map((g) => (
        <div
          key={g.variantId}
          className="flex items-center justify-between gap-3 text-sm text-success"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate">
              {`${g.quantity} × ${g.title ?? 'Regalo'}${g.variantTitle ? ` · ${g.variantTitle}` : ''}`}
            </span>
            <span className="shrink-0 rounded-sm bg-success/10 px-1.5 py-0.5 text-xs">Regalo</span>
          </span>
          <span className="shrink-0">Gratis</span>
        </div>
      ))}

      {dinero.freeShipping ? (
        conLineaDeEnvio ? null : (
          <p className="text-sm text-success">Tenés envío gratis.</p>
        )
      ) : umbral && falta > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm text-fg-muted">
            {`Te faltan ${formatMoney({ amount: falta, currency: umbral.currency }, locale)} para el envío gratis.`}
          </p>
          <div
            role="progressbar"
            aria-label="Hacia el envío gratis"
            aria-valuemin={0}
            aria-valuemax={umbral.amount}
            aria-valuenow={Math.max(0, totalDeProductos.amount)}
            className="h-1.5 overflow-hidden rounded-full bg-border"
          >
            <div
              className="h-full rounded-full bg-success"
              style={{
                width: `${Math.min(100, (totalDeProductos.amount / umbral.amount) * 100)}%`,
              }}
            />
          </div>
        </div>
      ) : umbral && !conLineaDeEnvio ? (
        <p className="text-sm text-success">Tu compra tiene envío gratis.</p>
      ) : null}
    </div>
  );
}

/** Lo que devuelve el endpoint, en lo que el drawer necesita. */
export interface ResumenDelServidor extends DineroDelCarrito {
  readonly total: Money | null;
}

/**
 * El dinero del carrito según el servidor, para el drawer.
 *
 * Se pide **sólo mientras se mira** y medio segundo después del último cambio:
 * cada «+» del selector de cantidad sería un pedido. Y **no escribe en el
 * store**: el checkout sí corrige el espejo local, y un suscriptor que escribe
 * se llama a sí mismo en bucle (ADR-115). Acá alcanza con leer.
 *
 * Si falla, devuelve `null` y el drawer muestra la suma local, como antes.
 */
export function useResumenDelServidor(
  lines: readonly CartLine[],
  activo: boolean,
): ResumenDelServidor | null {
  const [resumen, setResumen] = useState<ResumenDelServidor | null>(null);
  const clave = lines.map((l) => `${l.variantId}:${l.quantity}`).join(',');

  useEffect(() => {
    if (!activo || lines.length === 0) {
      setResumen(null);
      return;
    }
    const control = new AbortController();
    const espera = setTimeout(() => {
      fetch('/api/cart/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        }),
        signal: control.signal,
      })
        .then((r) => (r.ok ? (r.json() as Promise<ResumenDelServidor>) : null))
        .then((datos) => setResumen(datos))
        .catch(() => {
          if (!control.signal.aborted) setResumen(null);
        });
    }, 500);
    return () => {
      clearTimeout(espera);
      control.abort();
    };
    // `clave` resume las líneas: el array cambia de identidad con cada escritura.
  }, [clave, activo]);

  return resumen;
}
