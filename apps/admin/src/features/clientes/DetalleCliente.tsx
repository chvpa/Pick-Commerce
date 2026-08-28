import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { repositorioAdminClientes, repositorioAdminPedidos } from '@pick/adapter-supabase';
import { ETIQUETA_ESTADO_PEDIDO, formatMoney } from '@pick/commerce-core';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

const POR_PAGINA = 10;

function fecha(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">{etiqueta}</dt>
      <dd className="text-sm">{valor}</dd>
    </div>
  );
}

/**
 * La ficha de un cliente: quién es y qué compró.
 *
 * Sus pedidos salen de `admin_orders` buscando por su correo, que es el campo
 * por el que el checkout identifica a un cliente dentro de la tienda. Reusar esa
 * función y no escribir otra consulta mantiene una sola definición de "cómo se
 * ve un pedido en una lista".
 */
export function DetalleCliente({ id }: { id: string }) {
  const tienda = useTiendaActiva();
  const [page, setPage] = useState(1);

  const cliente = useQuery({
    queryKey: ['cliente', tienda.id, id],
    queryFn: () => repositorioAdminClientes(db).porId(tienda.id, id),
  });

  const pedidos = useQuery({
    queryKey: ['pedidos-de-cliente', tienda.id, cliente.data?.email, page],
    queryFn: () =>
      repositorioAdminPedidos(db).listar(tienda.id, {
        query: cliente.data!.email,
        page,
        perPage: POR_PAGINA,
      }),
    enabled: Boolean(cliente.data?.email),
    placeholderData: keepPreviousData,
  });

  if (cliente.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <div className="bg-muted h-8 w-56 animate-pulse rounded" />
        <div className="bg-muted h-32 animate-pulse rounded-xl" />
      </div>
    );
  }

  if (cliente.isError) {
    return (
      <div className="border-destructive/40 flex flex-col items-start gap-3 rounded-lg border p-6">
        <p className="text-sm">No se pudo cargar el cliente.</p>
        <p className="text-muted-foreground text-xs">{(cliente.error as Error).message}</p>
        <Button variant="outline" size="sm" onClick={() => void cliente.refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (!cliente.data) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm">Este cliente no existe en esta tienda.</p>
        <Link to="/clientes" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Volver a clientes
        </Link>
      </div>
    );
  }

  const c = cliente.data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{c.name}</h2>
          <p className="text-muted-foreground text-sm">
            Cliente desde {fecha(c.createdAt, tienda.locale)}
          </p>
        </div>
        <Link to="/clientes" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Volver
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Contacto</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3">
              <Dato etiqueta="Correo" valor={c.email} />
              <Dato etiqueta="Teléfono" valor={c.phone} />
              {c.taxId && <Dato etiqueta="RUC" valor={c.taxId} />}
              {c.taxName && <Dato etiqueta="Razón social" valor={c.taxName} />}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">Pedidos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{c.orderCount}</p>
            <p className="text-muted-foreground mt-1 text-xs">Sin contar los cancelados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Total comprado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {formatMoney(c.totalSpent, tienda.locale)}
            </p>
          </CardContent>
        </Card>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Sus pedidos</h2>

        {pedidos.isError ? (
          <div className="border-destructive/40 flex flex-col items-start gap-3 rounded-lg border p-6">
            <p className="text-sm">No se pudieron cargar los pedidos.</p>
            <p className="text-muted-foreground text-xs">{(pedidos.error as Error).message}</p>
            <Button variant="outline" size="sm" onClick={() => void pedidos.refetch()}>
              Reintentar
            </Button>
          </div>
        ) : (
          <div className="border-border overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead className="text-right">Ítems</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pedidos.isPending ? (
                  Array.from({ length: 3 }, (_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={4}>
                        <div className="bg-muted h-5 w-full animate-pulse rounded" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : pedidos.data && pedidos.data.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center">
                      <p className="text-muted-foreground text-sm">
                        Este cliente todavía no tiene pedidos.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  pedidos.data?.items.map((p) => (
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
                      <TableCell className="text-right tabular-nums">{p.itemCount}</TableCell>
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
        )}

        {pedidos.data && pedidos.data.pageCount > 1 && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm" aria-live="polite">
              página {pedidos.data.page} de {pedidos.data.pageCount}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pedidos.data.page <= 1 || pedidos.isFetching}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pedidos.data.page >= pedidos.data.pageCount || pedidos.isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
