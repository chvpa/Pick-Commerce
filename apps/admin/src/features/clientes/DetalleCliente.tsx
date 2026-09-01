import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { repositorioAdminClientes, repositorioAdminPedidos } from '@pick/adapter-supabase';
import { ETIQUETA_ESTADO_PEDIDO, formatMoney } from '@pick/commerce-core';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { UsersIcon } from '@/components/iconos';
import {
  Esqueleto,
  EstadoDeError,
  EstadoVacio,
  Paginacion,
  PaginaAdmin,
  Tarjeta,
  TituloDeTarjeta,
} from '@/components/pagina';
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
      <PaginaAdmin titulo="Cliente" icono={UsersIcon}>
        <Tarjeta sinRelleno>
          <Esqueleto filas={3} />
        </Tarjeta>
      </PaginaAdmin>
    );
  }

  if (cliente.isError) {
    return (
      <PaginaAdmin titulo="Cliente" icono={UsersIcon}>
        <Tarjeta sinRelleno>
          <EstadoDeError
            titulo="No se pudo cargar el cliente"
            error={cliente.error as Error}
            onReintentar={() => void cliente.refetch()}
          />
        </Tarjeta>
      </PaginaAdmin>
    );
  }

  if (!cliente.data) {
    return (
      <PaginaAdmin titulo="Cliente" icono={UsersIcon}>
        <Tarjeta sinRelleno>
          <EstadoVacio
            titulo="Este cliente no existe en esta tienda"
            accion={
              <Link to="/clientes" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
                Volver a clientes
              </Link>
            }
          >
            Puede pertenecer a otra tienda de la organización.
          </EstadoVacio>
        </Tarjeta>
      </PaginaAdmin>
    );
  }

  const c = cliente.data;

  return (
    <PaginaAdmin
      titulo={c.name}
      icono={UsersIcon}
      descripcion={`Cliente desde ${fecha(c.createdAt, tienda.locale)}`}
    >
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <Tarjeta sinRelleno>
          <TituloDeTarjeta>Contacto</TituloDeTarjeta>
          <dl className="flex flex-col gap-3 p-4">
            <Dato etiqueta="Correo" valor={c.email} />
            <Dato etiqueta="Teléfono" valor={c.phone} />
            {c.taxId && <Dato etiqueta="RUC" valor={c.taxId} />}
            {c.taxName && <Dato etiqueta="Razón social" valor={c.taxName} />}
          </dl>
        </Tarjeta>

        <Tarjeta>
          <p className="text-muted-foreground text-sm">Pedidos</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{c.orderCount}</p>
          <p className="text-muted-foreground mt-1 text-xs">Sin contar los cancelados</p>
        </Tarjeta>

        <Tarjeta>
          <p className="text-muted-foreground text-sm">Total comprado</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatMoney(c.totalSpent, tienda.locale)}
          </p>
        </Tarjeta>
      </div>

      <Tarjeta sinRelleno>
        <TituloDeTarjeta>Sus pedidos</TituloDeTarjeta>

        {pedidos.isError ? (
          <EstadoDeError
            titulo="No se pudieron cargar los pedidos"
            error={pedidos.error as Error}
            onReintentar={() => void pedidos.refetch()}
          />
        ) : (
          <div className="overflow-x-auto">
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
                  <TableRow>
                    <TableCell colSpan={4} className="p-0">
                      <Esqueleto filas={3} />
                    </TableCell>
                  </TableRow>
                ) : pedidos.data && pedidos.data.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="p-0">
                      <EstadoVacio titulo="Todavía no tiene pedidos">
                        Su ficha existe porque empezó una compra, o porque un pedido suyo se
                        canceló.
                      </EstadoVacio>
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
        )}

        {pedidos.data && (
          <Paginacion
            datos={pedidos.data}
            sustantivo="pedidos"
            cargando={pedidos.isFetching}
            onPagina={setPage}
          />
        )}
      </Tarjeta>
    </PaginaAdmin>
  );
}
