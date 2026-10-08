import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Papa from 'papaparse';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearch } from '@tanstack/react-router';
import { repositorioAdminPedidos } from '@pick/adapter-supabase';
import {
  BANDEJAS_DE_PEDIDOS,
  ESTADOS_DE_PEDIDO,
  ETIQUETA_BANDEJA,
  ETIQUETA_ESTADO_PAGO,
  ETIQUETA_ESTADO_PEDIDO,
  ETIQUETA_PERIODO,
  formatMoney,
  rangoDePeriodo,
  type BandejaDePedidos,
  type ConsultaPedidos,
  type PedidoDeLista,
  type Periodo,
  type TiendaResumen,
} from '@pick/commerce-core';
import type { OrderStatus, PaymentStatus } from '@pick/commerce-types';
import { DialogoDeConfirmacion } from '@/components/acciones';
import { useAvisar } from '@/components/aviso';
import { TONO_DE_PEDIDO } from '@/components/estados';
import {
  CancelCircleIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  DownloadIcon,
  MoneyIcon,
  PackageIcon,
  XIcon,
} from '@/components/iconos';
import {
  CampoDeBusqueda,
  Esqueleto,
  EstadoDeError,
  FiltroAgregable,
  PaginaAdmin,
  Paginacion,
  Pestanas,
  Tarjeta,
} from '@/components/pagina';
import { Badge, PUNTO_DE_TONO } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePuede } from '@/features/auth/usePuede';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { descargar } from '@/lib/descargar';
import { avisarStorefront } from '@/lib/notificaciones';
import { db } from '@/lib/supabase';
import { cn } from '@/lib/utils';

/**
 * Los pedidos, como los dibuja el handoff (ADR-143).
 *
 * Una lista y no una tabla: cada fila dice quién compró, si falta cobrarle,
 * cuándo y a dónde va, cuánto, y en qué estado está — y el estado se cambia ahí
 * mismo, sin abrir el pedido. Las pestañas cruzan estado y pago (ADR-146), así
 * que «Por cobrar» y «Para preparar» son las dos colas de trabajo del día.
 *
 * Elegir varios deja marcarlos como pagados o pasarlos a preparación de una vez.
 * Cada uno pasa por la misma función que el cambio de a uno: las reglas —un
 * cancelado no se reabre, cancelar devuelve el stock— viven en la base y no se
 * duplican acá.
 */

const POR_PAGINA = 20;

const FECHAS: readonly { readonly valor: Periodo; readonly etiqueta: string }[] = [
  { valor: 'hoy', etiqueta: ETIQUETA_PERIODO.hoy },
  { valor: '7d', etiqueta: ETIQUETA_PERIODO['7d'] },
  { valor: '30d', etiqueta: ETIQUETA_PERIODO['30d'] },
];

const PAGOS: readonly { readonly valor: PaymentStatus; readonly etiqueta: string }[] = [
  { valor: 'pending', etiqueta: ETIQUETA_ESTADO_PAGO.pending },
  { valor: 'paid', etiqueta: ETIQUETA_ESTADO_PAGO.paid },
  { valor: 'failed', etiqueta: ETIQUETA_ESTADO_PAGO.failed },
];

/** Sin cobrar y vivo: lo que la fila marca con «Sin cobrar». */
function sinCobrar(p: PedidoDeLista): boolean {
  return p.paymentStatus !== 'paid' && p.status !== 'cancelled';
}

/**
 * Lo que el lote puede pasar a preparación: lo que todavía no llegó.
 *
 * De a uno, la base deja mover el estado hacia atrás a propósito —corrige un
 * error— (ADR-066). En lote, un enviado o un entregado que vuelve a «En
 * preparación» no es una corrección sino un accidente de la selección.
 */
function porPreparar(p: PedidoDeLista): boolean {
  return p.status === 'received' || p.status === 'confirmed';
}

