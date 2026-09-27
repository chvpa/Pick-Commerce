import { useMemo, useState } from 'react';
import Papa from 'papaparse';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { repositorioDashboard } from '@pick/adapter-supabase';
import {
  ETIQUETA_ESTADO_PEDIDO,
  ETIQUETA_MODO,
  ETIQUETA_PERIODO,
  formatMoney,
  rangoDePeriodo,
  type ModoDeRendimiento,
  type Periodo,
} from '@pick/commerce-core';
import type { OrderStatus } from '@pick/commerce-types';
import { LayoutDashboardIcon } from '@/components/iconos';
import { Badge } from '@/components/ui/badge';
import {
  Esqueleto,
  EstadoDeError,
  PaginaAdmin,
  Paginacion,
  Selector,
  Tarjeta,
  TituloDeTarjeta,
} from '@/components/pagina';
import { Button } from '@/components/ui/button';
import { descargar } from '@/lib/descargar';
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
import { SelectItem } from '@/components/ui/select';
import { ResumenConIA } from './ResumenConIA';

const PERIODOS: readonly Periodo[] = ['hoy', '7d', '30d'];

function fecha(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Un número grande con su rótulo arriba.
 *
 * El rótulo va **antes** y en chico, el número después y en grande: es el orden
 * en que se lee una métrica —qué es, cuánto vale— y el que usa Shopify. Al revés
 * hay que volver a subir la vista para saber qué se está mirando.
 */
function Metrica({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <Tarjeta>
      <p className="text-muted-foreground text-sm">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{valor}</p>
      {nota && <p className="text-muted-foreground mt-1 text-xs">{nota}</p>}
    </Tarjeta>
  );
}

/** Una tasa en tanto por uno, como porcentaje legible. */
function porcentaje(tasa: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(tasa);
}

const POR_PAGINA = 10;

/**
 * Qué se vendió, y qué no.
 *
 * Las dos preguntas en una tabla porque son la misma mirada desde dos lados: qué
 * conviene reponer y qué está inmovilizando plata. Separarlas en dos tarjetas
 * obligaría a comparar entre dos listas que nunca están a la misma altura.
 *
 * Reemplazó al «Lo más vendido» de la Fase 6, que era un top cinco sin
 * paginación: servía para mirar de reojo y no para decidir nada. Éste pagina, se
 * exporta, y trae el margen por producto.
 */
function VentasPorProducto({
  rango,
  periodo,
}: {
  rango: { from: string; to: string };
  periodo: Periodo;
}) {
  const tienda = useTiendaActiva();
  const [modo, setModo] = useState<ModoDeRendimiento>('vendidos');
  const [page, setPage] = useState(1);

  const consulta = useQuery({
    queryKey: ['rendimiento', tienda.id, periodo, modo, page],
    queryFn: () =>
      repositorioDashboard(db).rendimiento(tienda.id, rango.from, rango.to, modo, page, POR_PAGINA),
    placeholderData: keepPreviousData,
  });

  /*
   * El export recorre la paginación, como el del catálogo.
   *
   * No se pide «todo de una» ni acá ni en el RPC: un catálogo real no entra en
   * una respuesta, y la regla de ADR-024 no tiene una excepción para los
   * informes.
   */
  const exportar = useMutation({
    mutationFn: async () => {
      const repo = repositorioDashboard(db);
      const filas: Record<string, string | number>[] = [];

      for (let p = 1; ; p += 1) {
        const lote = await repo.rendimiento(tienda.id, rango.from, rango.to, modo, p, 100);
        filas.push(
          ...lote.items.map((f) => ({
            sku: f.sku,
            producto: f.title,
            variante: f.variantTitle ?? '',
            unidades: f.unidades,
            ingresos: f.ingresos.amount,
            // Vacío y no cero cuando no hay costo: en una planilla, un cero se
            // suma y miente el total.
            margen: f.margen ? f.margen.amount : '',
            stock: f.stock ?? '',
            moneda: f.ingresos.currency,
          })),
        );
        if (lote.page >= lote.pageCount) break;
      }

      descargar(
        `ventas-${tienda.slug}-${modo}-${rango.from.slice(0, 10)}.csv`,
        Papa.unparse(filas, {
          columns: [
            'sku',
            'producto',
            'variante',
            'unidades',
            'ingresos',
            'margen',
            'stock',
            'moneda',
          ],
        }),
      );
    },
  });

  const datos = consulta.data;

  return (
    <Tarjeta sinRelleno>
      <TituloDeTarjeta
        accion={
          <div className="flex items-center gap-2">
            <Selector
              value={modo}
              onValueChange={(valor) => {
                setModo(valor as ModoDeRendimiento);
                setPage(1);
              }}
              aria-label="Qué mostrar"
            >
              {(['vendidos', 'sin_movimiento'] as const).map((m) => (
                <SelectItem key={m} value={m}>
                  {ETIQUETA_MODO[m]}
                </SelectItem>
              ))}
            </Selector>
            <Button
              variant="outline"
              size="sm"
              disabled={exportar.isPending || !datos || datos.total === 0}
              onClick={() => exportar.mutate()}
            >
              {exportar.isPending ? 'Exportando…' : 'Exportar CSV'}
            </Button>
          </div>
        }
      >
        Ventas por producto
      </TituloDeTarjeta>

      {exportar.isError && (
        <p className="text-destructive border-b px-4 py-3 text-sm" role="alert">
          {(exportar.error as Error).message}
        </p>
      )}

      {consulta.isError ? (
        <EstadoDeError
          titulo="No se pudieron cargar las ventas por producto"
          error={consulta.error as Error}
          onReintentar={() => void consulta.refetch()}
        />
      ) : consulta.isPending ? (
        <Esqueleto />
      ) : datos && datos.items.length === 0 ? (
        <p className="text-muted-foreground px-4 py-6 text-sm">
          {modo === 'vendidos'
            ? 'Todavía no se vendió nada en este período.'
            : 'Todo lo publicado vendió al menos una unidad.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                {modo === 'vendidos' ? (
                  <>
                    <TableHead className="text-right">Unidades</TableHead>
                    <TableHead className="text-right">Ingresos</TableHead>
                    <TableHead className="text-right">Margen</TableHead>
                  </>
                ) : (
                  <TableHead className="text-right">Sin vender</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {datos?.items.map((f) => (
                <TableRow key={f.sku}>
                  <TableCell>
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium">
                        {f.title}
                        {f.variantTitle && (
                          <span className="text-muted-foreground font-normal">
                            {' · '}
                            {f.variantTitle}
                          </span>
                        )}
                      </span>
                      <span className="text-muted-foreground font-mono text-xs">{f.sku}</span>
                    </span>
                  </TableCell>
                  {modo === 'vendidos' ? (
                    <>
                      <TableCell className="text-right tabular-nums">{f.unidades}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(f.ingresos, tienda.locale)}
                      </TableCell>
                      {/*
                        Un guion y no un cero: este producto no tiene costo
                        cargado, que es distinto de haberlo vendido sin ganancia.
                      */}
                      <TableCell className="text-muted-foreground text-right tabular-nums">
                        {f.margen ? formatMoney(f.margen, tienda.locale) : '—'}
                      </TableCell>
                    </>
                  ) : (
                    <TableCell className="text-right tabular-nums">{f.stock ?? 0}</TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {datos && (
        <Paginacion
          datos={datos}
          sustantivo="productos"
          cargando={consulta.isFetching}
          onPagina={setPage}
        />
      )}
    </Tarjeta>
  );
}

/**
 * El resumen con el que abre el Admin.
 *
 * Responde "cuánto vendí", no "cuánta gente miró": todo sale de los pedidos que
 * ya están en la base. La conversión, las búsquedas sin resultado y el resto de
 * lo que necesita seguimiento de eventos son de Fase 10, y no se insinúan acá
 * para no prometer un número que este panel no calcula.
 */
export function Dashboard() {
  const tienda = useTiendaActiva();
  const [periodo, setPeriodo] = useState<Periodo>('30d');

  // El rango se recalcula sólo al cambiar de período, no en cada render: con
  // `new Date()` suelto, cada render daría una clave distinta y la consulta no
  // pararía de repetirse.
  const rango = useMemo(() => rangoDePeriodo(periodo, new Date()), [periodo]);

  const consulta = useQuery({
    queryKey: ['dashboard', tienda.id, periodo],
    queryFn: () => repositorioDashboard(db).resumen(tienda.id, rango.from, rango.to),
    placeholderData: keepPreviousData,
  });

  const datos = consulta.data;
  const estados = Object.entries(datos?.byStatus ?? {}) as [OrderStatus, number][];

  return (
    <PaginaAdmin
      titulo="Resumen"
      icono={LayoutDashboardIcon}
      descripcion={`${tienda.name} · sale de los pedidos, no de las visitas.`}
      acciones={
        <Selector
          value={periodo}
          onValueChange={(valor) => setPeriodo(valor as Periodo)}
          aria-label="Período"
        >
          {PERIODOS.map((p) => (
            <SelectItem key={p} value={p}>
              {ETIQUETA_PERIODO[p]}
            </SelectItem>
          ))}
        </Selector>
      }
    >
      {consulta.isError ? (
        <Tarjeta sinRelleno>
          <EstadoDeError
            titulo="No se pudo cargar el resumen"
            error={consulta.error as Error}
            onReintentar={() => void consulta.refetch()}
          />
        </Tarjeta>
      ) : consulta.isPending ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="bg-muted h-24 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : (
        datos && (
          <>
            <div
              className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5"
              aria-busy={consulta.isFetching ? 'true' : undefined}
            >
              <Metrica
                titulo="Ventas"
                valor={formatMoney(datos.sales, tienda.locale)}
                nota="Sin los pedidos cancelados"
              />
              <Metrica titulo="Pedidos" valor={String(datos.orderCount)} />
              <Metrica titulo="Unidades" valor={String(datos.units)} />
              <Metrica titulo="Ticket promedio" valor={formatMoney(datos.aov, tienda.locale)} />
              {/*
                El margen **nunca** va solo: al lado va qué fracción de los
                ingresos tiene costo conocido. Con la mitad del catálogo sin
                costo cargado, sumar sólo lo que lo tiene da el doble de lo real
                y parece excelente. Y sin nada cargado se muestra un guion en vez
                de un cero, porque cero es un margen y «no sé» no lo es.
              */}
              <Metrica
                titulo="Margen"
                valor={datos.margin ? formatMoney(datos.margin, tienda.locale) : '—'}
                nota={
                  datos.margin
                    ? `Sobre el ${porcentaje(datos.marginCoverage, tienda.locale)} de los ingresos, que es lo que tiene costo cargado`
                    : 'Ningún producto vendido tiene costo cargado'
                }
              />
            </div>

            <ResumenConIA rango={rango} periodo={periodo} ventas={datos} />

            <div className="grid items-start gap-5 lg:grid-cols-[20rem_1fr]">
              <Tarjeta sinRelleno>
                <TituloDeTarjeta>Por estado</TituloDeTarjeta>
                {estados.length === 0 ? (
                  <p className="text-muted-foreground px-4 py-6 text-sm">
                    Sin pedidos en {ETIQUETA_PERIODO[periodo].toLowerCase()}.
                  </p>
                ) : (
                  <ul className="divide-border divide-y">
                    {estados.map(([estado, n]) => (
                      <li
                        key={estado}
                        className="flex items-center justify-between gap-3 px-4 py-2.5"
                      >
                        <Badge className="bg-muted text-muted-foreground border-transparent">
                          {ETIQUETA_ESTADO_PEDIDO[estado] ?? estado}
                        </Badge>
                        <span className="text-sm tabular-nums">{n}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Tarjeta>

              <VentasPorProducto rango={rango} periodo={periodo} />
            </div>

            <Tarjeta sinRelleno>
              <TituloDeTarjeta
                accion={
                  <Link to="/pedidos" className="text-muted-foreground text-sm hover:underline">
                    Ver todos
                  </Link>
                }
              >
                Últimos pedidos
              </TituloDeTarjeta>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {datos.recent.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-muted-foreground py-10 text-center text-sm"
                        >
                          Todavía no hay pedidos.
                        </TableCell>
                      </TableRow>
                    ) : (
                      datos.recent.map((p) => (
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
                          <TableCell className="text-right tabular-nums">
                            {formatMoney(p.total, tienda.locale)}
                          </TableCell>
                          <TableCell>
                            <Badge className="bg-muted text-muted-foreground border-transparent">
                              {ETIQUETA_ESTADO_PEDIDO[p.status] ?? p.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Tarjeta>
          </>
        )
      )}
    </PaginaAdmin>
  );
}
