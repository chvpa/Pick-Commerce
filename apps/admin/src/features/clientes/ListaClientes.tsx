import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { repositorioAdminClientes } from '@pick/adapter-supabase';
import { ETIQUETA_PERIODO, formatMoney, rangoDePeriodo, type Periodo } from '@pick/commerce-core';
import { UsersIcon } from '@/components/iconos';
import {
  BarraDeFiltros,
  Esqueleto,
  EstadoDeError,
  EstadoVacio,
  PaginaAdmin,
  Paginacion,
  Selector,
  Tarjeta,
} from '@/components/pagina';
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
import { SelectItem } from '@/components/ui/select';

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
  const [periodo, setPeriodo] = useState<Periodo | 'siempre'>('siempre');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const id = setTimeout(() => {
      setQuery(texto);
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [texto]);

  /*
   * «Siempre» es el valor por defecto y no un período: la lista de clientes se
   * abre para buscar a alguien tanto como para ver quién compró este mes, y
   * arrancar filtrada escondería clientes sin que nadie lo haya pedido.
   */
  const rango = periodo === 'siempre' ? undefined : rangoDePeriodo(periodo, new Date());

  const consulta = useQuery({
    queryKey: ['clientes', tienda.id, query, periodo, page],
    queryFn: () =>
      repositorioAdminClientes(db).listar(tienda.id, {
        query,
        page,
        perPage: POR_PAGINA,
        ...(rango ? { desde: rango.from, hasta: rango.to } : {}),
      }),
    placeholderData: keepPreviousData,
  });

  const datos = consulta.data;

  return (
    <PaginaAdmin
      titulo="Clientes"
      icono={UsersIcon}
      descripcion="Quiénes compraron. Se crean solos con el primer pedido; no se dan de alta acá."
    >
      <Tarjeta sinRelleno>
        <BarraDeFiltros>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="buscar" className="text-muted-foreground text-xs">
              Buscar
            </Label>
            <Input
              id="buscar"
              value={texto}
              onChange={(e) => setTexto(e.currentTarget.value)}
              placeholder="Nombre, correo o teléfono"
              className="h-8 w-72"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="periodo" className="text-muted-foreground text-xs">
              Última compra
            </Label>
            <Selector
              id="periodo"
              className="h-8 w-44"
              value={periodo}
              onValueChange={(valor) => {
                setPeriodo(valor as Periodo | 'siempre');
                setPage(1);
              }}
            >
              <SelectItem value="siempre">Siempre</SelectItem>
              {(['hoy', '7d', '30d'] as const).map((p) => (
                <SelectItem key={p} value={p}>
                  {ETIQUETA_PERIODO[p]}
                </SelectItem>
              ))}
            </Selector>
          </div>
        </BarraDeFiltros>

        {consulta.isError ? (
          <EstadoDeError
            titulo="No se pudieron cargar los clientes"
            error={consulta.error as Error}
            onReintentar={() => void consulta.refetch()}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="w-40">Teléfono</TableHead>
                  <TableHead className="w-24 text-right">Pedidos</TableHead>
                  <TableHead className="w-40 pr-6 text-right">Total comprado</TableHead>
                  <TableHead className="w-40">Última compra</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {consulta.isPending ? (
                  <TableRow>
                    <TableCell colSpan={5} className="p-0">
                      <Esqueleto />
                    </TableCell>
                  </TableRow>
                ) : datos && datos.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="p-0">
                      <EstadoVacio
                        titulo={query ? 'Ningún cliente coincide' : 'Todavía no hay clientes'}
                      >
                        {query
                          ? 'Probá con otro nombre, correo o teléfono.'
                          : 'Aparecen solos con el primer pedido, con lo que la persona haya declarado en el checkout.'}
                      </EstadoVacio>
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
                      <TableCell className="pr-6 text-right tabular-nums">
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

        {datos && (
          <Paginacion
            datos={datos}
            sustantivo="clientes"
            cargando={consulta.isFetching}
            onPagina={setPage}
          />
        )}
      </Tarjeta>
    </PaginaAdmin>
  );
}