function fechaCorta(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ListaPedidos() {
  const tienda = useTiendaActiva();
  const { tab } = useSearch({ from: '/pedidos' });
  const bandeja: BandejaDePedidos = tab ?? 'todos';

  // La búsqueda y los filtros sobreviven al cambio de pestaña; la página y la
  // selección no, porque son de la lista que se estaba mirando.
  const [texto, setTexto] = useState('');
  const [query, setQuery] = useState('');
  const [pago, setPago] = useState<PaymentStatus | null>(null);
  const [fecha, setFecha] = useState<Periodo | null>(null);
  const [antiguos, setAntiguos] = useState(false);

  // La búsqueda va al servidor: sin esperar, cada tecla sería una consulta.
  useEffect(() => {
    const id = setTimeout(() => setQuery(texto.trim()), 300);
    return () => clearTimeout(id);
  }, [texto]);

  const rango = useMemo(() => (fecha ? rangoDePeriodo(fecha, new Date()) : null), [fecha]);

  const consulta: ConsultaPedidos = {
    query,
    bandeja,
    ...(pago ? { pago } : {}),
    ...(rango ? { desde: rango.from, hasta: rango.to } : {}),
    antiguosPrimero: antiguos,
  };

  const conteos = useQuery({
    queryKey: ['pedidos', tienda.id, 'conteos'],
    queryFn: () => repositorioAdminPedidos(db).conteos(tienda.id),
  });

  const exportar = useMutation({
    mutationFn: async () => {
      // Recorre las páginas con los mismos filtros, como el export del catálogo:
      // ni acá ni en la base se pide «todo de una» (ADR-024).
      const repo = repositorioAdminPedidos(db);
      const filas: Record<string, string | number>[] = [];
      for (let p = 1; ; p += 1) {
        const lote = await repo.listar(tienda.id, { ...consulta, page: p, perPage: 200 });
        filas.push(
          ...lote.items.map((o) => ({
            pedido: o.number,
            fecha: o.createdAt,
            cliente: o.customerName,
            ciudad: o.city ?? '',
            items: o.itemCount,
            total: o.total.amount,
            moneda: o.total.currency,
            estado: ETIQUETA_ESTADO_PEDIDO[o.status],
            pago: ETIQUETA_ESTADO_PAGO[o.paymentStatus],
          })),
        );
        if (lote.page >= lote.pageCount) break;
      }
      descargar(
        `pedidos-${tienda.slug}-${bandeja}-${new Date().toISOString().slice(0, 10)}.csv`,
        Papa.unparse(filas),
      );
      return filas.length;
    },
  });

  return (
    <PaginaAdmin
      titulo="Pedidos"
      descripcion="Cambiá el pago y el estado desde la lista. Abrí un pedido para ver el detalle."
      acciones={
        <Button
          variant="outline"
          disabled={exportar.isPending || conteos.data?.[bandeja] === 0}
          onClick={() => exportar.mutate()}
        >
          <DownloadIcon />
          {exportar.isPending ? 'Exportando…' : 'Exportar'}
        </Button>
      }
    >
      {exportar.isError && (
        <p className="text-destructive text-sm" role="alert">
          {(exportar.error as Error).message}
        </p>
      )}

      <Pestanas
        etiqueta="Pedidos por estado"
        to="/pedidos"
        activa={bandeja}
        pestanas={BANDEJAS_DE_PEDIDOS.map((b) => ({
          valor: b,
          etiqueta: ETIQUETA_BANDEJA[b],
          ...(conteos.data ? { cuenta: conteos.data[b] } : {}),
          ...(b === 'cobrar' ? { urgente: 'amber' as const } : {}),
          ...(b === 'preparar' ? { urgente: 'blue' as const } : {}),
        }))}
      />

      <div className="flex flex-wrap items-center gap-2">
        <CampoDeBusqueda
          valor={texto}
          onCambio={setTexto}
          placeholder="Número, cliente o ciudad"
          etiqueta="Buscar pedidos"
        />
        <FiltroAgregable etiqueta="Pago" valor={pago} opciones={PAGOS} onCambiar={setPago} />
        <FiltroAgregable etiqueta="Fecha" valor={fecha} opciones={FECHAS} onCambiar={setFecha} />
        <div className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger className="text-ink-3 hover:text-foreground focus-visible:ring-focus-tint inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-[13.5px] outline-none focus-visible:ring-3">
            {antiguos ? 'Más antiguos primero' : 'Más recientes primero'}
            <ChevronDownIcon className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setAntiguos(false)}>
              Más recientes primero
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAntiguos(true)}>
              Más antiguos primero
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Lista tienda={tienda} consulta={consulta} filtrando={Boolean(query || pago || fecha)} />
    </PaginaAdmin>
  );
}

