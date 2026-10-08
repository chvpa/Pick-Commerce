import { Franja } from '@/features/actividad/Franja';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useRouterState } from '@tanstack/react-router';
import { repositorioAdminClientes, repositorioAdminPedidos } from '@pick/adapter-supabase';
import {
  ESTADOS_DE_PEDIDO,
  ETIQUETA_ESTADO_PEDIDO,
  ETIQUETA_EVENTO,
  ETIQUETA_METODO_DE_PAGO,
  INTENTOS_DE_AVISO,
  describirEvento,
  enlaceDeWhatsApp,
  formatMoney,
  type AvisoDelPedido,
  type EventoDeNotificacion,
} from '@pick/commerce-core';
import type { Order, OrderEvent, OrderStatus, PaymentStatus } from '@pick/commerce-types';
import { DialogoDeConfirmacion } from '@/components/acciones';
import { useAvisar } from '@/components/aviso';
import { TONO_DE_PEDIDO } from '@/components/estados';
import {
  AlertCircleIcon,
  ArrowRightIcon,
  BankIcon,
  CancelCircleIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClienteFielIcon,
  DeliveryTruckIcon,
  ExternalLinkIcon,
  InvoiceIcon,
  MailIcon,
  MoneyIcon,
  MoreHorizontalIcon,
  PackageIcon,
  PrinterIcon,
  QuoteIcon,
  WhatsappIcon,
} from '@/components/iconos';
import { Esqueleto, EstadoDeError, EstadoVacio, PaginaAdmin, Tarjeta } from '@/components/pagina';
import { Badge, PUNTO_DE_TONO } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { usePuede } from '@/features/auth/usePuede';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { avisarStorefront } from '@/lib/notificaciones';
import { db } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { pasosDelPedido, proximaAccion, type ClaveDeAccion } from './proxima';

export interface DetallePedidoProps {
  id: string;
}

