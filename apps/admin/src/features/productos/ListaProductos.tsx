import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type RowSelectionState,
} from '@tanstack/react-table';
import { repositorioAdminCatalogo } from '@pick/adapter-supabase';
import {
  ETIQUETA_ESTADO,
  formatMoney,
  type EstadoAlternable,
  type ResumenProducto,
} from '@pick/commerce-core';
import type { ProductStatus } from '@pick/commerce-types';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePuede } from '@/features/auth/usePuede';
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

const columna = createColumnHelper<ResumenProducto>();

/**
 * El catálogo.
 *
 * Usa TanStack Table sólo para modelar filas y selección: la búsqueda, el filtro
 * y la paginación siguen siendo del servidor (`manualPagination`,
 * `manualFiltering`), como manda ADR-024. Traer el catálogo al browser para que
 * la tabla lo ordene sería exactamente lo que esa decisión prohíbe.
 *
 * ADR-060 dejó escrito que la tabla entraba cuando apareciera la selección
 * múltiple. Apareció acá, y no se migró la de pedidos: no la necesita.
 *
 * Tiene un costo declarado: el compilador de React **no memoiza** este
 * componente, porque `useReactTable` devuelve funciones que no se pueden
 * memoizar sin arriesgar UI vieja. El lint lo avisa y el aviso queda. Con
 * veinte filas por página no se nota; si alguna vez se notara, la salida es
 * virtualizar, no pelearse con el compilador.
 */