function Lista({
  tienda,
  consulta,
  filtrando,
}: {
  tienda: TiendaResumen;
  consulta: ConsultaPedidos;
  filtrando: boolean;
}) {
  const cliente = useQueryClient();
  const avisar = useAvisar();
  const escribe = usePuede()('order.write');
  const [page, setPage] = useState(1);
  const [elegidos, setElegidos] = useState<ReadonlySet<string>>(new Set());
  const [porCancelar, setPorCancelar] = useState<PedidoDeLista | null>(null);
  const [falloEnLote, setFalloEnLote] = useState<string | null>(null);

  /*
   * Otra pestaña u otro filtro: la página y lo elegido eran de la lista anterior,
   * y arrastrarlos marcaría pedidos que ya no se ven. Se reinician durante el
   * render —el patrón de React para derivar estado de una prop— y no
   * remontando la lista, que la hacía parpadear con el esqueleto en cada
   * búsqueda.
   */
  const clave = JSON.stringify(consulta);
  const [claveVista, setClaveVista] = useState(clave);
  if (clave !== claveVista) {
    setClaveVista(clave);
    setPage(1);
    setElegidos(new Set());
  }

  const lista = useQuery({
    queryKey: ['pedidos', tienda.id, consulta, page],
    queryFn: () =>
      repositorioAdminPedidos(db).listar(tienda.id, { ...consulta, page, perPage: POR_PAGINA }),
    placeholderData: keepPreviousData,
  });

  const invalidar = () => {
    // El cambio pudo encolar un correo —confirmado, enviado, entregado— y el
    // storefront es quien lo manda.
    avisarStorefront(tienda.domain);
    // Las tareas cuentan lo que falta cobrar y preparar: el sidebar y el Inicio.
    void cliente.invalidateQueries({ queryKey: ['tareas', tienda.id] });
    return cliente.invalidateQueries({ queryKey: ['pedidos', tienda.id] });
  };

  const cambiarEstado = useMutation({
    mutationFn: ({ pedido, estado }: { pedido: PedidoDeLista; estado: OrderStatus }) =>
      repositorioAdminPedidos(db).cambiarEstado(tienda.id, pedido.id, estado),
    onSuccess: (_, { pedido, estado }) => {
      avisar(`#${pedido.number} pasó a ${ETIQUETA_ESTADO_PEDIDO[estado]}`);
      return invalidar();
    },
  });

  const cambiarPago = useMutation({
    mutationFn: ({ pedido, pago }: { pedido: PedidoDeLista; pago: PaymentStatus }) =>
      repositorioAdminPedidos(db).cambiarPago(tienda.id, pedido.id, pago),
    onSuccess: (_, { pedido, pago }) => {
      avisar(
        pago === 'paid'
          ? `#${pedido.number} quedó pagado`
          : `#${pedido.number} vuelve a esperar el pago`,
      );
      return invalidar();
    },
  });

  const pedidos = lista.data?.items ?? [];
  const elegidosVisibles = pedidos.filter((p) => elegidos.has(p.id));

  const enLote = useMutation({
    mutationFn: async (accion: 'pagados' | 'preparar') => {
      const repo = repositorioAdminPedidos(db);
      // Sólo los que la acción puede tocar: un cancelado no se cobra, uno ya
      // pagado no se vuelve a marcar, y lo que ya salió no vuelve atrás.
      const destino = elegidosVisibles.filter(accion === 'pagados' ? sinCobrar : porPreparar);
      const resultados = await Promise.allSettled(
        destino.map((p) =>
          accion === 'pagados'
            ? repo.cambiarPago(tienda.id, p.id, 'paid')
            : repo.cambiarEstado(tienda.id, p.id, 'preparing'),
        ),
      );
      const fallidos = resultados.filter((r) => r.status === 'rejected');
      return {
        hechos: destino.length - fallidos.length,
        fallidos: fallidos.length,
        error: fallidos[0]
          ? ((fallidos[0] as PromiseRejectedResult).reason as Error).message
          : null,
      };
    },
    onSuccess: ({ hechos, fallidos, error }, accion) => {
      setElegidos(new Set());
      setFalloEnLote(fallidos > 0 ? `No se pudieron cambiar ${fallidos}: ${error ?? ''}` : null);
      if (hechos > 0) {
        avisar(
          accion === 'pagados'
            ? `${hechos} ${hechos === 1 ? 'pedido quedó pagado' : 'pedidos quedaron pagados'}`
            : `${hechos} ${hechos === 1 ? 'pedido pasó' : 'pedidos pasaron'} a En preparación`,
        );
      }
      return invalidar();
    },
  });

  const todos = pedidos.length > 0 && pedidos.every((p) => elegidos.has(p.id));
  const algunos = !todos && pedidos.some((p) => elegidos.has(p.id));
  const elegir = (id: string, si: boolean) =>
    setElegidos((actual) => {
      const nuevo = new Set(actual);
      if (si) nuevo.add(id);
      else nuevo.delete(id);
      return nuevo;
    });
  const ocupado = cambiarEstado.isPending || cambiarPago.isPending || enLote.isPending;
  const error = cambiarEstado.error ?? cambiarPago.error;

  return (
    <>
      {(error || falloEnLote) && (
        <p className="text-destructive text-sm" role="alert">
          {falloEnLote ?? (error as Error).message}
        </p>
      )}

      <Tarjeta sinRelleno>
        {lista.isError ? (
          <EstadoDeError
            titulo="No se pudieron cargar los pedidos"
            error={lista.error as Error}
            onReintentar={() => void lista.refetch()}
          />
        ) : lista.isPending ? (
          <Esqueleto filas={6} />
        ) : pedidos.length === 0 ? (
          <Vacio bandeja={consulta.bandeja ?? 'todos'} filtrando={filtrando} />
        ) : (
          <>
            {escribe && (
              <div className="text-muted-foreground flex h-10 items-center gap-3 border-b border-[#eceef2] pr-4 pl-3.5 text-[12.5px]">
                <Checkbox
                  checked={todos}
                  indeterminate={algunos}
                  onCheckedChange={(si) =>
                    setElegidos(si ? new Set(pedidos.map((p) => p.id)) : new Set())
                  }
                  aria-label="Elegir todos los pedidos de esta página"
                />
                <span aria-hidden="true">Seleccionar todos</span>
              </div>
            )}
            <ul aria-busy={lista.isFetching} className="relative">
              {pedidos.map((p) => (
                <Fila
                  key={p.id}
                  pedido={p}
                  tienda={tienda}
                  escribe={escribe}
                  elegido={elegidos.has(p.id)}
                  onElegir={(si) => elegir(p.id, si)}
                  ocupado={ocupado}
                  onEstado={(estado) => cambiarEstado.mutate({ pedido: p, estado })}
                  onPago={(pago) => cambiarPago.mutate({ pedido: p, pago })}
                  onCancelar={() => setPorCancelar(p)}
                />
              ))}
            </ul>
          </>
        )}

        {lista.data && (
          <Paginacion
            datos={lista.data}
            sustantivo="pedidos"
            cargando={lista.isFetching}
            onPagina={(p) => {
              setPage(p);
              setElegidos(new Set());
            }}
          />
        )}
      </Tarjeta>

      {/*
        La barra de lo elegido flota abajo, como en el handoff: está a la vista
        mientras se recorre la lista, y desaparece apenas no hay nada elegido.
      */}
      {elegidosVisibles.length > 0 && (
        <div
          role="toolbar"
          aria-label="Acciones sobre los pedidos elegidos"
          className="shadow-modal fixed inset-x-4 bottom-4 z-30 flex items-center gap-1 rounded-xl bg-[#0e1525] p-1.5 text-white sm:inset-x-auto sm:bottom-6 sm:left-1/2 sm:-translate-x-1/2"
        >
          <span className="px-2 text-[13.5px] font-medium whitespace-nowrap tabular-nums sm:px-3">
            {elegidosVisibles.length} {elegidosVisibles.length === 1 ? 'elegido' : 'elegidos'}
          </span>
          <BotonDeLote
            icono={MoneyIcon}
            disabled={enLote.isPending || !elegidosVisibles.some(sinCobrar)}
            onClick={() => enLote.mutate('pagados')}
          >
            {/* En un teléfono no entran las dos frases enteras. */}
            <span className="sm:hidden">Pagados</span>
            <span className="hidden sm:inline">Marcar pagados</span>
          </BotonDeLote>
          <BotonDeLote
            icono={PackageIcon}
            disabled={enLote.isPending || !elegidosVisibles.some(porPreparar)}
            onClick={() => enLote.mutate('preparar')}
          >
            <span className="sm:hidden">Preparar</span>
            <span className="hidden sm:inline">Pasar a En preparación</span>
          </BotonDeLote>
          <button
            type="button"
            aria-label="Dejar de elegir"
            onClick={() => setElegidos(new Set())}
            className="ml-auto flex size-8 shrink-0 cursor-pointer sm:ml-0 items-center justify-center rounded-lg text-[#c9cedb] outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <XIcon className="size-4" />
          </button>
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
          if (porCancelar) cambiarEstado.mutate({ pedido: porCancelar, estado: 'cancelled' });
          setPorCancelar(null);
        }}
      />
    </>
  );
}