function fecha(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Los pedidos de la lista desde la que se abrió este, si se abrió desde una. */
function useVecinos(id: string): { anterior?: string; siguiente?: string; ids?: string[] } {
  /*
   * Viajan en el estado del historial y no en la URL: son la página que se
   * estaba mirando —la pestaña, el filtro, el orden—, y en la URL serían veinte
   * ids. Sobreviven a recargar. Se validan al leerlos porque el historial no
   * tiene tipos: puede traer cualquier cosa de otra versión del Admin.
   */
  const lista = useRouterState({
    select: (s) => (s.location.state as { pedidos?: unknown }).pedidos,
  });
  if (!Array.isArray(lista) || !lista.every((x) => typeof x === 'string')) return {};
  const ids = lista as string[];
  const i = ids.indexOf(id);
  if (i < 0) return {};
  return {
    ids,
    ...(i > 0 ? { anterior: ids[i - 1] } : {}),
    ...(i < ids.length - 1 ? { siguiente: ids[i + 1] } : {}),
  };
}

/**
 * Un pedido, como lo dibuja el handoff (ADR-143, ADR-147).
 *
 * Arriba, una sola cosa para hacer según el estado y el pago, y la barra de
 * pasos. Debajo, qué se compró y a quién. El historial está plegado: se mira
 * cuando algo no cierra, no todos los días.
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
  const avisar = useAvisar();
  const vecinos = useVecinos(id);
  const [porCancelar, setPorCancelar] = useState(false);

  const consulta = useQuery({
    queryKey: ['pedido', tienda.id, id],
    queryFn: () => repositorioAdminPedidos(db).porId(tienda.id, id),
  });

  const customerId = consulta.data?.customerId;
  const ficha = useQuery({
    // La misma clave que la ficha del cliente: si ya se abrió, no se pide.
    queryKey: ['cliente', tienda.id, customerId],
    queryFn: () => repositorioAdminClientes(db).porId(tienda.id, customerId!),
    enabled: Boolean(customerId),
  });

  /**
   * Lo que sigue a cualquier cambio del pedido.
   *
   * Además de refrescar la pantalla, le avisa al storefront: el cambio pudo
   * encolar un correo —pago confirmado, enviado, entregado— y quien lo manda es
   * él, que es donde están la clave de Resend y las plantillas.
   */
  function trasCambiar(): Promise<void> {
    avisarStorefront(tienda.domain);
    void cliente.invalidateQueries({ queryKey: ['pedidos', tienda.id] });
    void cliente.invalidateQueries({ queryKey: ['tareas', tienda.id] });
    void cliente.invalidateQueries({ queryKey: ['cliente', tienda.id] });
    // La franja también: el cambio que se acaba de hacer ya está en el registro.
    void cliente.invalidateQueries({ queryKey: ['actividad', tienda.id, id] });
    return cliente.invalidateQueries({ queryKey: ['pedido', tienda.id, id] });
  }

  const cambiarPago = useMutation({
    mutationFn: (pago: PaymentStatus) =>
      repositorioAdminPedidos(db).cambiarPago(tienda.id, id, pago),
    onSuccess: (order, pago) => {
      avisar(
        pago === 'paid'
          ? `#${order.number} quedó pagado`
          : `#${order.number} vuelve a esperar el pago`,
      );
      return trasCambiar();
    },
  });

  const cambiarEstado = useMutation({
    mutationFn: (estado: OrderStatus) =>
      repositorioAdminPedidos(db).cambiarEstado(tienda.id, id, estado),
    onSuccess: (order, estado) => {
      setPorCancelar(false);
      avisar(`#${order.number} pasó a ${ETIQUETA_ESTADO_PEDIDO[estado]}`);
      return trasCambiar();
    },
  });

  if (consulta.isPending) {
    return (
      <PaginaAdmin titulo="Pedido">
        <Tarjeta sinRelleno>
          <Esqueleto />
        </Tarjeta>
      </PaginaAdmin>
    );
  }

  if (consulta.isError) {
    return (
      <PaginaAdmin titulo="Pedido">
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
      <PaginaAdmin titulo="Pedido">
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

  const { order, events, avisos, productos } = consulta.data;
  const cancelado = order.status === 'cancelled';
  const ocupado = cambiarEstado.isPending || cambiarPago.isPending;
  const error = cambiarEstado.error ?? cambiarPago.error;

  /*
   * Avisos que no salieron. Uno abandonado —agotó los intentos— no va a salir
   * nunca: hay que avisarle al comprador por otro lado, y por eso va arriba con
   * el enlace a WhatsApp.
   */
  const abandonados = avisos.filter((a) => !a.sentAt && a.attempts >= INTENTOS_DE_AVISO);
  const whatsapp = enlaceDeWhatsApp(
    order.customer.phone,
    `Hola ${order.customer.name.split(' ')[0]}, te escribimos de ${tienda.name} por tu pedido #${order.number}.`,
  );

  return (
    <PaginaAdmin
      titulo={`#${order.number}`}
      descripcion={`${order.customer.name} · ${fecha(order.createdAt, tienda.locale)} · Envío a domicilio`}
      insignias={
        /*
          Sólo si lo es. Importa cuando una tienda deja de ser demostración y se
          pone a vender: los pedidos de antes siguen ahí y nadie tiene que
          despacharlos.
        */
        order.isDemo && <Badge variant="gray">Demostración</Badge>
      }
      acciones={
        <div className="flex items-center gap-1.5 print:hidden">
          {vecinos.ids && (
            <>
              <Vecino id={vecinos.anterior} ids={vecinos.ids} etiqueta="Pedido anterior">
                <ChevronUpIcon className="size-[15px]" />
              </Vecino>
              <Vecino id={vecinos.siguiente} ids={vecinos.ids} etiqueta="Pedido siguiente">
                <ChevronDownIcon className="size-[15px]" />
              </Vecino>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Más acciones"
              className={cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'size-[34px]')}
            >
              <MoreHorizontalIcon className="size-[17px]" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onClick={() => window.print()}>
                <PrinterIcon />
                Imprimir pedido
              </DropdownMenuItem>
              {escribe && !cancelado && (
                <>
                  {/*
                    La próxima acción sólo avanza. Volver atrás —corregir un
                    «enviado» marcado por error— o saltar un paso se hace acá, de a
                    uno, como en la lista (ADR-066).
                  */}
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Pasar a</DropdownMenuLabel>
                    {ESTADOS_DE_PEDIDO.filter((e) => e !== order.status && e !== 'cancelled').map(
                      (e) => (
                        <DropdownMenuItem
                          key={e}
                          disabled={ocupado}
                          onClick={() => cambiarEstado.mutate(e)}
                        >
                          <span
                            aria-hidden="true"
                            className="size-[7px] rounded-full"
                            style={{ background: PUNTO_DE_TONO[TONO_DE_PEDIDO[e]] }}
                          />
                          {ETIQUETA_ESTADO_PEDIDO[e]}
                        </DropdownMenuItem>
                      ),
                    )}
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  {order.paymentStatus === 'paid' && (
                    <DropdownMenuItem
                      disabled={ocupado}
                      onClick={() => cambiarPago.mutate('pending')}
                    >
                      <MoneyIcon />
                      Marcar pago como pendiente
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => setPorCancelar(true)}
                    className="text-[#bf3324] focus:bg-[#fdf1f0] focus:text-[#bf3324]"
                  >
                    <CancelCircleIcon />
                    Cancelar pedido…
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      <Franja
        subjectId={order.id}
        creacion={{ por: order.customer.name || 'Quien compró', cuando: order.createdAt }}
      />
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {(error as Error).message}
        </p>
      )}

      {abandonados.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#f6d3cf] bg-[#fef5f4] px-4 py-3">
          <AlertCircleIcon className="size-[18px] text-[#d93a2b]" />
          <span className="min-w-[200px] flex-1 text-sm text-[#7a2a1f]">
            {abandonados.length === 1
              ? 'No le llegó el correo de '
              : 'No le llegaron los correos de '}
            {new Intl.ListFormat('es', { type: 'conjunction' }).format(
              abandonados.map((a) =>
                (ETIQUETA_EVENTO[a.event as EventoDeNotificacion] ?? a.event).toLowerCase(),
              ),
            )}
            : se intentó {INTENTOS_DE_AVISO} veces a {order.customer.email}.
          </span>
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[13.5px] font-medium whitespace-nowrap text-[#9b2a1d] hover:underline print:hidden"
            >
              <WhatsappIcon className="size-4" />
              Avisar por WhatsApp
            </a>
          )}
        </div>
      )}

      <ProximaAccionDelPedido
        order={order}
        escribe={escribe}
        ocupado={ocupado}
        onCobrar={() => cambiarPago.mutate('paid')}
        onAvanzar={(estado) => cambiarEstado.mutate(estado)}
      />

      <div className="flex flex-wrap items-start gap-5">
        <Tarjeta sinRelleno className="min-w-0 flex-[2_1_440px] overflow-hidden">
          <ul>
            {order.items.map((item, i) => {
              const producto = item.variantId ? productos[item.variantId] : undefined;
              return (
                <li
                  key={`${item.sku}-${i}`}
                  className="flex items-center gap-3.5 border-b border-[#f0f1f4] px-5 py-3.5"
                >
                  {producto?.imagen ? (
                    <img
                      src={producto.imagen}
                      alt=""
                      className="size-12 shrink-0 rounded-[10px] border border-[#eef0f3] object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="size-12 shrink-0 rounded-[10px] bg-[repeating-linear-gradient(135deg,#f3f4f7_0_5px,#eaecf1_5px_10px)]"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 font-medium">
                      <span className="truncate">{item.title}</span>
                      {producto && tienda.domain && (
                        <a
                          href={`https://${tienda.domain}/productos/${producto.handle}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Ver «${item.title}» en la tienda`}
                          title="Ver en la tienda"
                          className="text-ink-3 hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded-md hover:bg-[#f3f4f7] print:hidden"
                        >
                          <ExternalLinkIcon className="size-[15px]" />
                        </a>
                      )}
                    </p>
                    <p className="text-ink-3 text-[13px]">
                      {item.variantTitle ? `${item.variantTitle} · ` : ''}
                      {item.quantity} u.
                    </p>
                  </div>
                  <span className="font-medium whitespace-nowrap tabular-nums">
                    {formatMoney(
                      {
                        amount: item.unitPrice.amount * item.quantity,
                        currency: item.unitPrice.currency,
                      },
                      tienda.locale,
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 px-5 py-4">
            <span className="text-ink-3 flex-[1_1_220px] text-[13px] leading-[19px]">
              {totales(order, tienda.locale)}
            </span>
            <span className="text-lg font-semibold whitespace-nowrap tabular-nums">
              {formatMoney(order.total, tienda.locale)}
            </span>
          </div>
        </Tarjeta>

        <Tarjeta sinRelleno className="flex min-w-0 flex-[1_1_300px] flex-col">
          <div className="flex items-center gap-3 px-5 py-4">
            <Iniciales nombre={order.customer.name} customerId={customerId} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="flex flex-wrap items-center gap-1.5">
                {customerId ? (
                  <Link
                    to="/clientes/$id"
                    params={{ id: customerId }}
                    className="hover:text-link font-medium hover:underline"
                  >
                    {order.customer.name}
                  </Link>
                ) : (
                  <span className="font-medium">{order.customer.name}</span>
                )}
                {ficha.data && ficha.data.orderCount >= 3 && (
                  <span title="Cliente fiel · compró 3 veces o más" className="text-[#3b5bdb]">
                    <ClienteFielIcon className="size-4" />
                    <span className="sr-only">Cliente fiel</span>
                  </span>
                )}
              </span>
              {ficha.data && (
                <span className="text-ink-3 text-[12.5px]">
                  {ficha.data.orderCount} {ficha.data.orderCount === 1 ? 'pedido' : 'pedidos'} ·{' '}
                  {formatMoney(ficha.data.totalSpent, tienda.locale)} en total
                </span>
              )}
            </div>
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noreferrer"
                aria-label={`Escribirle a ${order.customer.name} por WhatsApp`}
                title="Escribir por WhatsApp"
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'icon' }),
                  'size-[34px] text-[#13774a] print:hidden',
                )}
              >
                <WhatsappIcon className="size-[17px]" />
              </a>
            )}
            <a
              href={`mailto:${order.customer.email}`}
              aria-label={`Escribirle a ${order.customer.email}`}
              title={order.customer.email}
              className={cn(
                buttonVariants({ variant: 'outline', size: 'icon' }),
                'size-[34px] print:hidden',
              )}
            >
              <MailIcon className="size-4" />
            </a>
          </div>

          <Renglon icono={<DeliveryTruckIcon className="size-[18px]" />}>
            <span className="text-foreground font-medium">{order.address.street}</span>
            <span>
              {order.address.zone
                ? `${order.address.city}, ${order.address.zone}`
                : order.address.city}
            </span>
            {order.address.reference && (
              <span className="text-ink-3 text-[12.5px]">{order.address.reference}</span>
            )}
          </Renglon>

          <Renglon
            icono={
              order.paymentMethod === 'bank_transfer' ? (
                <BankIcon className="size-[18px]" />
              ) : (
                <MoneyIcon className="size-[18px]" />
              )
            }
          >
            <span className="text-foreground font-medium">
              {ETIQUETA_METODO_DE_PAGO[order.paymentMethod] ?? order.paymentMethod}
            </span>
            <span className="text-ink-3 text-[12.5px]">{notaDelPago(order)}</span>
          </Renglon>

          {order.customer.taxId && (
            <Renglon icono={<InvoiceIcon className="size-[18px]" />}>
              <span className="text-foreground font-medium">
                {order.customer.taxName ?? order.customer.name}
              </span>
              <span>RUC {order.customer.taxId}</span>
            </Renglon>
          )}

          {order.notes && (
            <Renglon icono={<QuoteIcon className="size-[18px] text-[#b7791f]" />}>
              <span className="leading-5 whitespace-pre-line text-[#4a3a1c]">{order.notes}</span>
            </Renglon>
          )}
        </Tarjeta>
      </div>

      <Historial
        storeId={tienda.id}
        orderId={id}
        locale={tienda.locale}
        events={events}
        avisos={avisos}
        escribe={escribe && !cancelado}
        onNota={trasCambiar}
      />

      <DialogoDeConfirmacion
        abierto={porCancelar}
        onAbierto={setPorCancelar}
        titulo={`¿Cancelar el pedido #${order.number}?`}
        descripcion="El stock vuelve al inventario y el pedido no se puede reabrir: cancelado es un estado final."
        confirmar="Cancelar el pedido"
        pendiente={cambiarEstado.isPending}
        onConfirmar={() => cambiarEstado.mutate('cancelled')}
      />
    </PaginaAdmin>
  );
}

function Vecino({
  id,
  ids,
  etiqueta,
  children,
}: {
  id: string | undefined;
  ids: string[];
  etiqueta: string;
  children: ReactNode;
}) {
  const clase = cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'size-[34px]');
  // En una punta de la lista el botón queda, deshabilitado: que desaparezca
  // movería al otro de lugar bajo el dedo.
  if (!id) {
    return (
      <button type="button" disabled aria-label={etiqueta} title={etiqueta} className={clase}>
        {children}
      </button>
    );
  }
  return (
    <Link
      to="/pedidos/$id"
      params={{ id }}
      state={{ pedidos: ids }}
      aria-label={etiqueta}
      title={etiqueta}
      className={clase}
    >
      {children}
    </Link>
  );
}

const COLOR_DE_ACCION: Readonly<
  Record<
    ClaveDeAccion,
    { readonly fondo: string; readonly tinta: string; readonly icono: typeof MoneyIcon }
  >
> = {
  cobrar: { fondo: '#fef6e6', tinta: '#b7791f', icono: MoneyIcon },
  rechazado: { fondo: '#fef0ee', tinta: '#bf3324', icono: AlertCircleIcon },
  avanzar: { fondo: '#edf1fe', tinta: '#3b5bdb', icono: PackageIcon },
  completo: { fondo: '#e9f7ef', tinta: '#13774a', icono: CheckCircleIcon },
  cancelado: { fondo: '#f1f2f5', tinta: '#6f7789', icono: CancelCircleIcon },
};

function ProximaAccionDelPedido({
  order,
  escribe,
  ocupado,
  onCobrar,
  onAvanzar,
}: {
  order: Order;
  escribe: boolean;
  ocupado: boolean;
  onCobrar: () => void;
  onAvanzar: (estado: OrderStatus) => void;
}) {
  const tienda = useTiendaActiva();
  const accion = proximaAccion(order, tienda.locale);
  const { pasos, resumen } = pasosDelPedido(order.status);
  const color = COLOR_DE_ACCION[accion.clave];
  const Icono = color.icono;
  const cancelado = order.status === 'cancelled';

  return (
    <Tarjeta className="flex flex-col gap-4 px-6 py-5">
      <div className="flex flex-wrap items-center gap-4">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-[11px]"
          style={{ background: color.fondo, color: color.tinta }}
        >
          <Icono className="size-5" />
        </span>
        <div className="min-w-[220px] flex-1">
          <p className="text-base font-semibold">{accion.titulo}</p>
          <p className="text-ink-3 mt-0.5 text-[13.5px]">
            {accion.detalle}
            {accion.boton && !escribe && ' Tu rol no permite cambiar los pedidos.'}
          </p>
        </div>
        {accion.boton && escribe && (
          <Button
            size="lg"
            disabled={ocupado}
            onClick={() => (accion.hacia ? onAvanzar(accion.hacia) : onCobrar())}
            className="print:hidden"
          >
            {accion.boton}
            <ArrowRightIcon />
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-1" aria-hidden="true">
          {pasos.map((p) => (
            <span
              key={p.etiqueta}
              title={p.etiqueta}
              className={cn(
                'h-1 flex-1 rounded-sm',
                !cancelado && (p.hecho || p.actual) ? 'bg-[#3b5bdb]' : 'bg-[#e6e8ee]',
              )}
            />
          ))}
        </div>
        <span className="text-ink-3 text-[12.5px]">{resumen}</span>
      </div>
    </Tarjeta>
  );
}

/** «Subtotal Gs. 478.000 · Descuento · PRIMAVERA − Gs. 47.800 · Envío Sin cargo». */
function totales(order: Order, locale: string): string {
  const partes = [`Subtotal ${formatMoney(order.subtotal, locale)}`];
  if (order.discount.amount > 0) {
    const nombres = (order.appliedPromotions ?? []).map((p) => p.code ?? p.title).join(', ');
    partes.push(
      `Descuento${nombres ? ` · ${nombres}` : ''} − ${formatMoney(order.discount, locale)}`,
    );
  }
  partes.push(
    `Envío ${order.shipping.amount > 0 ? formatMoney(order.shipping, locale) : 'sin cargo'}`,
  );
  return partes.join(' · ');
}

function notaDelPago(order: Order): string {
  const transferencia = order.paymentMethod === 'bank_transfer';
  if (order.paymentStatus === 'paid')
    return transferencia ? 'Comprobante revisado y confirmado.' : 'Pago acreditado.';
  if (order.paymentStatus === 'failed') return 'El pago fue rechazado. Contactá al cliente.';
  return transferencia
    ? 'Esperando el comprobante del cliente.'
    : 'Esperando la confirmación del pago.';
}

function Iniciales({ nombre, customerId }: { nombre: string; customerId: string | undefined }) {
  const iniciales = nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  const clase =
    'flex size-[38px] shrink-0 items-center justify-center rounded-full bg-[#e8f6ee] font-semibold text-[#13774a]';
  // El nombre al lado ya es el enlace: el avatar no se anuncia dos veces.
  return customerId ? (
    <Link
      to="/clientes/$id"
      params={{ id: customerId }}
      tabIndex={-1}
      aria-hidden="true"
      className={clase}
    >
      {iniciales}
    </Link>
  ) : (
    <span aria-hidden="true" className={clase}>
      {iniciales}
    </span>
  );
}

function Renglon({ icono, children }: { icono: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-3 border-t border-[#f0f1f4] px-5 py-3.5">
      <span className="text-ink-faint mt-px shrink-0">{icono}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-[13.5px] text-[#353d50]">
        {children}
      </div>
    </div>
  );
}

interface Entrada {
  readonly clave: string;
  readonly texto: string;
  readonly cuando: string;
  readonly punto: string;
  readonly tinta?: string;
}

/** El color del punto de cada entrada: lo que se cobró en verde, lo que falló en rojo. */
function puntoDe(e: OrderEvent): string {
  const hacia = (e.data as { to?: string }).to;
  if (e.type === 'payment_changed') {
    return hacia === 'paid' ? '#22a565' : hacia === 'failed' ? '#e5484d' : '#a3aab8';
  }
  if (e.type === 'status_changed') return hacia === 'cancelled' ? '#a3aab8' : '#3b5bdb';
  if (e.type === 'note') return '#e8930c';
  return '#a3aab8';
}

function Historial({
  storeId,
  orderId,
  locale,
  events,
  avisos,
  escribe,
  onNota,
}: {
  storeId: string;
  orderId: string;
  locale: string;
  events: readonly OrderEvent[];
  avisos: readonly AvisoDelPedido[];
  escribe: boolean;
  onNota: () => Promise<void>;
}) {
  const avisar = useAvisar();
  const [abierto, setAbierto] = useState(false);
  const [nota, setNota] = useState('');

  const agregar = useMutation({
    mutationFn: (texto: string) => repositorioAdminPedidos(db).agregarNota(storeId, orderId, texto),
    onSuccess: () => {
      setNota('');
      avisar('Nota agregada');
      return onNota();
    },
  });

  /*
   * Los correos que no salieron no son eventos del pedido —viven en la cola—,
   * pero son parte de su historia: se intercalan por fecha. Los enviados ya
   * están en la timeline como `email_sent`.
   */
  const entradas: Entrada[] = [
    ...events.map((e) => ({
      clave: e.id,
      texto: describirEvento(e),
      cuando: e.createdAt,
      punto: puntoDe(e),
      ...(e.type === 'note' ? { tinta: '#4a3a1c' } : {}),
    })),
    ...avisos
      .filter((a) => !a.sentAt)
      .map((a, i) => {
        const evento = (ETIQUETA_EVENTO[a.event as EventoDeNotificacion] ?? a.event).toLowerCase();
        const abandonado = a.attempts >= INTENTOS_DE_AVISO;
        return {
          clave: `aviso-${i}`,
          texto: abandonado
            ? `No se pudo enviar el correo de ${evento} (${a.attempts} intentos)`
            : `Correo de ${evento} en cola: sale con la próxima visita a la tienda`,
          cuando: a.createdAt,
          punto: abandonado ? '#e5484d' : '#a3aab8',
          ...(abandonado ? { tinta: '#bf3324' } : {}),
        };
      }),
  ].sort((a, b) => b.cuando.localeCompare(a.cuando));

  function enviar(e: FormEvent) {
    e.preventDefault();
    const texto = nota.trim();
    if (texto && !agregar.isPending) agregar.mutate(texto);
  }

  return (
    <div className="flex flex-col gap-3.5">
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
        className="text-ink-2 -ml-2.5 inline-flex h-8 cursor-pointer items-center gap-1.5 self-start rounded-lg px-2.5 text-[13.5px] font-medium outline-none hover:bg-[#f3f4f7] focus-visible:ring-3 focus-visible:ring-[#e4e9fc] print:hidden"
      >
        {abierto ? (
          <ChevronUpIcon className="size-[15px]" />
        ) : (
          <ChevronDownIcon className="size-[15px]" />
        )}
        {abierto ? 'Ocultar historial' : 'Ver historial'} ({entradas.length})
      </button>

      {abierto && (
        <Tarjeta className="px-5 pt-[18px] pb-1">
          {escribe && (
            <form onSubmit={enviar} className="mb-[18px]">
              <Input
                value={nota}
                onChange={(e) => setNota(e.currentTarget.value)}
                placeholder="Agregar una nota…"
                aria-label="Agregar una nota al pedido"
                disabled={agregar.isPending}
                maxLength={500}
              />
              {agregar.isError && (
                <p className="text-destructive mt-1.5 text-sm" role="alert">
                  {(agregar.error as Error).message}
                </p>
              )}
            </form>
          )}
          <ol>
            {entradas.map((e) => (
              <li key={e.clave} className="flex gap-3.5">
                <span className="flex w-3 shrink-0 flex-col items-center" aria-hidden="true">
                  <span
                    className="mt-1.5 size-[9px] rounded-full"
                    style={{ background: e.punto }}
                  />
                  <span className="mt-1 w-px flex-1 bg-[#e6e8ee]" />
                </span>
                {/* En el teléfono la fecha va debajo: al lado, apretaba el texto en una columna. */}
                <span className="flex flex-1 flex-col gap-0.5 pb-4 text-sm sm:flex-row sm:justify-between sm:gap-3">
                  <span style={e.tinta ? { color: e.tinta } : undefined}>{e.texto}</span>
                  <span className="text-ink-3 text-[12.5px] whitespace-nowrap">
                    {fecha(e.cuando, locale)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </Tarjeta>
      )}
    </div>
  );
}
