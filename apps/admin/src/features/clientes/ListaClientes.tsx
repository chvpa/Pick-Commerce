import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Papa from 'papaparse';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { Link, useSearch } from '@tanstack/react-router';
import { repositorioAdminClientes } from '@pick/adapter-supabase';
import {
  ETIQUETA_PERIODO,
  SEGMENTOS_RFM,
  SEGMENTO_RFM,
  formatMoney,
  nuevosPorMes,
  rangoDePeriodo,
  resumenDeRecurrencia,
  type Periodo,
  type SegmentoRfm,
} from '@pick/commerce-core';
import { TONO_DE_SEGMENTO } from '@/components/estados';
import { DownloadIcon } from '@/components/iconos';
import {
  CampoDeBusqueda,
  Esqueleto,
  EstadoDeError,
  EstadoVacio,
  FiltroAgregable,
  PaginaAdmin,
  Paginacion,
  Pestanas,
  Tarjeta,
} from '@/components/pagina';
import { PUNTO_DE_TONO } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { haceCuanto } from '@/features/dashboard/tareas';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { descargar } from '@/lib/descargar';
import { db } from '@/lib/supabase';
import { cn } from '@/lib/utils';

const POR_PAGINA = 20;

type Pestana = 'todos' | SegmentoRfm;

const PERIODOS: readonly { readonly valor: Periodo; readonly etiqueta: string }[] = [
  { valor: 'hoy', etiqueta: ETIQUETA_PERIODO.hoy },
  { valor: '7d', etiqueta: ETIQUETA_PERIODO['7d'] },
  { valor: '30d', etiqueta: ETIQUETA_PERIODO['30d'] },
];

/** Los colores de las iniciales, como el handoff: se reparten por posición. */
const AVATARES: readonly [string, string][] = [
  ['#e8f6ee', '#13774a'],
  ['#edf1fe', '#2b47bd'],
  ['#fdf4e3', '#9a5b0b'],
  ['#f2eefe', '#5f37cf'],
  ['#fdeceb', '#bf3324'],
];

/** Una fila, venga de la lista de todos o de un segmento. */
interface Fila {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly orderCount: number;
  readonly totalSpent: { readonly amount: number; readonly currency: string };
  readonly lastOrderAt?: string;
}

