import { useEffect, useState } from 'preact/hooks';
import { formatMoney } from '@pick/commerce-core';
import type { Order } from '@pick/commerce-types';
import { cn } from '../lib/cn.ts';
import { buttonVariants } from '../recipes/button.ts';

export interface OrderConfirmationProps {
  /** Instrucciones de pago de la tienda, resueltas en el servidor. */
  instrucciones?: string;
  /** Cómo volvió el comprador de la pasarela, si pasó por una. */
  resultadoDePago?: 'aprobado' | 'rechazado';
  locale?: string;
  catalogHref?: string;
  className?: string;
}

/**
 * Confirmación del pedido.
 *
 * Lee el pedido de `sessionStorage`, donde lo dejó el checkout. No hay un
 * endpoint público para consultar un pedido por su número, y no es un olvido:
 * la numeración es secuencial por tienda, así que cualquiera podría recorrer los
 * pedidos del comercio. Cuando exista "ver mi pedido" será con un token propio.
 *
 * Entrar directo, o volver acá al día siguiente, muestra el estado vacío: el
 * pedido existe igual, esta pantalla es el acuse.
 */
export function OrderConfirmation({
  instrucciones,
  resultadoDePago,
  locale,
  catalogHref = '/catalogo',
  className,
}: OrderConfirmationProps) {
  const [order, setOrder] = useState<Order | null | undefined>(undefined);

  useEffect(() => {
    // Se lee al montar y no en el render: el HTML de esta página es estático y
    // leer storage durante el render produciría un mismatch de hidratación.
    try {
      const crudo = globalThis.sessionStorage?.getItem('pick:last-order');
      setOrder(crudo ? (JSON.parse(crudo) as Order) : null);
    } catch {
      setOrder(null);
    }
  }, []);

  if (order === undefined) {
    return <div class="h-40 animate-pulse rounded-md bg-surface-muted" aria-busy="true" />;
  }

  if (order === null) {
    return (
      <div class="flex flex-col items-center gap-4 py-12 text-center">
        <p class="text-sm text-fg-muted">
          No encontramos un pedido reciente en este navegador. Si acabás de comprar, revisá tu
          correo.
        </p>
        <a href={catalogHref} class={buttonVariants({ variant: 'secondary' })}>
          Volver al catálogo
        </a>
      </div>
    );
  }

  return (
    <div class={cn('flex flex-col gap-8', className)}>
      {resultadoDePago === 'aprobado' ? (
        <p class="rounded-md border border-border bg-surface-muted px-4 py-3 text-sm" role="status">
          <strong class="font-medium">Pago aprobado.</strong> Ya estamos preparando tu pedido.
        </p>
      ) : null}

      {resultadoDePago === 'rechazado' ? (
        /*
         * El pedido existe y su stock está descontado: no se ofrece reintentar
         * acá porque el carrito ya se vació y la clave de idempotencia se perdió
         * al navegar, así que un reintento crearía un **segundo** pedido. Lo
         * honesto es decir que quedó registrado y que el comercio se contacta.
         */
        <p class="rounded-md border border-border bg-surface-muted px-4 py-3 text-sm" role="alert">
          <strong class="font-medium">El pago fue rechazado.</strong> Tu pedido quedó registrado y
          el comercio se va a contactar para coordinarlo por otro medio.
        </p>
      ) : null}

      <div class="flex flex-col gap-2">
        <p class="text-sm text-fg-muted">Recibimos tu pedido</p>
        <p class="font-display text-3xl font-semibold tracking-tight tabular-nums">
          #{order.number}
        </p>
        <p class="text-sm text-fg-muted">
          Te escribimos a <strong class="font-medium text-fg">{order.customer.email}</strong> cuando
          lo confirmemos.
        </p>
      </div>

      {instrucciones && order.paymentMethod === 'bank_transfer' ? (
        <section class="flex flex-col gap-2 rounded-md border border-border bg-surface-muted p-5">
          <h2 class="text-sm font-medium">Cómo pagar</h2>
          <p class="text-sm whitespace-pre-line text-fg-muted">{instrucciones}</p>
          <p class="text-xs text-fg-subtle">
            Indicá el número <strong class="font-medium">#{order.number}</strong> al enviar el
            comprobante.
          </p>
        </section>
      ) : null}

      <section class="flex flex-col gap-3">
        <h2 class="text-sm font-medium">Lo que pediste</h2>
        <ul class="flex flex-col gap-3">
          {order.items.map((item) => (
            <li key={item.sku} class="flex justify-between gap-3 text-sm">
              <span class="min-w-0">
                <span class="block truncate">{item.title}</span>
                <span class="text-fg-subtle">
                  {item.variantTitle ? `${item.variantTitle} · ` : ''}
                  {item.quantity} × {formatMoney(item.unitPrice, locale)}
                </span>
              </span>
              <span class="shrink-0 tabular-nums">
                {formatMoney(
                  {
                    amount: item.unitPrice.amount * item.quantity,
                    currency: item.unitPrice.currency,
                  },
                  locale,
                )}
              </span>
            </li>
          ))}
        </ul>
        <div class="flex justify-between border-t border-border pt-3 text-sm font-medium">
          <span>Total</span>
          <span class="tabular-nums">{formatMoney(order.total, locale)}</span>
        </div>
      </section>

      <section class="flex flex-col gap-1 text-sm text-fg-muted">
        <h2 class="text-sm font-medium text-fg">Entrega</h2>
        <p>{order.address.street}</p>
        <p>{order.address.city}</p>
        {order.address.reference ? <p class="text-fg-subtle">{order.address.reference}</p> : null}
      </section>

      <a href={catalogHref} class={buttonVariants({ variant: 'secondary' })}>
        Seguir comprando
      </a>
    </div>
  );
}
