import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { repositorioAdminPedidos } from '@pick/adapter-supabase';
import {
  ESTADOS_DE_PEDIDO,
  ETIQUETA_ESTADO_PAGO,
  ETIQUETA_ESTADO_PEDIDO,
  describirEvento,
  formatMoney,
  puedeTransicionar,
} from '@pick/commerce-core';
import type { OrderStatus, PaymentStatus } from '@pick/commerce-types';
import { ReceiptTextIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Esqueleto,
  EstadoDeError,
  EstadoVacio,
  PaginaAdmin,
  Tarjeta,
  TituloDeTarjeta,
} from '@/components/pagina';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DialogoDeConfirmacion } from '@/components/acciones';
import { usePuede } from '@/features/auth/usePuede';
import { avisarStorefront } from '@/lib/notificaciones';
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

  /**
   * Lo que sigue a cualquier cambio del pedido.
   *
   * Además de refrescar la pantalla, le avisa al storefront: el cambio pudo
   * encolar un correo —pago confirmado, enviado, entregado— y quien lo manda es
   * él, que es donde están la clave de Resend y las plantillas.
   */
  function trasCambiar(): Promise<void> {
    setNota('');
    avisarStorefront(tienda.domain);
    void cliente.invalidateQueries({ queryKey: ['pedidos', tienda.id] });
    return cliente.invalidateQueries({ queryKey: ['pedido', tienda.id, id] });
  }

  const cambiarPago = useMutation({
    mutationFn: (pago: PaymentStatus) =>
      repositorioAdminPedidos(db).cambiarPago(tienda.id, id, pago, nota || undefined),
    onSuccess: trasCambiar,
  });

  const [porCancelar, setPorCancelar] = useState(false);

  const cambiarEstado = useMutation({
    mutationFn: (estado: OrderStatus) =>
      repositorioAdminPedidos(db).cambiarEstado(tienda.id, id, estado, nota || undefined),
    onSuccess: trasCambiar,
  });

  if (consulta.isPending) {
    return (
      <PaginaAdmin titulo="Pedido" icono={ReceiptTextIcon}>
        <Tarjeta sinRelleno>
          <Esqueleto />
        </Tarjeta>
      </PaginaAdmin>
    );
  }

  if (consulta.isError) {
    return (
      <PaginaAdmin titulo="Pedido" icono={ReceiptTextIcon}>
        <Tarjeta sinRelleno>
          <EstadoDeError
            titulo="No se pudo cargar el pedido"
            error={consulta.error as Error}
            onReintentar={() => void consulta.refetch()}
          />
        </Tarjeta>
      </PaginaAdmin>
    );
  }

  if (!consulta.data) {
    return (
      <PaginaAdmin titulo="Pedido" icono={ReceiptTextIcon}>
        <Tarjeta sinRelleno>
          <EstadoVacio
            titulo="Este pedido no existe en esta tienda"
            accion={
              <Link to="/pedidos" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
                Volver a pedidos
              </Link>
            }
          >
            Puede haberse borrado, o pertenecer a otra tienda de la organización.
          </EstadoVacio>
        </Tarjeta>
      </PaginaAdmin>
    );
  }

  const { order, events } = consulta.data;
  const terminal = order.status === 'cancelled';

  return (
    <PaginaAdmin
      titulo={`#${order.number}`}
      icono={ReceiptTextIcon}
      descripcion={fecha(order.createdAt, tienda.locale)}
      insignias={
        <>
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
            {ETIQUETA_ESTADO_PAGO[order.paymentStatus]}
          </Badge>
        </>
      }
    >
      {(cambiarEstado.isError || cambiarPago.isError) && (
        <p className="text-destructive text-sm" role="alert">
          {((cambiarEstado.error ?? cambiarPago.error) as Error).message}
        </p>
      )}

      {/*
        Dos columnas: a la izquierda lo que se compró y qué pasó con el pedido, a
        la derecha con quién y qué se puede hacer. Es la distribución del detalle
        de pedido de Shopify, y sostiene la lectura: el contenido del pedido se
        mira de arriba abajo sin saltar a la barra lateral.
      */}
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-5">
          <Tarjeta sinRelleno>
            <TituloDeTarjeta>Ítems</TituloDeTarjeta>
            <ul className="divide-border divide-y">
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
              <li className="bg-muted/40 flex justify-between gap-4 p-4 text-sm font-medium">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(order.total, tienda.locale)}</span>
              </li>
            </ul>
          </Tarjeta>

          <Tarjeta sinRelleno>
            <TituloDeTarjeta>Historial</TituloDeTarjeta>
            <ol className="divide-border divide-y">
              {events.map((e) => (
                <li key={e.id} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                  <span>{describirEvento(e)}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {fecha(e.createdAt, tienda.locale)}
                  </span>
                </li>
              ))}
            </ol>
          </Tarjeta>
        </div>

        <aside className="flex flex-col gap-5">
          <Tarjeta sinRelleno>
            <TituloDeTarjeta>Cliente</TituloDeTarjeta>
            <div className="flex flex-col gap-1 p-4 text-sm">
              <p className="font-medium">{order.customer.name}</p>
              <a
                href={`mailto:${order.customer.email}`}
                className="text-muted-foreground underline"
              >
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
            </div>
          </Tarjeta>

          <Tarjeta sinRelleno>
            <TituloDeTarjeta>Entrega</TituloDeTarjeta>
            <div className="text-muted-foreground flex flex-col gap-1 p-4 text-sm">
              <p>{order.address.street}</p>
              <p>{order.address.city}</p>
              {order.address.reference ? (
                <p className="text-xs">{order.address.reference}</p>
              ) : null}
            </div>
          </Tarjeta>

          {order.notes ? (
            <Tarjeta sinRelleno>
              <TituloDeTarjeta>Nota del cliente</TituloDeTarjeta>
              <p className="text-muted-foreground p-4 text-sm whitespace-pre-line">{order.notes}</p>
            </Tarjeta>
          ) : null}

          {!escribe ? (
            <Tarjeta>
              <p className="text-muted-foreground text-sm">
                Tu rol no permite cambiar el estado de los pedidos.
              </p>
            </Tarjeta>
          ) : terminal ? (
            <Tarjeta>
              <p className="text-muted-foreground text-sm">
                El pedido está cancelado y su stock volvió al inventario.
              </p>
            </Tarjeta>
          ) : (
            <Tarjeta sinRelleno>
              <TituloDeTarjeta>Cambiar estado</TituloDeTarjeta>
              <div className="flex flex-col gap-3 p-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="nota" className="text-muted-foreground text-xs">
                    Nota (opcional)
                  </Label>
                  <Input
                    id="nota"
                    value={nota}
                    onChange={(e) => setNota(e.currentTarget.value)}
                    placeholder="Queda en el historial"
                  />
                </div>

                {/*
                  El cobro va con los mismos controles que el estado y comparte la
                  nota: con transferencia bancaria, «lo marqué pagado porque mandó
                  el comprobante» es una sola acción con su explicación.
                */}
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  disabled={cambiarPago.isPending}
                  onClick={() =>
                    cambiarPago.mutate(order.paymentStatus === 'paid' ? 'pending' : 'paid')
                  }
                >
                  {order.paymentStatus === 'paid' ? 'Marcar como pendiente' : 'Marcar como pagado'}
                </Button>

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
                  onClick={() => setPorCancelar(true)}
                >
                  Cancelar pedido
                </Button>

                <DialogoDeConfirmacion
                  abierto={porCancelar}
                  onAbierto={setPorCancelar}
                  titulo={`¿Cancelar el pedido #${order.number}?`}
                  descripcion="El stock vuelve al inventario y el pedido no se puede reabrir: cancelado es un estado final."
                  confirmar="Cancelar el pedido"
                  pendiente={cambiarEstado.isPending}
                  onConfirmar={() => cambiarEstado.mutate('cancelled')}
                />
              </div>
            </Tarjeta>
          )}
        </aside>
      </div>
    </PaginaAdmin>
  );
}