function BotonDeLote({
  icono: Icono,
  children,
  disabled,
  onClick,
}: {
  icono: typeof MoneyIcon;
  children: ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-white/10 px-3 text-[13.5px] font-medium whitespace-nowrap outline-none hover:bg-white/[0.18] focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icono className="size-[15px]" />
      {children}
    </button>
  );
}

/**
 * Una fila de pedido.
 *
 * Toda la fila lleva al detalle con un enlace estirado —el nombre del cliente,
 * con un `::after` que cubre la fila—, y el checkbox y el menú de estado quedan
 * encima. Un `<tr>` o un `<li>` con `onClick` no se alcanza con el teclado; un
 * enlace que envolviera al checkbox y al menú sería HTML inválido.
 */
function Fila({
  pedido: p,
  tienda,
  escribe,
  elegido,
  onElegir,
  ocupado,
  onEstado,
  onPago,
  onCancelar,
}: {
  pedido: PedidoDeLista;
  tienda: TiendaResumen;
  escribe: boolean;
  elegido: boolean;
  onElegir: (si: boolean) => void;
  ocupado: boolean;
  onEstado: (estado: OrderStatus) => void;
  onPago: (pago: PaymentStatus) => void;
  onCancelar: () => void;
}) {
  const tono = TONO_DE_PEDIDO[p.status];
  const detalle = [
    `#${p.number}`,
    fechaCorta(p.createdAt, tienda.locale),
    ...(p.city ? [`Envío a ${p.city}`] : []),
  ].join(' · ');

  return (
    <li
      className={cn(
        'hover:bg-row-hover relative flex min-h-[62px] items-center gap-3 border-b border-[#f0f1f4] py-2 pr-4 pl-3.5 last:border-b-0',
        elegido && 'bg-[#f5f7fe] hover:bg-[#f5f7fe]',
      )}
    >
      {escribe && (
        <Checkbox
          checked={elegido}
          onCheckedChange={(si) => onElegir(si === true)}
          aria-label={`Elegir el pedido #${p.number}`}
          className="relative z-10"
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <Link
            to="/pedidos/$id"
            params={{ id: p.id }}
            className="truncate font-medium outline-none after:absolute after:inset-0 after:rounded-sm focus-visible:after:ring-3 focus-visible:after:ring-[#e4e9fc]"
          >
            {p.customerName}
          </Link>
          {sinCobrar(p) && (
            <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-[#fef6e6] px-[7px] text-[11.5px] font-semibold text-[#8a5a0c]">
              Sin cobrar
            </span>
          )}
        </span>
        <span className="text-muted-foreground truncate text-[12.5px] tabular-nums">{detalle}</span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <span className="font-medium whitespace-nowrap tabular-nums">
          {formatMoney(p.total, tienda.locale)}
        </span>
        {/* En un teléfono el menú de estado no entra en la fila: se ve el estado. */}
        <Badge variant={tono} className="sm:hidden">
          {ETIQUETA_ESTADO_PEDIDO[p.status]}
        </Badge>
      </span>
      <span className="relative z-10 hidden w-[136px] shrink-0 justify-end sm:flex">
        {!escribe || p.status === 'cancelled' ? (
          /*
           * Cancelado es terminal: se muestra la etiqueta y no un control, porque
           * ofrecer una acción que la base va a rechazar es peor que no ofrecerla.
           * Por lo mismo quien no escribe pedidos ve la etiqueta.
           */
          <Badge variant={tono}>{ETIQUETA_ESTADO_PEDIDO[p.status]}</Badge>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={ocupado}
              aria-label={`Estado del pedido #${p.number}: ${ETIQUETA_ESTADO_PEDIDO[p.status]}`}
              className="text-ink-2 focus-visible:ring-focus-tint inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border border-[#e6e8ee] bg-white px-2 text-[12.5px] font-medium whitespace-nowrap outline-none hover:border-[#cfd3dc] focus-visible:ring-3 disabled:cursor-wait disabled:opacity-60"
            >
              <span
                aria-hidden="true"
                className="size-[7px] rounded-full"
                style={{ background: PUNTO_DE_TONO[tono] }}
              />
              {ETIQUETA_ESTADO_PEDIDO[p.status]}
              <ChevronDownIcon className="text-ink-faint size-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Pasar a</DropdownMenuLabel>
                {ESTADOS_DE_PEDIDO.filter((e) => e !== p.status && e !== 'cancelled').map((e) => (
                  <DropdownMenuItem key={e} onClick={() => onEstado(e)}>
                    <span
                      aria-hidden="true"
                      className="size-[7px] rounded-full"
                      style={{ background: PUNTO_DE_TONO[TONO_DE_PEDIDO[e]] }}
                    />
                    {ETIQUETA_ESTADO_PEDIDO[e]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              {/*
                El pago, en el mismo menú: con transferencia, cobrar es una persona
                mirando un comprobante, y es la acción de todos los días.
              */}
              {p.paymentStatus === 'paid' ? (
                <DropdownMenuItem onClick={() => onPago('pending')}>
                  <MoneyIcon className="text-muted-foreground" />
                  Marcar pago como pendiente
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => onPago('paid')}>
                  <CheckCircleIcon className="text-[#13774a]" />
                  Marcar como pagado
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onCancelar}
                className="text-[#bf3324] focus:bg-[#fdf1f0] focus:text-[#bf3324]"
              >
                <CancelCircleIcon />
                Cancelar pedido…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </span>
    </li>
  );
}

function Vacio({ bandeja, filtrando }: { bandeja: BandejaDePedidos; filtrando: boolean }) {
  const [titulo, texto] = filtrando
    ? ['Ningún pedido coincide', 'Probá con otro número, otro nombre o sacá un filtro.']
    : bandeja === 'todos'
      ? [
          'Todavía no hay pedidos',
          'Los pedidos aparecen acá apenas alguien termina de comprar en la tienda.',
        ]
      : ['Nada pendiente acá', 'Cuando entre un pedido en este estado, aparece en esta lista.'];
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-[#e8f6ee] text-[#13774a]">
        <CheckCircleIcon className="size-[22px]" />
      </span>
      <p className="mt-1.5 text-[15px] font-semibold">{titulo}</p>
      <p className="text-muted-foreground text-sm">{texto}</p>
    </div>
  );
}