export function ListaProductos() {
  const tienda = useTiendaActiva();
  const cliente = useQueryClient();
  const puede = usePuede();
  const escribe = puede('catalog.write');

  const [texto, setTexto] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ProductStatus | ''>('');
  const [page, setPage] = useState(1);
  const [seleccion, setSeleccion] = useState<RowSelectionState>({});

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

  // Al cambiar de página, de búsqueda o de filtro se limpia la selección: las
  // filas marcadas ya no están a la vista, y actuar sobre lo que nadie ve es la
  // forma de archivar veinte productos sin querer.
  useEffect(() => {
    setSeleccion({});
  }, [query, status, page]);

  const invalidar = () => cliente.invalidateQueries({ queryKey: ['productos', tienda.id] });

  // Una fila y el lote usan la misma operación: publicar o archivar, en los dos
  // sentidos. Dos caminos distintos para el mismo cambio se desincronizan.
  const cambiarEstado = useMutation({
    mutationFn: ({ id, status }: { id: string; status: EstadoAlternable }) =>
      repositorioAdminCatalogo(db).cambiarEstadoEnLote(tienda.id, [id], status),
    onSuccess: invalidar,
  });

  const enLote = useMutation({
    mutationFn: ({ ids, status }: { ids: readonly string[]; status: EstadoAlternable }) =>
      repositorioAdminCatalogo(db).cambiarEstadoEnLote(tienda.id, ids, status),
    onSuccess: () => {
      setSeleccion({});
      return invalidar();
    },
  });

  const datos = consulta.data;
  const filas = useMemo(() => datos?.items ?? [], [datos]);

  const columnas = useMemo(
    () => [
      columna.display({
        id: 'seleccion',
        header: ({ table }) => (
          <Checkbox
            aria-label="Seleccionar todo lo que se ve"
            checked={table.getIsAllRowsSelected()}
            // Base UI lo lleva como prop aparte y no como un valor más de
            // `checked`: marca «algunas sí» sin mentir sobre si está marcado.
            indeterminate={table.getIsSomeRowsSelected()}
            onCheckedChange={(v) => table.toggleAllRowsSelected(v === true)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={`Seleccionar ${row.original.title}`}
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(v === true)}
          />
        ),
      }),
      columna.accessor('title', {
        header: 'Producto',
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="flex items-center gap-3">
              {/*
                La miniatura va dentro del recuadro gris, no en su lugar: los
                medios del catálogo guardan rutas del storefront —`/products/x.jpg`—
                que desde el dominio del Admin no resuelven, y el icono de imagen
                rota deja la tabla con pinta de estar mal. Si no carga, queda el
                recuadro. Resolver esas rutas contra el dominio de la tienda es
                otra cosa y está anotada.
              */}
              <div className="bg-muted size-8 shrink-0 overflow-hidden rounded">
                {p.imagen && (
                  <img
                    src={p.imagen}
                    alt=""
                    width={32}
                    height={32}
                    className="size-8 object-cover"
                    onError={(e) => {
                      e.currentTarget.hidden = true;
                    }}
                  />
                )}
              </div>
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
          );
        },
      }),
      columna.accessor('status', {
        header: 'En la tienda',
        cell: ({ row, getValue }) => {
          const estado = getValue();
          const publicado = estado === 'active';
          return (
            <span className="flex items-center gap-2.5">
              {/*
                Un interruptor y no un botón de archivar: archivar era un camino
                de ida —la fila dejaba de ofrecer el botón y no había forma de
                volver desde el listado—.

                Encender siempre publica, venga de donde venga, que es lo que
                significa «habilitarlo de nuevo». Apagar archiva, con
                confirmación porque saca el producto de la tienda. Los otros dos
                estados no caben en un interruptor, así que se leen en la
                etiqueta de al lado y se eligen desde el formulario.
              */}
              <Switch
                checked={publicado}
                disabled={!escribe || cambiarEstado.isPending}
                aria-label={`${publicado ? 'Quitar de la tienda' : 'Publicar en la tienda'} ${row.original.title}`}
                onCheckedChange={(v) => {
                  if (v) {
                    cambiarEstado.mutate({ id: row.original.id, status: 'active' });
                    return;
                  }
                  if (confirm(`¿Archivar “${row.original.title}”? Deja de verse en la tienda.`)) {
                    cambiarEstado.mutate({ id: row.original.id, status: 'archived' });
                  }
                }}
              />
              <Badge className={cn(TONO[estado])}>{ETIQUETA_ESTADO[estado]}</Badge>
            </span>
          );
        },
      }),
      columna.accessor('variantes', {
        header: () => <span className="block text-right">Variantes</span>,
        cell: ({ getValue }) => <span className="block text-right tabular-nums">{getValue()}</span>,
      }),
      columna.accessor('stock', {
        header: () => <span className="block text-right">Stock</span>,
        cell: ({ getValue }) => (
          <span
            className={cn('block text-right tabular-nums', getValue() <= 0 && 'text-destructive')}
          >
            {getValue()}
          </span>
        ),
      }),
      columna.accessor('precioDesde', {
        header: () => <span className="block text-right">Desde</span>,
        cell: ({ row, getValue }) => (
          <span className="block text-right tabular-nums">
            {getValue() === undefined
              ? '—'
              : formatMoney(
                  { amount: getValue()!, currency: (row.original.currency ?? 'PYG') as 'PYG' },
                  tienda.locale,
                )}
          </span>
        ),
      }),
    ],
    [cambiarEstado, escribe, tienda.locale],
  );

  const tabla = useReactTable({
    // La copia es por la firma de la tabla, que pide un array mutable; el
    // repositorio devuelve `readonly` a propósito y no se le quita.
    data: filas as ResumenProducto[],
    columns: columnas,
    getCoreRowModel: getCoreRowModel(),
    // Sin esto la clave de la fila es su índice, y la selección se quedaría
    // pegada a la posición al cambiar de página.
    getRowId: (p) => p.id,
    state: { rowSelection: seleccion },
    onRowSelectionChange: setSeleccion,
    enableRowSelection: escribe,
    manualPagination: true,
    manualFiltering: true,
    // La columna de selección sólo existe para quien puede escribir: a un viewer
    // no se le ofrece marcar filas que no va a poder tocar.
    initialState: { columnVisibility: { seleccion: escribe, acciones: escribe } },
  });

  const marcados = tabla.getSelectedRowModel().rows.map((r) => r.original);
  const columnasVisibles = tabla.getVisibleFlatColumns().length;

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
        {escribe && (
          <div className="flex gap-2">
            <Link to="/productos/importar" className={buttonVariants({ variant: 'outline' })}>
              Importar / exportar
            </Link>
            <Link to="/productos/nuevo" className={buttonVariants()}>
              Nuevo producto
            </Link>
          </div>
        )}
      </div>

      {marcados.length > 0 && (
        <div
          className="border-border bg-muted/40 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2.5"
          role="group"
          aria-label="Acciones sobre lo seleccionado"
        >
          <p className="text-sm" aria-live="polite">
            {marcados.length} {marcados.length === 1 ? 'seleccionado' : 'seleccionados'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={enLote.isPending}
              onClick={() => {
                if (confirm(`¿Archivar ${marcados.length} producto(s)?`)) {
                  enLote.mutate({ ids: marcados.map((p) => p.id), status: 'archived' });
                }
              }}
            >
              Archivar
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={enLote.isPending}
              onClick={() => {
                // Misma semántica que el interruptor de cada fila: publicar es
                // publicar, venga el producto de donde venga. Que en lote y de a
                // uno signifiquen cosas distintas es peor que el riesgo de
                // publicar de más, que además se deshace con el mismo control.
                if (confirm(`¿Publicar ${marcados.length} producto(s) en la tienda?`)) {
                  enLote.mutate({ ids: marcados.map((p) => p.id), status: 'active' });
                }
              }}
            >
              Publicar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={enLote.isPending}
              onClick={() => setSeleccion({})}
            >
              Limpiar
            </Button>
          </div>
        </div>
      )}

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
              {tabla.getHeaderGroups().map((grupo) => (
                <TableRow key={grupo.id}>
                  {grupo.headers.map((h) => (
                    <TableHead key={h.id}>
                      {h.isPlaceholder
                        ? null
                        : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {consulta.isPending ? (
                // Skeleton y no un spinner: conserva el alto de la tabla, así la
                // página no salta cuando llegan los datos.
                Array.from({ length: 5 }, (_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={columnasVisibles}>
                      <div className="bg-muted h-5 w-full animate-pulse rounded" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columnasVisibles} className="py-10 text-center">
                    <p className="text-muted-foreground text-sm">
                      {query || status
                        ? 'Ningún producto coincide con la búsqueda.'
                        : 'Todavía no hay productos.'}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                tabla.getRowModel().rows.map((fila) => (
                  <TableRow
                    key={fila.id}
                    data-state={fila.getIsSelected() ? 'selected' : undefined}
                  >
                    {fila.getVisibleCells().map((celda) => (
                      <TableCell key={celda.id}>
                        {flexRender(celda.column.columnDef.cell, celda.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {(cambiarEstado.isError || enLote.isError) && (
        <p className="text-destructive text-sm" role="alert">
          {((cambiarEstado.error ?? enLote.error) as Error).message}
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
