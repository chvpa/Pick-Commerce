import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { repositorioDashboard } from '@pick/adapter-supabase';
import {
  ETIQUETA_ESTADO_PEDIDO,
  ETIQUETA_PERIODO,
  formatMoney,
  rangoDePeriodo,
  type Periodo,
} from '@pick/commerce-core';
import type { OrderStatus } from '@pick/commerce-types';
import { LayoutDashboardIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EstadoDeError, PaginaAdmin, SELECT, Tarjeta, TituloDeTarjeta } from '@/components/pagina';
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
        <select
          value={periodo}
          onChange={(e) => setPeriodo(e.currentTarget.value as Periodo)}
          className={SELECT}
          aria-label="Período"
        >
          {PERIODOS.map((p) => (
            <option key={p} value={p}>
              {ETIQUETA_PERIODO[p]}
            </option>
          ))}
        </select>
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
              className="grid gap-4 sm:grid-cols-3"
              aria-busy={consulta.isFetching ? 'true' : undefined}
            >
              <Metrica
                titulo="Ventas"
                valor={formatMoney(datos.sales, tienda.locale)}
                nota="Sin los pedidos cancelados"
              />
              <Metrica titulo="Pedidos" valor={String(datos.orderCount)} />
              <Metrica titulo="Ticket promedio" valor={formatMoney(datos.aov, tienda.locale)} />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
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

              <Tarjeta sinRelleno>
                <TituloDeTarjeta>Lo más vendido</TituloDeTarjeta>
                {datos.topProducts.length === 0 ? (
                  <p className="text-muted-foreground px-4 py-6 text-sm">
                    Todavía no se vendió nada.
                  </p>
                ) : (
                  <ul className="divide-border divide-y">
                    {datos.topProducts.map((p) => (
                      <li
                        key={p.sku}
                        className="flex items-baseline justify-between gap-3 px-4 py-2.5"
                      >
                        <span className="min-w-0 truncate text-sm">
                          {p.title}
                          {p.variantTitle && (
                            <span className="text-muted-foreground"> · {p.variantTitle}</span>
                          )}
                        </span>
                        <span className="shrink-0 text-sm tabular-nums">
                          {`${p.quantity} · `}
                          <span className="text-muted-foreground">
                            {formatMoney(p.revenue, tienda.locale)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Tarjeta>
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
