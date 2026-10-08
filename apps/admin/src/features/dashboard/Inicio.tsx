import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { repositorioAnalytics, repositorioDashboard } from '@pick/adapter-supabase';
import {
  ETIQUETA_ESTADO_PEDIDO,
  formatMoney,
  periodoAnterior,
  rangoDePeriodo,
  variacion,
  type Periodo,
  type ResumenDelPeriodo,
  type TareasDeLaTienda,
  type TiendaResumen,
} from '@pick/commerce-core';
import {
  ArrowRightIcon,
  CameraIcon,
  CheckCircleIcon,
  CheckIcon,
  MailIcon,
  MoneyIcon,
  PackageIcon,
  ResenaIcon,
  SparklesIcon,
  TrendDownIcon,
  TrendUpIcon,
  UploadIcon,
} from '@/components/iconos';
import { TONO_DE_PEDIDO } from '@/components/estados';
import { EstadoDeError, Tarjeta } from '@/components/pagina';
import { Badge, COLOR_DE_TONO } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { usePuede } from '@/features/auth/usePuede';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Barras, Linea, Medidor, Reparto } from './graficos';
import { esTiendaNueva, listaDeTareas, pasosDeAlta, type IconoDeTarea } from './tareas';

/**
 * El Inicio del Admin, como lo dibuja el handoff (ADR-143, ADR-145).
 *
 * Responde tres preguntas, en este orden: **qué tengo que hacer** —lo que espera
 * a la tienda, ordenado por urgencia—, **cómo vamos** —cuatro números contra el
 * período anterior— y **qué pasó recién** —los últimos pedidos y lo más
 * vendido—. Una tienda que todavía no vendió nada ve en cambio los pasos para
 * empezar, leídos de lo que ya hizo.
 *
 * «Cómo vamos» es para quien decide —propietario y administrador—: el handoff
 * se lo oculta al personal. No es una barrera de seguridad, los pedidos los lee
 * igual; es no poner la facturación en la pantalla de quien despacha.
 */

const PERIODOS: readonly { readonly valor: Periodo; readonly etiqueta: string }[] = [
  { valor: 'hoy', etiqueta: 'Hoy' },
  { valor: '7d', etiqueta: '7 días' },
  { valor: '30d', etiqueta: '30 días' },
];

const ICONO_DE_TAREA: Readonly<Record<IconoDeTarea, ComponentType<{ className?: string }>>> = {
  aviso: MailIcon,
  cobrar: MoneyIcon,
  preparar: PackageIcon,
  foto: CameraIcon,
  resena: ResenaIcon,
  ia: SparklesIcon,
};