/** `YYYY-MM` del mes en curso, en la zona con la que se cortaron las cohortes. */
function mesEnCurso(zona: string): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${valor('year')}-${valor('month')}`;
}

function nombreDelMes(mes: string, locale: string, largo = false): string {
  const [anio, numero] = mes.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(anio, numero - 1, 15)).toLocaleString(locale, {
    month: largo ? 'long' : 'short',
    timeZone: 'UTC',
  });
}

/**
 * Los clientes, como los dibuja el handoff (ADR-143, ADR-150).
 *
 * Arriba, tres números que dicen si la tienda retiene: cuántos compraron y cuántos
 * nuevos por mes, cuántos volvieron, y cuánto gasta cada grupo. Salen de los
 * segmentos y de las cohortes que ya existían (ADR-134): ninguna consulta nueva.
 *
 * Las pestañas son los siete segmentos RFM, que antes vivían en «Recurrencia».
 * Esa pantalla sigue, con la tabla de cohortes, a un clic desde la tarjeta.
 */
export function ListaClientes() {
  const tienda = useTiendaActiva();
  const { tab } = useSearch({ from: '/clientes' });
  const pestana: Pestana = tab ?? 'todos';
  const repositorio = useMemo(() => repositorioAdminClientes(db), []);
  const zona = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [texto, setTexto] = useState('');
  const [query, setQuery] = useState('');
  const [periodo, setPeriodo] = useState<Periodo | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const id = setTimeout(() => setQuery(texto.trim()), 300);
    return () => clearTimeout(id);
  }, [texto]);

  // Otra pestaña u otra búsqueda: la página era de la lista anterior.
  const clave = JSON.stringify([pestana, query, periodo]);
  const [claveVista, setClaveVista] = useState(clave);
  if (clave !== claveVista) {
    setClaveVista(clave);
    setPage(1);
  }

  // Los siete segmentos con su cuenta: la cabecera y los números de las pestañas.
  const resumen = useQuery({
    queryKey: ['segmentos', tienda.id, 'resumen'],
    queryFn: () => repositorio.segmentos(tienda.id, { page: 1, perPage: 1 }),
  });
  // La misma consulta que «Recurrencia»: si ya se abrió, no se pide de nuevo.
  const cohortes = useQuery({
    queryKey: ['cohortes', tienda.id, zona],
    queryFn: () => repositorio.cohortes(tienda.id, zona),
  });
  // Cuántos hay en «Todos», sin filtros: incluye a quien tiene ficha sin compras.
  const todos = useQuery({
    queryKey: ['clientes', tienda.id, 'total'],
    queryFn: () => repositorio.listar(tienda.id, { page: 1, perPage: 1 }),
  });

  const rango = periodo ? rangoDePeriodo(periodo, new Date()) : undefined;
  const lista = useQuery({
    queryKey: ['clientes', tienda.id, pestana, query, periodo, page],
    queryFn: async () => {
      if (pestana === 'todos') {
        return repositorio.listar(tienda.id, {
          query,
          page,
          perPage: POR_PAGINA,
          ...(rango ? { desde: rango.from, hasta: rango.to } : {}),
        });
      }
      return repositorio.segmentos(tienda.id, { segmento: pestana, page, perPage: POR_PAGINA });
    },
    placeholderData: keepPreviousData,
  });

  const exportar = useMutation({
    mutationFn: async () => {
      // Recorre las páginas, como el export de pedidos: nunca «todo de una».
      const filas: Record<string, string | number>[] = [];
      for (let p = 1; ; p += 1) {
        const lote =
          pestana === 'todos'
            ? await repositorio.listar(tienda.id, {
                query,
                page: p,
                perPage: 200,
                ...(rango ? { desde: rango.from, hasta: rango.to } : {}),
              })
            : await repositorio.segmentos(tienda.id, { segmento: pestana, page: p, perPage: 200 });
        filas.push(
          ...lote.items.map((c: Fila & { phone?: string }) => ({
            nombre: c.name,
            correo: c.email,
            ...(c.phone ? { telefono: c.phone } : {}),
            pedidos: c.orderCount,
            total: c.totalSpent.amount,
            moneda: c.totalSpent.currency,
            ultima_compra: c.lastOrderAt ?? '',
            ...(pestana === 'todos' ? {} : { segmento: SEGMENTO_RFM[pestana].etiqueta }),
          })),
        );
        if (lote.page >= lote.pageCount) break;
      }
      descargar(
        `clientes-${tienda.slug}-${pestana}-${new Date().toISOString().slice(0, 10)}.csv`,
        Papa.unparse(filas),
      );
    },
  });

  const cuentas = resumen.data ? resumenDeRecurrencia(resumen.data.segments) : null;
  const porSegmento = new Map(resumen.data?.segments.map((s) => [s.segment, s.customers]));
  const filas: readonly Fila[] = lista.data?.items ?? [];

  return (
    <PaginaAdmin
      titulo="Clientes"
      descripcion="Se crean solos con el primer pedido."
      acciones={
        <Button
          variant="outline"
          size="lg"
          disabled={exportar.isPending || filas.length === 0}
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

      <div className="grid gap-4 md:grid-cols-3">
        <Indicador titulo="Clientes que compraron" cargando={!cuentas} error={resumen.isError}>
          {cuentas && (
            <NuevosPorMes
              total={cuentas.clientes}
              meses={
                cohortes.data
                  ? nuevosPorMes(cohortes.data.cohorts, mesEnCurso(cohortes.data.timeZone), 6)
                  : []
              }
            />
          )}
        </Indicador>
        <Indicador titulo="Volvieron a comprar" cargando={!cuentas} error={resumen.isError}>
          {cuentas && <Volvieron tasa={cuentas.tasa} volvieron={cuentas.volvieron} />}
        </Indicador>
        <Indicador titulo="Gasto promedio por cliente" cargando={!cuentas} error={resumen.isError}>
          {cuentas && (
            <Gasto
              promedio={cuentas.gastoPromedio}
              unaVez={cuentas.gastoDeUnaVez}
              volvieron={cuentas.gastoDeLosQueVolvieron}
            />
          )}
        </Indicador>
      </div>

      <Pestanas
        etiqueta="Clientes por segmento"
        to="/clientes"
        activa={pestana}
        pestanas={[
          {
            valor: 'todos' as const,
            etiqueta: 'Todos',
            ...(todos.data ? { cuenta: todos.data.total } : {}),
          },
          ...SEGMENTOS_RFM.map((s) => ({
            valor: s,
            etiqueta: SEGMENTO_RFM[s].etiqueta,
            ...(porSegmento.has(s) ? { cuenta: porSegmento.get(s)! } : {}),
          })),
        ]}
      />

      {pestana === 'todos' ? (
        <div className="flex flex-wrap items-center gap-2">
          <CampoDeBusqueda
            valor={texto}
            onCambio={setTexto}
            placeholder="Nombre, correo o teléfono"
            etiqueta="Buscar clientes"
          />
          <FiltroAgregable
            etiqueta="Última compra"
            valor={periodo}
            opciones={PERIODOS}
            onCambiar={setPeriodo}
          />
        </div>
      ) : (
        // Un segmento se define por su regla: se dice cuál, en vez de filtros.
        <p className="text-ink-3 flex items-center gap-2 text-sm">
          <span
            aria-hidden="true"
            className="size-2 rounded-full"
            style={{ background: PUNTO_DE_TONO[TONO_DE_SEGMENTO[pestana]] }}
          />
          {SEGMENTO_RFM[pestana].descripcion}
        </p>
      )}

      <Tarjeta sinRelleno>
        {lista.isError ? (
          <EstadoDeError
            titulo="No se pudieron cargar los clientes"
            error={lista.error as Error}
            onReintentar={() => void lista.refetch()}
          />
        ) : lista.isPending ? (
          <Esqueleto filas={6} />
        ) : filas.length === 0 ? (
          <EstadoVacio
            titulo={
              query || periodo
                ? 'Ningún cliente coincide'
                : pestana === 'todos'
                  ? 'Todavía no hay clientes'
                  : 'Nadie en este segmento'
            }
          >
            {query || periodo
              ? 'Probá con otro nombre, correo o teléfono, o sacá el filtro.'
              : pestana === 'todos'
                ? 'Aparecen acá con su primer pedido.'
                : 'Cuando alguien cumpla la regla, aparece acá.'}
          </EstadoVacio>
        ) : (
          <ul aria-label="Clientes" aria-busy={lista.isFetching}>
            {filas.map((c, i) => (
              <FilaDeCliente
                key={c.id}
                cliente={c}
                colores={AVATARES[i % AVATARES.length]!}
                segmento={pestana === 'todos' ? undefined : pestana}
              />
            ))}
          </ul>
        )}
        {lista.data && (
          <Paginacion
            datos={lista.data}
            sustantivo="clientes"
            cargando={lista.isFetching}
            onPagina={setPage}
          />
        )}
      </Tarjeta>
    </PaginaAdmin>
  );
}

function Indicador({
  titulo,
  cargando,
  error,
  children,
}: {
  titulo: string;
  cargando: boolean;
  error: boolean;
  children: ReactNode;
}) {
  return (
    <Tarjeta className="flex flex-col gap-3">
      <p className="text-ink-3 text-[13px] font-medium">{titulo}</p>
      {error ? (
        <p className="text-ink-3 text-sm">No se pudo calcular.</p>
      ) : cargando ? (
        <div className="bg-muted h-20 animate-pulse rounded-lg" />
      ) : (
        children
      )}
    </Tarjeta>
  );
}

function NuevosPorMes({
  total,
  meses,
}: {
  total: number;
  meses: readonly { mes: string; nuevos: number }[];
}) {
  const tienda = useTiendaActiva();
  const maximo = Math.max(1, ...meses.map((m) => m.nuevos));
  const mejor = meses.reduce<{ mes: string; nuevos: number } | null>(
    (a, m) => (m.nuevos > (a?.nuevos ?? 0) ? m : a),
    null,
  );
  const ultimo = meses.at(-1);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[26px] leading-8 font-semibold tabular-nums">
        {total.toLocaleString(tienda.locale)}
      </p>
      {meses.length > 0 && (
        <>
          <div className="flex h-12 items-end gap-1.5" aria-hidden="true">
            {meses.map((m, i) => (
              <span
                key={m.mes}
                title={`${m.nuevos} nuevos en ${nombreDelMes(m.mes, tienda.locale)}`}
                className={cn(
                  'flex-1 rounded-t-[3px]',
                  i === meses.length - 1 ? 'bg-[#3b5bdb]' : 'bg-[#dfe5fb]',
                )}
                style={{ height: `${Math.max(4, (m.nuevos / maximo) * 100)}%` }}
              />
            ))}
          </div>
          <div className="text-ink-faint flex gap-1.5 text-[11px]" aria-hidden="true">
            {meses.map((m) => (
              <span key={m.mes} className="flex-1 text-center">
                {nombreDelMes(m.mes, tienda.locale)}
              </span>
            ))}
          </div>
          {ultimo && (
            <p className="text-ink-3 text-[12.5px]">
              {ultimo.nuevos} {ultimo.nuevos === 1 ? 'nuevo' : 'nuevos'} en{' '}
              {nombreDelMes(ultimo.mes, tienda.locale, true)}
              {mejor && mejor.mes === ultimo.mes && ultimo.nuevos > 0 ? ', el mejor mes' : ''}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Volvieron({ tasa, volvieron }: { tasa: number; volvieron: number }) {
  const tienda = useTiendaActiva();
  const llenos = Math.round(tasa * 20);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[26px] leading-8 font-semibold tabular-nums">
        {new Intl.NumberFormat(tienda.locale, {
          style: 'percent',
          maximumFractionDigits: 1,
        }).format(tasa)}
      </p>
      <div className="flex gap-1" aria-hidden="true">
        {Array.from({ length: 20 }, (_, i) => (
          <span
            key={i}
            className={cn('h-5 flex-1 rounded-[3px]', i < llenos ? 'bg-[#3b5bdb]' : 'bg-[#eceef2]')}
          />
        ))}
      </div>
      <p className="text-ink-3 text-[12.5px]">
        {volvieron === 0
          ? 'Nadie volvió a comprar todavía'
          : tasa >= 1
            ? 'Todos volvieron a comprar'
            : /*
               * «1 de cada 4» se lee mejor que un porcentaje, pero con más de la
               * mitad mentiría: 66 % no es «1 de cada 2». Ahí, de cada diez.
               */
              tasa < 0.5
              ? `1 de cada ${Math.round(1 / tasa)} clientes compró más de una vez`
              : `${Math.round(tasa * 10)} de cada 10 clientes compraron más de una vez`}
        {' · '}
        <Link to="/clientes/recurrencia" className="text-link hover:underline">
          Ver por cohorte
        </Link>
      </p>
    </div>
  );
}

function Gasto({
  promedio,
  unaVez,
  volvieron,
}: {
  promedio: number;
  unaVez: number;
  volvieron: number;
}) {
  const tienda = useTiendaActiva();
  const dinero = (amount: number) =>
    formatMoney({ amount, currency: tienda.currency as 'PYG' }, tienda.locale);
  const maximo = Math.max(1, unaVez, volvieron);
  const barra = (etiqueta: string, valor: number, color: string) => (
    <div className="flex flex-col gap-1">
      <span className="flex justify-between gap-2 text-[12.5px]">
        <span className="text-ink-3">{etiqueta}</span>
        <span className="font-medium tabular-nums">{dinero(valor)}</span>
      </span>
      <span className="h-1.5 rounded-full bg-[#eceef2]" aria-hidden="true">
        <span
          className="block h-full rounded-full"
          style={{ width: `${(valor / maximo) * 100}%`, background: color }}
        />
      </span>
    </div>
  );
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[26px] leading-8 font-semibold tabular-nums">{dinero(promedio)}</p>
      {barra('Compraron una vez', unaVez, '#c9d4f8')}
      {barra('Volvieron a comprar', volvieron, '#3b5bdb')}
    </div>
  );
}

function FilaDeCliente({
  cliente: c,
  colores,
  segmento,
}: {
  cliente: Fila;
  colores: [string, string];
  segmento?: SegmentoRfm;
}) {
  const tienda = useTiendaActiva();
  const iniciales = c.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  return (
    <li className="hover:bg-row-hover relative flex min-h-[62px] items-center gap-3 border-b border-[#f0f1f4] px-5 py-2 last:border-b-0">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
        style={{ background: colores[0], color: colores[1] }}
      >
        {iniciales}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        {/* Toda la fila lleva a la ficha: el nombre se estira sobre ella. */}
        <Link
          to="/clientes/$id"
          params={{ id: c.id }}
          className="truncate font-medium outline-none after:absolute after:inset-0 focus-visible:after:ring-3 focus-visible:after:ring-[#e4e9fc] focus-visible:after:ring-inset"
        >
          {c.name}
        </Link>
        <span className="text-ink-3 flex min-w-0 items-center gap-1.5 text-[12.5px]">
          {segmento && (
            <>
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: PUNTO_DE_TONO[TONO_DE_SEGMENTO[segmento]] }}
              />
              {SEGMENTO_RFM[segmento].etiqueta} ·
            </>
          )}
          <span className="truncate">{c.email}</span>
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span className="font-medium tabular-nums">
          {formatMoney(c.totalSpent as { amount: number; currency: 'PYG' }, tienda.locale)}
        </span>
        <span className="text-ink-3 text-[12.5px] whitespace-nowrap">
          {c.orderCount} {c.orderCount === 1 ? 'pedido' : 'pedidos'}
          {c.lastOrderAt ? ` · ${haceCuanto(c.lastOrderAt, new Date(), tienda.locale)}` : ''}
        </span>
      </span>
    </li>
  );
}
