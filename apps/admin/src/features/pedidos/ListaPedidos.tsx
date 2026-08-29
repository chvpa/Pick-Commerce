import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { repositorioAdminPedidos } from '@pick/adapter-supabase';
import {
  ESTADOS_DE_PAGO,
  ESTADOS_DE_PEDIDO,
  ETIQUETA_ESTADO_PAGO,
  ETIQUETA_ESTADO_PEDIDO,
  formatMoney,
} from '@pick/commerce-core';
import type { PedidoDeLista } from '@pick/commerce-core';
import type { OrderStatus, PaymentStatus } from '@pick/commerce-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePuede } from '@/features/auth/usePuede';
import { avisarStorefront } from '@/lib/notificaciones';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { DialogoDeConfirmacion } from '@/components/acciones';
import { cn } from '@/lib/utils';

const POR_PAGINA = 20;

/**
 * Tono por estado.
 *
 * Sólo tres tonos y no ocho: el color distingue "hay algo que hacer" de "está en
 * curso" de "terminó". Ocho colores distintos no serían información, serían
 * ruido, y encima quedarían ilegibles en una tabla.
 */
const TONO: Record<OrderStatus, string> = {
  received: 'border-transparent bg-primary/10 text-primary',
  confirmed: 'border-transparent bg-primary/10 text-primary',
  preparing: 'border-transparent bg-muted text-muted-foreground',
  ready: 'border-transparent bg-muted text-muted-foreground',
  shipped: 'border-transparent bg-muted text-muted-foreground',
  in_transit: 'border-transparent bg-muted text-muted-foreground',
  delivered: 'border-transparent bg-muted text-muted-foreground',
  cancelled: 'border-transparent bg-muted text-muted-foreground line-through',
};

const TONO_PAGO: Record<PaymentStatus, string> = {
  paid: 'border-transparent bg-primary/10 text-primary',
  pending: 'border-transparent bg-muted text-muted-foreground',
  // Rechazado es lo único que pide atención: el pedido está ahí y no se cobró.
  failed: 'border-transparent bg-destructive/10 text-destructive',
};