/** «Martes 7 de octubre», en el idioma de la tienda. */
function fechaLarga(ahora: Date, locale: string): string {
  const texto = ahora
    .toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
    .replace(',', '');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function saludo(ahora: Date): string {
  const h = ahora.getHours();
  if (h >= 5 && h < 12) return 'Buenos días';
  if (h >= 12 && h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

export function Inicio() {
  const tienda = useTiendaActiva();
  const puede = usePuede();
  const decide = puede('settings.write');
  const [periodo, setPeriodo] = useState<Periodo>('30d');
  const rango = useMemo(() => rangoDePeriodo(periodo, new Date()), [periodo]);

  const tareas = useQuery({
    queryKey: ['tareas', tienda.id],
    queryFn: () => repositorioDashboard(db).tareas(tienda.id),
  });

  // Con la misma clave que tenía el Resumen: los últimos pedidos y lo más
  // vendido salen de acá, y «Cómo vamos» usa la misma consulta.
  const actual = useQuery({
    queryKey: ['dashboard', tienda.id, periodo],
    queryFn: () => repositorioDashboard(db).resumen(tienda.id, rango.from, rango.to),
    placeholderData: keepPreviousData,
  });

  const nueva = decide && tareas.data != null && esTiendaNueva(tareas.data);

  if (nueva && tareas.data) return <PrimerosPasos tareas={tareas.data} />;

  const ahora = new Date();

  return (
    <div className="flex flex-col gap-10">
      <div>
        <p className="text-muted-foreground mb-1.5 text-[13px]">
          {fechaLarga(ahora, tienda.locale)}
        </p>
        <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em]">
          {saludo(ahora)}
        </h1>
      </div>

      {decide && (
        <ComoVamos
          tienda={tienda}
          periodo={periodo}
          onPeriodo={setPeriodo}
          rango={rango}
          actual={actual}
        />
      )}

      <ParaHacer tienda={tienda} consulta={tareas} veIA={decide} />

      <div className="flex flex-wrap items-start gap-6">
        <UltimosPedidos tienda={tienda} resumen={actual.data} cargando={actual.isPending} />
        <LoMasVendido
          tienda={tienda}
          resumen={actual.data}
          cargando={actual.isPending}
          periodo={PERIODOS.find((p) => p.valor === periodo)!.etiqueta}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cómo vamos
// ---------------------------------------------------------------------------

function ComoVamos({
  tienda,
  periodo,
  onPeriodo,
  rango,
  actual,
}: {
  tienda: TiendaResumen;
  periodo: Periodo;
  onPeriodo: (p: Periodo) => void;
  rango: { from: string; to: string };
  actual: UseQueryResult<ResumenDelPeriodo>;
}) {
  const anterior = useMemo(() => periodoAnterior(periodo, rango), [periodo, rango]);
  // El corte del día es de quien mira, como en la recurrencia (ADR-134).
  const zona = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const porHora = periodo === 'hoy';
  const repo = repositorioDashboard(db);

  const previo = useQuery({
    queryKey: ['dashboard', tienda.id, periodo, 'anterior'],
    queryFn: () => repo.resumen(tienda.id, anterior.from, anterior.to),
    placeholderData: keepPreviousData,
  });
  const serie = useQuery({
    queryKey: ['dashboard', tienda.id, periodo, 'serie', zona],
    queryFn: () => repo.serie(tienda.id, rango.from, rango.to, zona, porHora),
    placeholderData: keepPreviousData,
  });
  const seriePrevia = useQuery({
    queryKey: ['dashboard', tienda.id, periodo, 'serie-anterior', zona],
    queryFn: () => repo.serie(tienda.id, anterior.from, anterior.to, zona, porHora),
    placeholderData: keepPreviousData,
  });
  // La misma clave que Analytics: si ya se abrió, esto no pide nada (ADR-099).
  const visitas = useQuery({
    queryKey: ['analytics', tienda.id, periodo],
    queryFn: () => repositorioAnalytics(db).resumen(tienda.id, rango.from, rango.to),
    placeholderData: keepPreviousData,
  });
  const visitasPrevias = useQuery({
    queryKey: ['analytics', tienda.id, periodo, 'anterior'],
    queryFn: () => repositorioAnalytics(db).resumen(tienda.id, anterior.from, anterior.to),
    placeholderData: keepPreviousData,
  });

  const locale = tienda.locale;
  const datos = actual.data;
  const antes = previo.data;
  const puntos = serie.data?.puntos ?? [];
  const puntosAntes = seriePrevia.data?.puntos ?? [];
  const pct = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 });
  const pct1 = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 });

  const etiquetaDe = (desde: string | undefined, esUltima: boolean): string => {
    if (!desde) return '';
    if (esUltima) return porHora ? 'Ahora' : 'Hoy';
    const fecha = new Date(desde);
    return porHora
      ? `${fecha.getHours()} h`
      : fecha.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  };

  const tramos = serie.data?.tramos;
  const moneda = datos?.sales.currency ?? tienda.currency;
  const dinero = (amount: number) => formatMoney({ amount, currency: moneda }, locale);

  const conversion =
    visitas.data && visitas.data.sesiones > 0 ? visitas.data.convirtieron.tasa : null;
  const conversionAntes =
    visitasPrevias.data && visitasPrevias.data.sesiones > 0
      ? visitasPrevias.data.convirtieron.tasa
      : null;

  return (
    <section className="flex flex-col gap-4" aria-labelledby="como-vamos">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="como-vamos" className="text-[17px] font-semibold">
          Cómo vamos
        </h2>
        <div
          className="flex gap-0.5 rounded-[9px] bg-[#f1f2f5] p-[3px]"
          role="group"
          aria-label="Período"
        >
          {PERIODOS.map((p) => (
            <button
              key={p.valor}
              type="button"
              aria-pressed={periodo === p.valor}
              onClick={() => onPeriodo(p.valor)}
              className={cn(
                'focus-visible:ring-focus-tint h-7 cursor-pointer rounded-[7px] px-3 text-[13px] font-medium outline-none focus-visible:ring-3',
                periodo === p.valor
                  ? 'text-foreground bg-white shadow-[0_1px_2px_rgba(16,24,40,0.08)]'
                  : 'text-ink-3',
              )}
            >
              {p.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {actual.isError ? (
        <Tarjeta sinRelleno>
          <EstadoDeError
            titulo="No se pudo cargar cómo vamos"
            error={actual.error as Error}
            onReintentar={() => void actual.refetch()}
          />
        </Tarjeta>
      ) : !datos ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="bg-muted h-44 animate-pulse rounded-[14px]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4">
          <Indicador
            titulo="Ventas"
            valor={formatMoney(datos.sales, locale)}
            cambio={antes ? variacion(datos.sales.amount, antes.sales.amount) : null}
            locale={locale}
            nota={
              /*
               * El margen nunca va solo: al lado, qué parte de los ingresos tiene
               * costo cargado (ADR-101). Sin nada cargado, se dice eso.
               */
              datos.margin
                ? `Margen ${formatMoney(datos.margin, locale)} · sobre el ${pct.format(
                    datos.marginCoverage,
                  )} de los ingresos con costo cargado`
                : 'Ningún producto vendido tiene costo cargado'
            }
          >
            <Linea
              actual={puntos.map((p) => p.ventas)}
              anterior={puntosAntes.map((p) => p.ventas)}
            />
          </Indicador>

          <Indicador
            titulo="Pedidos"
            valor={String(datos.orderCount)}
            cambio={antes ? variacion(datos.orderCount, antes.orderCount) : null}
            locale={locale}
            nota="Sin los cancelados"
          >
            <Barras
              valores={puntos.map((p) => p.pedidos)}
              desde={etiquetaDe(puntos[0]?.desde, false)}
              hasta={etiquetaDe(puntos.at(-1)?.desde, true)}
            />
          </Indicador>

          <Indicador
            titulo="Ticket promedio"
            valor={formatMoney(datos.aov, locale)}
            cambio={antes ? variacion(datos.aov.amount, antes.aov.amount) : null}
            locale={locale}
            nota="Pedidos según cuánto gastaron"
          >
            {tramos && (
              <Reparto
                locale={locale}
                tramos={[
                  { etiqueta: `Hasta ${dinero(tramos.hasta[0])}`, n: tramos.pedidos[0] },
                  {
                    etiqueta: `${dinero(tramos.hasta[0])} a ${dinero(tramos.hasta[1])}`,
                    n: tramos.pedidos[1],
                  },
                  { etiqueta: `Más de ${dinero(tramos.hasta[1])}`, n: tramos.pedidos[2] },
                ]}
              />
            )}
          </Indicador>

          <Indicador
            titulo="Conversión"
            valor={conversion === null ? '—' : pct1.format(conversion)}
            cambio={
              conversion !== null && conversionAntes !== null
                ? { puntos: (conversion - conversionAntes) * 100 }
                : null
            }
            locale={locale}
            nota={
              conversion === null
                ? 'Todavía no hay visitas medidas en este período'
                : 'Sesiones que terminaron en un pedido'
            }
          >
            {conversion !== null && (
              <Medidor
                actual={conversion}
                anterior={conversionAntes}
                etiquetaAnterior={conversionAntes === null ? '' : pct1.format(conversionAntes)}
              />
            )}
          </Indicador>
        </div>
      )}
    </section>
  );
}

/**
 * Un número con su variación contra el período anterior y su gráfico.
 *
 * La variación es un tanto por uno o, para una tasa, puntos porcentuales: que la
 * conversión pase de 2 % a 1,8 % es «−0,2 pp», no «−10 %».
 */
function Indicador({
  titulo,
  valor,
  cambio,
  locale,
  nota,
  children,
}: {
  titulo: string;
  valor: string;
  cambio: number | { readonly puntos: number } | null;
  locale: string;
  nota: string;
  children?: ReactNode;
}) {
  const v = cambio === null ? null : typeof cambio === 'number' ? cambio : cambio.puntos;
  const texto =
    cambio === null
      ? null
      : typeof cambio === 'number'
        ? new Intl.NumberFormat(locale, {
            style: 'percent',
            maximumFractionDigits: 0,
            signDisplay: 'exceptZero',
          }).format(cambio)
        : `${new Intl.NumberFormat(locale, {
            maximumFractionDigits: 1,
            signDisplay: 'exceptZero',
          }).format(cambio.puntos)} pp`;

  return (
    <Tarjeta className="flex flex-col gap-2.5 px-5 py-[18px]">
      <p className="text-ink-3 text-[13px]">{titulo}</p>
      <div className="flex flex-wrap items-baseline gap-2.5">
        <span className="text-[26px] leading-[30px] font-semibold tracking-[-0.02em] tabular-nums">
          {valor}
        </span>
        {texto && v !== null && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-[12.5px] font-semibold',
              v > 0 ? 'text-[#13774a]' : v < 0 ? 'text-[#bf3324]' : 'text-muted-foreground',
            )}
          >
            {v > 0 ? (
              <TrendUpIcon className="size-3" />
            ) : v < 0 ? (
              <TrendDownIcon className="size-3" />
            ) : null}
            {texto}
            <span className="sr-only"> contra el período anterior</span>
          </span>
        )}
      </div>
      {children}
      <p className="text-muted-foreground text-xs leading-4">{nota}</p>
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------
// Para hacer
// ---------------------------------------------------------------------------

function ParaHacer({
  tienda,
  consulta,
  veIA,
}: {
  tienda: TiendaResumen;
  consulta: UseQueryResult<TareasDeLaTienda | null>;
  veIA: boolean;
}) {
  const tareas = consulta.data
    ? listaDeTareas(consulta.data, { ahora: new Date(), locale: tienda.locale, veIA })
    : [];

  return (
    <Tarjeta sinRelleno>
      <div className="flex items-center justify-between gap-3 px-5 pt-[18px] pb-3.5">
        <h2 className="text-[15px] font-semibold">Para hacer</h2>
        <span className="text-muted-foreground text-[13px]">Ordenado por urgencia</span>
      </div>

      {consulta.isError ? (
        <EstadoDeError
          titulo="No se pudo saber qué hay pendiente"
          error={consulta.error as Error}
          onReintentar={() => void consulta.refetch()}
        />
      ) : consulta.isPending ? (
        <div className="flex flex-col gap-3 border-t border-[#f0f1f4] p-5">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="bg-muted h-10 animate-pulse rounded-lg" />
          ))}
        </div>
      ) : tareas.length === 0 ? (
        <div className="flex items-center gap-3.5 border-t border-[#f0f1f4] px-5 py-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#e8f6ee] text-[#13774a]">
            <CheckCircleIcon className="size-[18px]" />
          </span>
          <div>
            <p className="text-sm font-medium">Nada pendiente</p>
            <p className="text-muted-foreground text-[13px]">
              Cuando haya algo para resolver, aparece acá.
            </p>
          </div>
        </div>
      ) : (
        <ul>
          {tareas.map((t) => {
            const Icono = ICONO_DE_TAREA[t.icono];
            return (
              <li key={t.clave} className="border-t border-[#f0f1f4]">
                <Link
                  to={t.to}
                  params={t.params}
                  className="hover:bg-row-hover focus-visible:bg-row-hover flex items-center gap-3.5 px-5 py-3.5 outline-none"
                >
                  <span
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-[10px]',
                      COLOR_DE_TONO[t.tono],
                    )}
                  >
                    <Icono className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{t.titulo}</span>
                    {t.detalle && (
                      <span className="text-muted-foreground mt-0.5 block text-[13px]">
                        {t.detalle}
                      </span>
                    )}
                  </span>
                  <span className="text-link hidden shrink-0 items-center gap-1 text-[13px] font-medium whitespace-nowrap sm:flex">
                    {t.accion}
                    <ArrowRightIcon className="size-3.5" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------
// Qué pasó recién
// ---------------------------------------------------------------------------

function UltimosPedidos({
  tienda,
  resumen,
  cargando,
}: {
  tienda: TiendaResumen;
  resumen: ResumenDelPeriodo | undefined;
  cargando: boolean;
}) {
  return (
    <Tarjeta sinRelleno className="min-w-0 flex-[1.3_1_420px]">
      <div className="flex items-center justify-between gap-3 px-5 pt-[18px] pb-3">
        <h2 className="text-[15px] font-semibold">Últimos pedidos</h2>
        <Link to="/pedidos" className="text-link hover:text-link-hover text-[13px] font-medium">
          Ver todos
        </Link>
      </div>
      {cargando ? (
        <div className="flex flex-col gap-3 border-t border-[#f0f1f4] p-5">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="bg-muted h-9 animate-pulse rounded-lg" />
          ))}
        </div>
      ) : !resumen || resumen.recent.length === 0 ? (
        <p className="text-muted-foreground border-t border-[#f0f1f4] px-5 py-6 text-sm">
          Todavía no hay pedidos.
        </p>
      ) : (
        <ul>
          {resumen.recent.map((p) => (
            <li key={p.id} className="border-t border-[#f0f1f4]">
              <Link
                to="/pedidos/$id"
                params={{ id: p.id }}
                className="hover:bg-row-hover focus-visible:bg-row-hover flex items-center gap-3 px-5 py-3 outline-none"
              >
                <span className="w-14 shrink-0 font-semibold tabular-nums">#{p.number}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{p.customerName}</span>
                  <span className="text-muted-foreground text-[12.5px]">
                    {new Date(p.createdAt).toLocaleString(tienda.locale, {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </span>
                <span className="whitespace-nowrap tabular-nums">
                  {formatMoney(p.total, tienda.locale)}
                </span>
                <span className="hidden w-32 justify-end sm:flex">
                  <Badge variant={TONO_DE_PEDIDO[p.status]}>
                    {ETIQUETA_ESTADO_PEDIDO[p.status]}
                  </Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

function LoMasVendido({
  tienda,
  resumen,
  cargando,
  periodo,
}: {
  tienda: TiendaResumen;
  resumen: ResumenDelPeriodo | undefined;
  cargando: boolean;
  periodo: string;
}) {
  const productos = resumen?.topProducts ?? [];
  const maximo = Math.max(1, ...productos.map((p) => p.revenue.amount));

  return (
    <Tarjeta sinRelleno className="min-w-0 flex-[1_1_320px]">
      <div className="flex items-center justify-between gap-3 px-5 pt-[18px] pb-3">
        <h2 className="text-[15px] font-semibold">Lo más vendido</h2>
        <span className="text-muted-foreground text-[13px]">{periodo}</span>
      </div>
      {cargando ? (
        <div className="flex flex-col gap-3 border-t border-[#f0f1f4] p-5">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="bg-muted h-9 animate-pulse rounded-lg" />
          ))}
        </div>
      ) : productos.length === 0 ? (
        <p className="text-muted-foreground border-t border-[#f0f1f4] px-5 py-6 text-sm">
          Todavía no se vendió nada en este período.
        </p>
      ) : (
        <>
          <ul>
            {productos.map((p) => (
              <li
                key={`${p.sku}-${p.title}`}
                className="flex flex-col gap-1.5 border-t border-[#f0f1f4] px-5 py-2.5"
              >
                <span className="flex justify-between gap-2">
                  <span className="truncate font-medium">
                    {p.title}
                    {p.variantTitle && (
                      <span className="text-muted-foreground font-normal"> · {p.variantTitle}</span>
                    )}
                  </span>
                  <span className="text-ink-2 whitespace-nowrap tabular-nums">
                    {formatMoney(p.revenue, tienda.locale)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-1 flex-1 overflow-hidden rounded-sm bg-[#f0f1f4]">
                    <span
                      className="block h-full rounded-sm bg-[#3b5bdb]"
                      style={{ width: `${(p.revenue.amount / maximo) * 100}%` }}
                    />
                  </span>
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                    {p.quantity} u.
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div className="border-t border-[#f0f1f4] px-5 py-3">
            <Link
              to="/analytics"
              className="text-link hover:text-link-hover inline-flex items-center gap-1 text-[13px] font-medium"
            >
              Ver las ventas por producto
              <ArrowRightIcon className="size-3.5" />
            </Link>
          </div>
        </>
      )}
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------
// Una tienda nueva
// ---------------------------------------------------------------------------

function PrimerosPasos({ tareas }: { tareas: TareasDeLaTienda }) {
  const pasos = pasosDeAlta(tareas.alta);
  const hechos = pasos.filter((p) => p.hecho).length;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-muted-foreground mb-1.5 text-[13px]">Tienda nueva</p>
        <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em]">
          Te damos la bienvenida a Pick
        </h1>
        <p className="text-ink-3 mt-2 text-[15px] leading-[22px]">
          {pasos.length} pasos para empezar a vender. Podés hacerlos en cualquier orden.
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <Tarjeta sinRelleno className="min-w-0 flex-[1.6_1_460px]">
          <div className="flex flex-col gap-2.5 px-5 pt-[18px] pb-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[15px] font-semibold">Para abrir la tienda</h2>
              <span className="text-ink-3 text-[13px] tabular-nums">
                {hechos} de {pasos.length}
              </span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-[3px] bg-[#f0f1f4]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={pasos.length}
              aria-valuenow={hechos}
              aria-label="Pasos hechos"
            >
              <div
                className="h-full rounded-[3px] bg-[#3b5bdb] transition-[width] duration-300"
                style={{ width: `${(hechos / pasos.length) * 100}%` }}
              />
            </div>
          </div>
          <ul>
            {pasos.map((p) => (
              <li
                key={p.clave}
                className="flex items-center gap-3.5 border-t border-[#f0f1f4] px-5 py-3.5"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-white',
                    p.hecho ? 'border-[#22a565] bg-[#22a565]' : 'border-[#c8cdd7] bg-white',
                  )}
                >
                  {p.hecho && <CheckIcon className="size-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block font-medium',
                      p.hecho && 'text-muted-foreground line-through',
                    )}
                  >
                    {p.titulo}
                    <span className="sr-only">{p.hecho ? ' (hecho)' : ' (pendiente)'}</span>
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-[13px]">
                    {p.detalle}
                  </span>
                </span>
                {!p.hecho && (
                  <Link to={p.to} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                    {p.accion}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Tarjeta>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <Tarjeta className="flex flex-col gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-[10px] bg-[#edf1fe] text-[#2b47bd]">
              <UploadIcon className="size-[18px]" />
            </span>
            <p className="mt-1 font-semibold">¿Tu catálogo está en una planilla?</p>
            <p className="text-ink-3 text-[13.5px] leading-5">
              Subila entera y revisá los errores antes de importar. Es lo más rápido para catálogos
              grandes.
            </p>
            <Link
              to="/productos/importar"
              className={buttonVariants({ variant: 'outline', className: 'mt-1 self-start' })}
            >
              Importar productos
            </Link>
          </Tarjeta>
          <Tarjeta className="flex flex-col gap-2.5 border-[#e9e4fb] bg-[#fcfbff]">
            <span className="flex size-9 items-center justify-center rounded-[10px] bg-[#f0ebfe] text-[#5f37cf]">
              <CameraIcon className="size-[18px]" />
            </span>
            <p className="mt-1 font-semibold">¿No tenés fotos ni descripciones?</p>
            <p className="text-ink-3 text-[13.5px] leading-5">
              Sacale una foto a cada producto desde el teléfono y la IA propone el fondo limpio y
              los datos. Nada se publica sin tu revisión.
            </p>
            <Link
              to="/productos/camara"
              className={buttonVariants({ variant: 'outline', className: 'mt-1 self-start' })}
            >
              Cargar con la cámara
            </Link>
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
