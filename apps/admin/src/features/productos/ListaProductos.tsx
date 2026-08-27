import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { repositorioAdminCatalogo } from '@pick/adapter-supabase';
import { ETIQUETA_ESTADO, formatMoney } from '@pick/commerce-core';
import type { ProductStatus } from '@pick/commerce-types';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';

const POR_PAGINA = 20;

const ESTADOS: readonly ProductStatus[] = ['draft', 'active', 'inactive', 'archived'];

const TONO: Record<ProductStatus, string> = {
  active: 'border-transparent bg-primary/10 text-primary',
  draft: 'border-transparent bg-muted text-muted-foreground',
  inactive: 'border-transparent bg-muted text-muted-foreground',
  archived: 'border-transparent bg-muted text-muted-foreground line-through',
};

export function ListaProductos() {
  const tienda = useTiendaActiva();
  const cliente = useQueryClient();

  const [texto, setTexto] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ProductStatus | ''>('');
  const [page, setPage] = useState(1);

  // La búsqueda va al servidor: sin esperar, cada tecla sería una consulta.
  useEffect(() => {
    const id = setTimeout(() => {
      setQuery(texto);
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [texto]);

  const consulta = useQuery({
    queryKey: ['productos', tienda.id, query, status, page],
    queryFn: () =>
      repositorioAdminCatalogo(db).listar(tienda.id, {
        query,
        ...(status ? { status } : {}),
        page,
        perPage: POR_PAGINA,
      }),
    // Sin esto la tabla parpadea a vacío en cada página y en cada búsqueda.
    placeholderData: keepPreviousData,
  });

  const archivar = useMutation({
    mutationFn: (id: string) => repositorioAdminCatalogo(db).archivar(tienda.id, id),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['productos', tienda.id] }),
  });

  const datos = consulta.data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="buscar">Buscar</Label>
            <Input
              id="buscar"
              value={texto}
              onChange={(e) => setTexto(e.currentTarget.value)}
              placeholder="Título, marca o SKU"
              className="w-64"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="estado">Estado</Label>
            {/*
              `<select>` nativo: teclado, lectores de pantalla y el selector del
              sistema en mobile ya vienen resueltos, y no cuesta JavaScript.
            */}
            <select
              id="estado"
              value={status}
              onChange={(e) => {
                setStatus(e.currentTarget.value as ProductStatus | '');
                setPage(1);
              }}
              className="border-border bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 cursor-pointer rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3"
            >
              <option value="">Todos</option>
              {ESTADOS.map((e) => (
                <option key={e} value={e}>
                  {ETIQUETA_ESTADO[e]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/*
          Un enlace con pinta de botón, no un `Button` que renderiza un enlace:
          envolverlo en `Button` le pone `role="button"` y un lector de pantalla
          lo anuncia como botón cuando en realidad navega. Las clases dan el
          aspecto; la semántica la da el <a>.
        */}
        <div className="flex gap-2">
          <Link to="/productos/importar" className={buttonVariants({ variant: 'outline' })}>
            Importar / exportar
          </Link>
          <Link to="/productos/nuevo" className={buttonVariants()}>
            Nuevo producto
          </Link>
        </div>
      </div>

      {consulta.isError ? (
        <div className="border-destructive/40 flex flex-col items-start gap-3 rounded-lg border p-6">
          <p className="text-sm">No se pudieron cargar los productos.</p>
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
                <TableHead>Producto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Variantes</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Desde</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {consulta.isPending ? (
                // Skeleton y no un spinner: conserva el alto de la tabla, así la
                // página no salta cuando llegan los datos.
                Array.from({ length: 5 }, (_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <div className="bg-muted h-5 w-full animate-pulse rounded" />
                    </TableCell>
                  </TableRow>
                ))
              ) : datos && datos.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center">
                    <p className="text-muted-foreground text-sm">
                      {query || status
                        ? 'Ningún producto coincide con la búsqueda.'
                        : 'Todavía no hay productos.'}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                datos?.items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {p.imagen ? (
                          <img
                            src={p.imagen}
                            alt=""
                            width={32}
                            height={32}
                            className="bg-muted size-8 rounded object-cover"
                          />
                        ) : (
                          <div className="bg-muted size-8 rounded" />
                        )}
                        <div className="flex flex-col">
                          <Link
                            to="/productos/$id"
                            params={{ id: p.id }}
                            className="font-medium hover:underline"
                          >
                            {p.title}
                          </Link>
                          <span className="text-muted-foreground text-xs">
                            {p.brand ? `${p.brand} · ` : ''}
                            {p.handle}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn(TONO[p.status])}>{ETIQUETA_ESTADO[p.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.variantes}</TableCell>
                    <TableCell
                      className={cn('text-right tabular-nums', p.stock <= 0 && 'text-destructive')}
                    >
                      {p.stock}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.precioDesde === undefined
                        ? '—'
                        : formatMoney(
                            { amount: p.precioDesde, currency: (p.currency ?? 'PYG') as 'PYG' },
                            tienda.locale,
                          )}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.status !== 'archived' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={archivar.isPending}
                          onClick={() => {
                            // Archivar saca el producto del storefront y se puede
                            // deshacer; aun así se confirma, porque la fila de al
                            // lado es un click de distancia.
                            if (confirm(`¿Archivar “${p.title}”?`)) archivar.mutate(p.id);
                          }}
                        >
                          Archivar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {archivar.isError && (
        <p className="text-destructive text-sm" role="alert">
          No se pudo archivar: {(archivar.error as Error).message}
        </p>
      )}

      {datos && datos.pageCount > 1 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {datos.total} productos · página {datos.page} de {datos.pageCount}
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
