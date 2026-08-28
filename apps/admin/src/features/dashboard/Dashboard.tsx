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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
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

function Metrica({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-muted-foreground text-sm font-medium">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{valor}</p>
        {nota && <p className="text-muted-foreground mt-1 text-xs">{nota}</p>}
      </CardContent>
    </Card>
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

  if (consulta.isError) {
    return (
      <div className="border-destructive/40 flex flex-col items-start gap-3 rounded-lg border p-6">
        <p className="text-sm">No se pudo cargar el resumen.</p>
        <p className="text-muted-foreground text-xs">{(consulta.error as Error).message}</p>
        <Button variant="outline" size="sm" onClick={() => void consulta.refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-lg font-semibold">{tienda.name}</h1>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="periodo">Período</Label>
          <select
            id="periodo"
            value={periodo}
            onChange={(e) => setPeriodo(e.currentTarget.value as Periodo)}
            className="border-border bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 cursor-pointer rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3"
          >
            {PERIODOS.map((p) => (
              <option key={p} value={p}>
                {ETIQUETA_PERIODO[p]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {consulta.isPending ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="bg-muted h-28 animate-pulse rounded-xl" />
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
              <Metrica
                titulo="Ticket promedio"
                valor={formatMoney(datos.aov, tienda.locale)}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Por estado</CardTitle>
                </CardHeader>
                <CardContent>
                  {estados.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      Sin pedidos en {ETIQUETA_PERIODO[periodo].toLowerCase()}.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {estados.map(([estado, n]) => (
                        <li key={estado} className="flex items-center justify-between gap-3">
                          <Badge className="border-transparent bg-muted text-muted-foreground">
                            {ETIQUETA_ESTADO_PEDIDO[estado] ?? estado}
                          </Badge>
                          <span className="text-sm tabular-nums">{n}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Lo más vendido</CardTitle>
                </CardHeader>
                <CardContent>
                  {datos.topProducts.length === 0 ? (
                    <p className="text-muted-foreground text-sm">Todavía no se vendió nada.</p>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {datos.topProducts.map((p) => (
                        <li key={p.sku} className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 text-sm">
                            <span className="truncate">{p.title}</span>
                            {p.variantTitle && (
                              <span className="text-muted-foreground"> · {p.variantTitle}</span>
                            )}
                          </span>
                          <span className="shrink-0 text-sm tabular-nums">
                            {p.quantity} ·{' '}
                            <span className="text-muted-foreground">
                              {formatMoney(p.revenue, tienda.locale)}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium">Últimos pedidos</h2>
                <Link to="/pedidos" className="text-muted-foreground text-sm hover:underline">
                  Ver todos
                </Link>
              </div>

              <div className="border-border overflow-x-auto rounded-lg border">
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
                        <TableCell colSpan={4} className="py-10 text-center">
                          <p className="text-muted-foreground text-sm">Todavía no hay pedidos.</p>
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
                            <Badge className="border-transparent bg-muted text-muted-foreground">
                              {ETIQUETA_ESTADO_PEDIDO[p.status] ?? p.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </section>
          </>
        )
      )}
    </div>
  );
}
