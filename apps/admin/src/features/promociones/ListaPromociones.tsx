import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { repositorioPromociones } from '@pick/adapter-supabase';
import { esDeCatalogo, formatMoney, type Promotion } from '@pick/commerce-core';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
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

const POR_PAGINA = 20;

const ETIQUETA_ESTADO: Record<Promotion['status'], string> = {
  draft: 'Borrador',
  active: 'Activa',
  archived: 'Archivada',
};

const TONO_ESTADO: Record<Promotion['status'], 'default' | 'secondary' | 'outline'> = {
  active: 'default',
  draft: 'secondary',
  archived: 'outline',
};

function descuento(p: Promotion, locale: string): string {
  return p.discountType === 'percentage'
    ? `${p.discountValue / 100} %`
    : formatMoney({ amount: p.discountValue, currency: 'PYG' }, locale);
}

function alcance(p: Promotion): string {
  switch (p.target.kind) {
    case 'all':
      return 'Todo el catálogo';
    case 'category':
      return `${p.target.ids.length} categoría${p.target.ids.length === 1 ? '' : 's'}`;
    case 'collection':
      return `${p.target.ids.length} colección${p.target.ids.length === 1 ? '' : 'es'}`;
    case 'product':
      return `${p.target.ids.length} producto${p.target.ids.length === 1 ? '' : 's'}`;
  }
}

function vigencia(p: Promotion, locale: string): string {
  const corta = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' });

  if (p.startsAt && p.endsAt) return `${corta(p.startsAt)} – ${corta(p.endsAt)}`;
  if (p.endsAt) return `hasta ${corta(p.endsAt)}`;
  if (p.startsAt) return `desde ${corta(p.startsAt)}`;
  return 'Sin límite';
}

/**
 * Las campañas de descuento de la tienda.
 *
 * La columna «Dónde se ve» no es decorativa: una promoción con mínimo de compra
 * o con cupón **no aparece en el catálogo**, porque sin carrito no hay subtotal
 * contra el que evaluarla. Decirlo acá evita la pregunta de por qué la promo que
 * acaban de crear no se ve en la vidriera.
 */
export function ListaPromociones() {
  const tienda = useTiendaActiva();
  const puede = usePuede();
  const [page, setPage] = useState(1);

  const consulta = useQuery({
    queryKey: ['promociones', tienda.id, page],
    queryFn: () => repositorioPromociones(db).listar(tienda.id, { page, perPage: POR_PAGINA }),
    placeholderData: keepPreviousData,
  });

  const datos = consulta.data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Bajan el precio sin tocar el catálogo. El descuento se calcula en el servidor.
        </p>
        {puede('promotion.write') && (
          <Link to="/promociones/nueva" className={buttonVariants({ size: 'sm' })}>
            Nueva promoción
          </Link>
        )}
      </div>

      {consulta.isError ? (
        <div className="border-destructive/40 flex flex-col items-start gap-3 rounded-lg border p-6">
          <p className="text-sm">No se pudieron cargar las promociones.</p>
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
                <TableHead>Promoción</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Descuento</TableHead>
                <TableHead>Alcance</TableHead>
                <TableHead>Dónde se ve</TableHead>
                <TableHead>Vigencia</TableHead>
                <TableHead className="text-right">Usos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {consulta.isPending ? (
                Array.from({ length: 5 }, (_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}>
                      <div className="bg-muted h-5 w-full animate-pulse rounded" />
                    </TableCell>
                  </TableRow>
                ))
              ) : datos && datos.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center">
                    <p className="text-muted-foreground text-sm">
                      Todavía no hay promociones.{' '}
                      {puede('promotion.write')
                        ? 'Creá la primera para bajar precios sin editar el catálogo.'
                        : 'Tu rol no incluye crearlas.'}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                datos?.items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link
                        to="/promociones/$id"
                        params={{ id: p.id }}
                        className="flex flex-col gap-0.5 hover:underline"
                      >
                        <span className="font-medium">{p.title}</span>
                        {p.code ? (
                          <span className="text-muted-foreground font-mono text-xs">{p.code}</span>
                        ) : null}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={TONO_ESTADO[p.status]}>{ETIQUETA_ESTADO[p.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {descuento(p, tienda.locale)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{alcance(p)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {esDeCatalogo(p) ? 'Catálogo y carrito' : 'Sólo en el carrito'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {vigencia(p, tienda.locale)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.usageCount}
                      {p.usageLimit !== undefined ? ` / ${p.usageLimit}` : ''}
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
            {datos.total} promociones · página {datos.page} de {datos.pageCount}
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
