import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { repositorioAdminClientes } from '@pick/adapter-supabase';
import { formatMoney } from '@pick/commerce-core';
import { Button } from '@/components/ui/button';
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
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';

const POR_PAGINA = 20;

function fechaCorta(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

/**
 * Los clientes de la tienda.
 *
 * No hay alta ni edición: un cliente se crea al comprar, y lo que declaró en el
 * checkout es lo que el pedido conserva. Editarlo acá reescribiría un dato que
 * el pedido ya copió, y las dos versiones dirían cosas distintas del mismo
 * envío.
 */
export function ListaClientes() {
  const tienda = useTiendaActiva();

  const [texto, setTexto] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const id = setTimeout(() => {
      setQuery(texto);
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [texto]);

  const consulta = useQuery({
    queryKey: ['clientes', tienda.id, query, page],
    queryFn: () =>
      repositorioAdminClientes(db).listar(tienda.id, { query, page, perPage: POR_PAGINA }),
    placeholderData: keepPreviousData,
  });

  const datos = consulta.data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="buscar">Buscar</Label>
        <Input
          id="buscar"
          value={texto}
          onChange={(e) => setTexto(e.currentTarget.value)}
          placeholder="Nombre, correo o teléfono"
          className="w-72"
        />
      </div>

      {consulta.isError ? (
        <div className="border-destructive/40 flex flex-col items-start gap-3 rounded-lg border p-6">
          <p className="text-sm">No se pudieron cargar los clientes.</p>
          <p className="text-muted-foreground text-xs">{(consulta.error as Error).message}</p>
          <Button variant="outline" size="sm" onClick={() => void consulta.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : (
        <div className="border-border overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead className="text-right">Pedidos</TableHead>
                <TableHead className="text-right">Total comprado</TableHead>
                <TableHead>Última compra</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {consulta.isPending ? (
                Array.from({ length: 5 }, (_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}>
                      <div className="bg-muted h-5 w-full animate-pulse rounded" />
                    </TableCell>
                  </TableRow>
                ))
              ) : datos && datos.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center">
                    <p className="text-muted-foreground text-sm">
                      {query
                        ? 'Ningún cliente coincide con la búsqueda.'
                        : 'Todavía no hay clientes. Aparecen con el primer pedido.'}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                datos?.items.map((c) => (
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
                    <TableCell className="tabular-nums">{c.phone}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.orderCount}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(c.totalSpent, tienda.locale)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {c.lastOrderAt ? fechaCorta(c.lastOrderAt, tienda.locale) : '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {datos && datos.pageCount > 1 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {datos.total} clientes · página {datos.page} de {datos.pageCount}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={datos.page <= 1 || consulta.isFetching}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={datos.page >= datos.pageCount || consulta.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
