import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { repositorioAdminClientes } from '@pick/adapter-supabase';
import {
  formatMoney,
  SEGMENTO_RFM,
  type Cohorte,
  type PaginaSegmentos,
  type SegmentoRfm,
} from '@pick/commerce-core';
import { RepeatIcon } from '@/components/iconos';
import {
  Esqueleto,
  EstadoDeError,
  EstadoVacio,
  PaginaAdmin,
  Paginacion,
  Tarjeta,
  TituloDeTarjeta,
} from '@/components/pagina';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { cn } from '@/lib/utils';

const POR_PAGINA = 20;

function porcentaje(parte: number, total: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(
    total === 0 ? 0 : parte / total,
  );
}

/** `2026-04` → «abr 2026». Al mediodía UTC para que ninguna zona lo corra de mes. */
function nombreDelMes(mes: string, locale: string): string {
  return new Date(`${mes}-01T12:00:00Z`).toLocaleDateString(locale, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function fechaCorta(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

/**
 * La tabla de cohortes.
 *
 * Una fila por mes de primera compra y una columna por mes transcurrido, con el
 * porcentaje de la cohorte que volvió a comprar. El mes 0 no se muestra: es el
 * 100 % por definición y es la columna «Clientes». El color va contra el máximo
 * de la tabla y no contra el 100 %, porque la recompra de una tienda real anda
 * entre el 5 y el 30 %, y contra el 100 % toda la tabla sería del mismo gris.
 */
function TablaDeCohortes({ cohortes, locale }: { cohortes: readonly Cohorte[]; locale: string }) {
  const columnas = Math.max(0, ...cohortes.map((c) => c.active.length - 1));
  const maximo = Math.max(
    0.0001,
    ...cohortes.flatMap((c) => c.active.slice(1).map((n) => n / c.customers)),
  );

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">Primera compra</TableHead>
            <TableHead className="w-20 text-right">Clientes</TableHead>
            {Array.from({ length: columnas }, (_, i) => (
              <TableHead key={i} className="w-16 text-center">
                Mes {i + 1}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {cohortes.map((c) => (
            <TableRow key={c.month}>
              <TableCell className="font-medium capitalize">
                {nombreDelMes(c.month, locale)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{c.customers}</TableCell>
              {Array.from({ length: columnas }, (_, i) => {
                const volvieron = c.active[i + 1];
                if (volvieron === undefined) return <TableCell key={i} />;
                const tasa = volvieron / c.customers;
                const intensidad = tasa / maximo;
                // El último mes de cada fila es el que está corriendo.
                const abierto = i + 1 === c.active.length - 1;
                return (
                  <TableCell
                    key={i}
                    title={`${volvieron} de ${c.customers}${abierto ? ' · mes en curso' : ''}`}
                    className={cn(
                      'text-center text-xs tabular-nums',
                      intensidad > 0.55 && 'text-primary-foreground',
                      abierto && 'italic',
                    )}
                    style={{
                      backgroundColor: `color-mix(in oklch, var(--primary) ${Math.round(
                        intensidad * 85,
                      )}%, transparent)`,
                    }}
                  >
                    {porcentaje(volvieron, c.customers, locale)}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Los siete segmentos, como botones que filtran la lista de abajo. */
function Segmentos({
  datos,
  elegido,
  onElegir,
  locale,
}: {
  datos: PaginaSegmentos;
  elegido: SegmentoRfm | null;
  onElegir: (s: SegmentoRfm | null) => void;
  locale: string;
}) {
  const clientes = datos.segments.reduce((s, x) => s + x.customers, 0);
  const facturado = datos.segments.reduce((s, x) => s + x.revenue.amount, 0);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {datos.segments.map((s) => {
        const activo = elegido === s.segment;
        return (
          <button
            key={s.segment}
            type="button"
            aria-pressed={activo}
            onClick={() => onElegir(activo ? null : s.segment)}
            className={cn(
              'bg-card border-border focus-visible:ring-ring flex cursor-pointer flex-col gap-1 rounded-xl border p-4 text-left shadow-xs transition-colors outline-none focus-visible:ring-2',
              'hover:border-primary/50',
              activo && 'border-primary ring-primary ring-1',
            )}
          >
            <span className="text-sm font-medium">{SEGMENTO_RFM[s.segment].etiqueta}</span>
            <span className="text-2xl font-semibold tabular-nums">{s.customers}</span>
            <span className="text-muted-foreground text-xs">
              {porcentaje(s.customers, clientes, locale)} de los clientes ·{' '}
              {porcentaje(s.revenue.amount, facturado, locale)} de lo facturado
            </span>
            <span className="text-muted-foreground mt-1 text-xs">
              {SEGMENTO_RFM[s.segment].descripcion}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Quién vuelve y quién no.
 *
 * Aparte de Clientes y de Analytics por lo mismo que ADR-067 separa esas dos:
 * esto sale de los **pedidos** —sin los cancelados— y no de los eventos, y la
 * pregunta no es «quién compró» sino «quién volvió». Las cuentas viven en SQL
 * (ADR-134); acá se dibujan.
 */
export function Recurrencia() {
  const tienda = useTiendaActiva();
  const repositorio = useMemo(() => repositorioAdminClientes(db), []);
  // La zona de quien mira: es la misma con la que el resto del Admin decide qué
  // es «hoy», y la que corta los meses de las cohortes.
  const zona = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const [segmento, setSegmento] = useState<SegmentoRfm | null>(null);
  const [page, setPage] = useState(1);

  const cohortes = useQuery({
    queryKey: ['cohortes', tienda.id, zona],
    queryFn: () => repositorio.cohortes(tienda.id, zona),
  });

  const segmentos = useQuery({
    queryKey: ['segmentos', tienda.id, segmento, page],
    queryFn: () =>
      repositorio.segmentos(tienda.id, {
        ...(segmento ? { segmento } : {}),
        page,
        perPage: POR_PAGINA,
      }),
    placeholderData: keepPreviousData,
  });

  const datos = segmentos.data;
  const sinCompras = datos !== undefined && datos.segments.every((s) => s.customers === 0);

  return (
    <PaginaAdmin
      titulo="Recurrencia"
      icono={RepeatIcon}
      descripcion="Quién vuelve a comprar y quién no. Sale de los pedidos, sin los cancelados."
    >
      <Tarjeta sinRelleno>
        <TituloDeTarjeta>Cohortes por mes de primera compra</TituloDeTarjeta>
        {cohortes.isError ? (
          <EstadoDeError
            titulo="No se pudieron cargar las cohortes"
            error={cohortes.error as Error}
            onReintentar={() => void cohortes.refetch()}
          />
        ) : cohortes.isPending ? (
          <Esqueleto filas={6} />
        ) : cohortes.data.cohorts.length === 0 ? (
          <EstadoVacio titulo="Todavía no hay cohortes">
            Aparecen con el primer pedido: cada mes agrupa a quienes compraron por primera vez en
            él.
          </EstadoVacio>
        ) : (
          <>
            <TablaDeCohortes cohortes={cohortes.data.cohorts} locale={tienda.locale} />
            <p className="text-muted-foreground border-border border-t px-4 py-3 text-xs">
              Qué parte de cada cohorte volvió a comprar en cada mes siguiente. El último de cada
              fila, en cursiva, es el mes en curso. Meses en {cohortes.data.timeZone}.
            </p>
          </>
        )}
      </Tarjeta>

      {segmentos.isError ? (
        <Tarjeta sinRelleno>
          <EstadoDeError
            titulo="No se pudieron cargar los segmentos"
            error={segmentos.error as Error}
            onReintentar={() => void segmentos.refetch()}
          />
        </Tarjeta>
      ) : segmentos.isPending ? (
        <Tarjeta sinRelleno>
          <Esqueleto filas={4} />
        </Tarjeta>
      ) : sinCompras ? (
        <Tarjeta sinRelleno>
          <EstadoVacio titulo="Todavía no hay clientes con compras">
            Los segmentos se arman con la recencia y la frecuencia de cada cliente.
          </EstadoVacio>
        </Tarjeta>
      ) : (
        <>
          <Segmentos
            datos={datos!}
            elegido={segmento}
            onElegir={(s) => {
              setSegmento(s);
              setPage(1);
            }}
            locale={tienda.locale}
          />

          <Tarjeta sinRelleno>
            <TituloDeTarjeta>
              {segmento ? SEGMENTO_RFM[segmento].etiqueta : 'Todos los clientes con compras'}
            </TituloDeTarjeta>
            <div className="overflow-x-auto" aria-busy={segmentos.isFetching}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    {!segmento && <TableHead className="w-40">Segmento</TableHead>}
                    <TableHead className="w-24 text-right">Pedidos</TableHead>
                    <TableHead className="w-40 pr-6 text-right">Total comprado</TableHead>
                    <TableHead className="w-32">Última compra</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className={cn(segmentos.isFetching && 'opacity-60')}>
                  {datos!.items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="p-0">
                        <EstadoVacio titulo="Nadie en este segmento">
                          Con esta historia de compras, ningún cliente cae acá.
                        </EstadoVacio>
                      </TableCell>
                    </TableRow>
                  ) : (
                    datos!.items.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Link
                            to="/clientes/$id"
                            params={{ id: c.id }}
                            className="flex flex-col gap-0.5 hover:underline"
                          >
                            <span className="font-medium">{c.name}</span>
                            <span className="text-muted-foreground text-xs">{c.email}</span>
                          </Link>
                        </TableCell>
                        {!segmento && (
                          <TableCell>
                            <Badge variant="secondary">{SEGMENTO_RFM[c.segment].etiqueta}</Badge>
                          </TableCell>
                        )}
                        <TableCell className="text-right tabular-nums">{c.orderCount}</TableCell>
                        <TableCell className="pr-6 text-right tabular-nums">
                          {formatMoney(c.totalSpent, tienda.locale)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {fechaCorta(c.lastOrderAt, tienda.locale)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <Paginacion
              datos={datos!}
              sustantivo="clientes"
              cargando={segmentos.isFetching}
              onPagina={setPage}
            />
          </Tarjeta>
        </>
      )}
    </PaginaAdmin>
  );
}
