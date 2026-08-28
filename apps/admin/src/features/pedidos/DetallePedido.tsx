import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { repositorioAdminPedidos } from '@pick/adapter-supabase';
import {
  ESTADOS_DE_PEDIDO,
  ETIQUETA_ESTADO_PEDIDO,
  describirEvento,
  formatMoney,
  puedeTransicionar,
} from '@pick/commerce-core';
import type { OrderStatus } from '@pick/commerce-types';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePuede } from '@/features/auth/usePuede';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { cn } from '@/lib/utils';

export interface DetallePedidoProps {
  id: string;
}

function fecha(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Un pedido, de sólo lectura salvo el estado.
 *
 * No se editan ítems, ni precios, ni cantidades: un pedido es lo que el cliente
 * pidió y a qué precio, y cambiarlo por detrás sería reescribir un hecho. Si algo
 * está mal, el camino es cancelar y rehacer. Reembolsos y notas de crédito están
 * fuera del core (ADR-008).
 */
export function DetallePedido({ id }: DetallePedidoProps) {
  const tienda = useTiendaActiva();
  const escribe = usePuede()('order.write');
  const cliente = useQueryClient();
  const [nota, setNota] = useState('');

  const consulta = useQuery({
    queryKey: ['pedido', tienda.id, id],
    queryFn: () => repositorioAdminPedidos(db).porId(tienda.id, id),
  });

  const cambiarEstado = useMutation({
    mutationFn: (estado: OrderStatus) =>
      repositorioAdminPedidos(db).cambiarEstado(tienda.id, id, estado, nota || undefined),
    onSuccess: () => {
      setNota('');
      void cliente.invalidateQueries({ queryKey: ['pedido', tienda.id, id] });
      void cliente.invalidateQueries({ queryKey: ['pedidos', tienda.id] });
    },
  });

  if (consulta.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <div className="bg-muted h-8 w-40 animate-pulse rounded" />
        <div className="bg-muted h-48 animate-pulse rounded-lg" />
      </div>
    );
  }

  if (consulta.isError) {
    return (
      <div className="border-destructive/40 flex flex-col items-start gap-3 rounded-lg border p-6">
        <p className="text-sm">No se pudo cargar el pedido.</p>
        <p className="text-muted-foreground text-xs">{(consulta.error as Error).message}</p>
        <Button variant="outline" size="sm" onClick={() => void consulta.refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (!consulta.data) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border p-6">
        <p className="text-sm">Este pedido no existe en esta tienda.</p>
        <Link to="/pedidos" className={buttonVariants({ variant: 'outline' })}>
          Volver a pedidos
        </Link>
      </div>
    );
  }

  const { order, events } = consulta.data;
  const terminal = order.status === 'cancelled';

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tabular-nums">#{order.number}</h1>
            <Badge
              className={cn(
                'border-transparent',
                terminal
                  ? 'bg-muted text-muted-foreground line-through'
                  : 'bg-primary/10 text-primary',
              )}
            >
              {ETIQUETA_ESTADO_PEDIDO[order.status]}
            </Badge>
            <Badge
              className={cn(
                'border-transparent',
                order.paymentStatus === 'paid'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {order.paymentStatus === 'paid' ? 'Pagado' : 'Pago pendiente'}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">{fecha(order.createdAt, tienda.locale)}</p>
        </div>

        <Link to="/pedidos" className={buttonVariants({ variant: 'outline' })}>
          Volver
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">Ítems</h2>
            <ul className="border-border divide-border divide-y rounded-lg border">
              {order.items.map((item, i) => (
                <li key={`${item.sku}-${i}`} className="flex justify-between gap-4 p-4 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.title}</p>
                    <p className="text-muted-foreground text-xs">
                      {item.variantTitle ? `${item.variantTitle} · ` : ''}
                      {item.sku} · {item.quantity} × {formatMoney(item.unitPrice, tienda.locale)}
                    </p>
                  </div>
                  <p className="shrink-0 tabular-nums">
                    {formatMoney(
                      {
                        amount: item.unitPrice.amount * item.quantity,
                        currency: item.unitPrice.currency,
                      },
                      tienda.locale,
                    )}
                  </p>
                </li>
              ))}
              <li className="flex justify-between gap-4 p-4 text-sm font-medium">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(order.total, tienda.locale)}</span>
              </li>
            </ul>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">Historial</h2>
            <ol className="border-border flex flex-col gap-3 rounded-lg border p-4">
              {events.map((e) => (
                <li key={e.id} className="flex justify-between gap-4 text-sm">
                  <span>{describirEvento(e)}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {fecha(e.createdAt, tienda.locale)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <section className="flex flex-col gap-1.5 text-sm">
            <h2 className="text-sm font-medium">Cliente</h2>
            <p>{order.customer.name}</p>
            <a href={`mailto:${order.customer.email}`} className="text-muted-foreground underline">
              {order.customer.email}
            </a>
            <a href={`tel:${order.customer.phone}`} className="text-muted-foreground underline">
              {order.customer.phone}
            </a>
            {order.customer.taxId ? (
              <p className="text-muted-foreground text-xs">
                RUC {order.customer.taxId}
                {order.customer.taxName ? ` · ${order.customer.taxName}` : ''}
              </p>
            ) : null}
          </section>

          <section className="flex flex-col gap-1.5 text-sm">
            <h2 className="text-sm font-medium">Entrega</h2>
            <p className="text-muted-foreground">{order.address.street}</p>
            <p className="text-muted-foreground">{order.address.city}</p>
            {order.address.reference ? (
              <p className="text-muted-foreground text-xs">{order.address.reference}</p>
            ) : null}
          </section>

          {order.notes ? (
            <section className="flex flex-col gap-1.5 text-sm">
              <h2 className="text-sm font-medium">Nota del cliente</h2>
              <p className="text-muted-foreground whitespace-pre-line">{order.notes}</p>
            </section>
          ) : null}

          {!escribe ? (
            <p className="text-muted-foreground text-sm">
              Tu rol no permite cambiar el estado de los pedidos.
            </p>
          ) : terminal ? (
            <p className="text-muted-foreground text-sm">
              El pedido está cancelado y su stock volvió al inventario.
            </p>
          ) : (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-medium">Cambiar estado</h2>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nota">Nota (opcional)</Label>
                <Input
                  id="nota"
                  value={nota}
                  onChange={(e) => setNota(e.currentTarget.value)}
                  placeholder="Queda en el historial"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {ESTADOS_DE_PEDIDO.filter(
                  (e) => e !== 'cancelled' && puedeTransicionar(order.status, e),
                ).map((estado) => (
                  <Button
                    key={estado}
                    variant="outline"
                    size="sm"
                    disabled={cambiarEstado.isPending}
                    onClick={() => cambiarEstado.mutate(estado)}
                  >
                    {ETIQUETA_ESTADO_PEDIDO[estado]}
                  </Button>
                ))}
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="text-destructive self-start"
                disabled={cambiarEstado.isPending}
                onClick={() => {
                  if (
                    confirm(`¿Cancelar el pedido #${order.number}? El stock vuelve al inventario.`)
                  )
                    cambiarEstado.mutate('cancelled');
                }}
              >
                Cancelar pedido
              </Button>
            </section>
          )}

          {cambiarEstado.isError && (
            <p className="text-destructive text-sm" role="alert">
              {(cambiarEstado.error as Error).message}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