function fecha(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ListaPedidos() {
  const tienda = useTiendaActiva();
  const cliente = useQueryClient();
  const escribe = usePuede()('order.write');

  const [texto, setTexto] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<OrderStatus | ''>('');
  /** El pedido que se está por cancelar, o `null`. Ver el `onChange` del select. */
  const [porCancelar, setPorCancelar] = useState<PedidoDeLista | null>(null);
  const [page, setPage] = useState(1);

  // La búsqueda va al servidor: sin esperar, cada tecla sería una consulta.
  useEffect(() => {
    const id = setTimeout(() => {
      setQuery(texto);
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [texto]);

  const consulta = useQuery({
    queryKey: ['pedidos', tienda.id, query, status, page],
    queryFn: () =>
      repositorioAdminPedidos(db).listar(tienda.id, {
        query,
        ...(status ? { status } : {}),
        page,
        perPage: POR_PAGINA,
      }),
    placeholderData: keepPreviousData,
  });

  const invalidar = () => {
    // El cambio pudo encolar un correo —confirmado, enviado, entregado— y el
    // storefront es quien lo manda.
    avisarStorefront(tienda.domain);
    return cliente.invalidateQueries({ queryKey: ['pedidos', tienda.id] });
  };

  const cambiarEstado = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: OrderStatus }) =>
      repositorioAdminPedidos(db).cambiarEstado(tienda.id, id, estado),
    onSuccess: invalidar,
  });

  const cambiarPago = useMutation({
    mutationFn: ({ id, pago }: { id: string; pago: PaymentStatus }) =>
      repositorioAdminPedidos(db).cambiarPago(tienda.id, id, pago),
    onSuccess: invalidar,
  });

  const datos = consulta.data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="buscar">Buscar</Label>
          <Input
            id="buscar"
            value={texto}
            onChange={(e) => setTexto(e.currentTarget.value)}
            placeholder="Número, nombre, correo o teléfono"
            className="w-72"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="estado">Estado</Label>
          <select
            id="estado"
            value={status}
            onChange={(e) => {
              setStatus(e.currentTarget.value as OrderStatus | '');
              setPage(1);
            }}
            className="border-border bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 cursor-pointer rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3"
          >
            <option value="">Todos</option>
            {ESTADOS_DE_PEDIDO.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESTADO_PEDIDO[e]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {consulta.isError ? (
        <div className="border-destructive/40 flex flex-col items-start gap-3 rounded-lg border p-6">
          <p className="text-sm">No se pudieron cargar los pedidos.</p>
          <p className="text-muted-foreground text-xs">{(consulta.error as Error).message}</p>
          <Button variant="outline" size="sm" onClick={() => void consulta.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : (
        <div className="border-border overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Ítems</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Pago</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {consulta.isPending ? (
                Array.from({ length: 5 }, (_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <div className="bg-muted h-5 w-full animate-pulse rounded" />
                    </TableCell>
                  </TableRow>
                ))
              ) : datos && datos.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center">
                    <p className="text-muted-foreground text-sm">
                      {query || status
                        ? 'Ningún pedido coincide con la búsqueda.'
                        : 'Todavía no hay pedidos.'}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                datos?.items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link
                        to="/pedidos/$id"
                        params={{ id: p.id }}
                        className="flex flex-col gap-0.5 hover:underline"
                      >
                        <span className="font-medium tabular-nums">#{p.number}</span>
                        <span className="text-muted-foreground text-xs">
                          {fecha(p.createdAt, tienda.locale)}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[16rem] truncate">{p.customerName}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.itemCount}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(
                        { amount: p.total.amount, currency: p.total.currency },
                        tienda.locale,
                      )}
                    </TableCell>
                    <TableCell>
                      {/*
                        Con transferencia bancaria, cobrar es una persona mirando
                        un comprobante, así que marcar pagado es una acción de
                        todos los días y tiene que estar en la lista. Un pedido
                        cancelado no la ofrece: devolver plata es un refund, y los
                        refunds están fuera del core (ADR-008).
                      */}
                      {!escribe || p.status === 'cancelled' ? (
                        <Badge className={cn(TONO_PAGO[p.paymentStatus])}>
                          {ETIQUETA_ESTADO_PAGO[p.paymentStatus]}
                        </Badge>
                      ) : (
                        <select
                          aria-label={`Estado de pago del pedido #${p.number}`}
                          value={p.paymentStatus}
                          disabled={cambiarPago.isPending}
                          onChange={(e) =>
                            cambiarPago.mutate({
                              id: p.id,
                              pago: e.currentTarget.value as PaymentStatus,
                            })
                          }
                          className={cn(
                            'h-7 cursor-pointer rounded-lg border px-2 text-xs outline-none',
                            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3',
                            'disabled:cursor-wait disabled:opacity-60',
                            TONO_PAGO[p.paymentStatus],
                          )}
                        >
                          {ESTADOS_DE_PAGO.map((e) => (
                            <option key={e} value={e}>
                              {ETIQUETA_ESTADO_PAGO[e]}
                            </option>
                          ))}
                        </select>
                      )}
                    </TableCell>
                    <TableCell>
                      {/*
                        Quick status: cambiar el estado sin abrir el pedido es lo
                        que hace un operador veinte veces por día. Un `<select>`
                        y no un menú propio, por lo mismo que en la otra tabla.

                        Cancelado es terminal, así que ahí se muestra la etiqueta
                        y no un control: ofrecer una acción que la base va a
                        rechazar es peor que no ofrecerla. Por eso mismo un
                        viewer ve la etiqueta y no el selector.
                      */}
                      {p.status === 'cancelled' || !escribe ? (
                        <Badge className={TONO[p.status]}>{ETIQUETA_ESTADO_PEDIDO[p.status]}</Badge>
                      ) : (
                        <select
                          aria-label={`Estado del pedido #${p.number}`}
                          value={p.status}
                          disabled={cambiarEstado.isPending}
                          onChange={(e) => {
                            const estado = e.currentTarget.value as OrderStatus;
                            if (estado === 'cancelled') {
                              /*
                               * El `<select>` ya se movió cuando esto corre, así
                               * que hay que devolverlo **antes** de preguntar: si
                               * se lo dejara en «Cancelado» mientras el diálogo
                               * está abierto, cancelar el diálogo dejaría la fila
                               * mostrando un estado que el pedido no tiene.
                               * Confirmar lo vuelve a poner con el dato de la
                               * mutación.
                               */
                              e.currentTarget.value = p.status;
                              setPorCancelar(p);
                              return;
                            }
                            cambiarEstado.mutate({ id: p.id, estado });
                          }}
                          className={cn(
                            'h-7 cursor-pointer rounded-lg border px-2 text-xs outline-none',
                            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3',
                            'disabled:cursor-wait disabled:opacity-60',
                            TONO[p.status],
                          )}
                        >
                          {ESTADOS_DE_PEDIDO.map((e) => (
                            <option key={e} value={e}>
                              {ETIQUETA_ESTADO_PEDIDO[e]}
                            </option>
                          ))}
                        </select>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {(cambiarEstado.isError || cambiarPago.isError) && (
        <p className="text-destructive text-sm" role="alert">
          {((cambiarEstado.error ?? cambiarPago.error) as Error).message}
        </p>
      )}

      {datos && datos.pageCount > 1 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {datos.total} pedidos · página {datos.page} de {datos.pageCount}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={datos.page <= 1 || consulta.isFetching}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={datos.page >= datos.pageCount || consulta.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      <DialogoDeConfirmacion
        abierto={porCancelar !== null}
        onAbierto={(abierto) => !abierto && setPorCancelar(null)}
        titulo={`¿Cancelar el pedido #${porCancelar?.number ?? ''}?`}
        descripcion="El stock vuelve al inventario y el pedido no se puede reabrir: cancelado es un estado final."
        confirmar="Cancelar el pedido"
        pendiente={cambiarEstado.isPending}
        onConfirmar={() => {
          if (porCancelar) cambiarEstado.mutate({ id: porCancelar.id, estado: 'cancelled' });
          setPorCancelar(null);
        }}
      />
    </div>
  );
}
