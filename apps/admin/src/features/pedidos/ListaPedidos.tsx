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
import { ReceiptTextIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  BarraDeFiltros,
  Esqueleto,
  EstadoDeError,
  EstadoVacio,
  Paginacion,
  PaginaAdmin,
  SELECT,
  Tarjeta,
} from '@/components/pagina';
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
 * El desplegable de estado que va **dentro** de una celda.
 *
 * Más chico que el `SELECT` de los filtros y sin fondo propio: lo pinta el tono
 * del estado, que es lo que lo hace legible de un vistazo en una tabla larga. La
 * clase estaba escrita dos veces, una por columna.
 */
const SELECT_DE_ESTADO =
  'h-7 cursor-pointer rounded-lg border px-2 text-xs outline-none ' +
  'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3 ' +
  'disabled:cursor-wait disabled:opacity-60';

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
    <PaginaAdmin
      titulo="Pedidos"
      icono={ReceiptTextIcon}
      descripcion="Lo que se vendió. El pago y el estado se cambian sin abrir el pedido."
    >
      {(cambiarEstado.isError || cambiarPago.isError) && (
        <p className="text-destructive text-sm" role="alert">
          {((cambiarEstado.error ?? cambiarPago.error) as Error).message}
        </p>
      )}

      <Tarjeta sinRelleno>
        <BarraDeFiltros>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="buscar" className="text-muted-foreground text-xs">
              Buscar
            </Label>
            <Input
              id="buscar"
              value={texto}
              onChange={(e) => setTexto(e.currentTarget.value)}
              placeholder="Número, nombre, correo o teléfono"
              className="h-8 w-72"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="estado" className="text-muted-foreground text-xs">
              Estado
            </Label>
            <select
              id="estado"
              value={status}
              onChange={(e) => {
                setStatus(e.currentTarget.value as OrderStatus | '');
                setPage(1);
              }}
              className={SELECT}
            >
              <option value="">Todos</option>
              {ESTADOS_DE_PEDIDO.map((e) => (
                <option key={e} value={e}>
                  {ETIQUETA_ESTADO_PEDIDO[e]}
                </option>
              ))}
            </select>
          </div>
        </BarraDeFiltros>

        {consulta.isError ? (
          <EstadoDeError
            titulo="No se pudieron cargar los pedidos"
            error={consulta.error as Error}
            onReintentar={() => void consulta.refetch()}
          />
        ) : (
          <div className="overflow-x-auto">
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
                  <TableRow>
                    <TableCell colSpan={6} className="p-0">
                      <Esqueleto />
                    </TableCell>
                  </TableRow>
                ) : datos && datos.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="p-0">
                      <EstadoVacio
                        titulo={
                          query || status ? 'Ningún pedido coincide' : 'Todavía no hay pedidos'
                        }
                      >
                        {query || status
                          ? 'Probá con otro número, otro nombre, o sacá el filtro de estado.'
                          : 'Los pedidos aparecen acá apenas alguien termina de comprar en la tienda.'}
                      </EstadoVacio>
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
                            className={cn(SELECT_DE_ESTADO, TONO_PAGO[p.paymentStatus])}
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
                          <Badge className={TONO[p.status]}>
                            {ETIQUETA_ESTADO_PEDIDO[p.status]}
                          </Badge>
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
                            className={cn(SELECT_DE_ESTADO, TONO[p.status])}
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

        {datos && (
          <Paginacion
            datos={datos}
            sustantivo="pedidos"
            cargando={consulta.isFetching}
            onPagina={setPage}
          />
        )}
      </Tarjeta>

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
    </PaginaAdmin>
  );
}
