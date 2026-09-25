import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { repositorioAdminCatalogo } from '@pick/adapter-supabase';
import {
  ETIQUETA_TRAMO,
  formatMoney,
  type PaginaAntiguedad,
  type TramoDeAntiguedad,
} from '@pick/commerce-core';
import { HourglassIcon } from '@/components/iconos';
import {
  Esqueleto,
  EstadoDeError,
  EstadoVacio,
  PaginaAdmin,
  Paginacion,
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
import { cn } from '@/lib/utils';

const POR_PAGINA = 20;

function porcentaje(tasa: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(tasa);
}

/** Los cuatro tramos, como botones que filtran la lista de abajo. */
function Tramos({
  datos,
  elegido,
  onElegir,
  locale,
}: {
  datos: PaginaAntiguedad;
  elegido: TramoDeAntiguedad | null;
  onElegir: (t: TramoDeAntiguedad | null) => void;
  locale: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {datos.buckets.map((t) => {
        const activo = elegido === t.bucket;
        return (
          <button
            key={t.bucket}
            type="button"
            aria-pressed={activo}
            onClick={() => onElegir(activo ? null : t.bucket)}
            className={cn(
              'bg-card border-border focus-visible:ring-ring flex cursor-pointer flex-col gap-1 rounded-xl border p-4 text-left shadow-xs transition-colors outline-none focus-visible:ring-2',
              'hover:border-primary/50',
              activo && 'border-primary ring-primary ring-1',
            )}
          >
            <span className="text-sm font-medium">Sin vender: {ETIQUETA_TRAMO[t.bucket]}</span>
            <span className="text-2xl font-semibold tabular-nums">
              {formatMoney(t.priceValue, locale)}
            </span>
            <span className="text-muted-foreground text-xs">
              {t.units} unidades en {t.variants} variantes, a precio de venta
            </span>
            <span className="text-muted-foreground text-xs">
              {formatMoney(t.costValue, locale)} a costo
              {/* Sin cobertura completa, el costo es de una parte: se dice cuál (ADR-101). */}
              {t.units > 0 &&
                t.costCoverage < 1 &&
                ` · con costo cargado el ${porcentaje(t.costCoverage, locale)} de las unidades`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * La plata parada en el depósito, y hace cuánto.
 *
 * No hay libro de movimientos de stock, así que la antigüedad es la que sí se
 * sabe: días desde la última venta, o desde el alta si nunca se vendió
 * (ADR-135). Lo más viejo primero, que es la lista con la que se decide qué
 * liquidar.
 */
export function StockQuieto() {
  const tienda = useTiendaActiva();
  const repositorio = useMemo(() => repositorioAdminCatalogo(db), []);
  const [tramo, setTramo] = useState<TramoDeAntiguedad | null>(null);
  const [page, setPage] = useState(1);

  const consulta = useQuery({
    queryKey: ['stock-quieto', tienda.id, tramo, page],
    queryFn: () =>
      repositorio.antiguedad(tienda.id, { ...(tramo ? { tramo } : {}), page, perPage: POR_PAGINA }),
    placeholderData: keepPreviousData,
  });

  const datos = consulta.data;
  const sinStock = datos !== undefined && datos.buckets.every((t) => t.units === 0);

  return (
    <PaginaAdmin
      titulo="Stock quieto"
      icono={HourglassIcon}
      descripcion="Cuánto stock hay, agrupado por cuánto hace que no se vende. Lo que nunca se vendió cuenta desde el alta del producto."
    >
      {consulta.isError ? (
        <Tarjeta sinRelleno>
          <EstadoDeError
            titulo="No se pudo leer el stock"
            error={consulta.error as Error}
            onReintentar={() => void consulta.refetch()}
          />
        </Tarjeta>
      ) : consulta.isPending ? (
        <Tarjeta sinRelleno>
          <Esqueleto filas={6} />
        </Tarjeta>
      ) : sinStock ? (
        <Tarjeta sinRelleno>
          <EstadoVacio titulo="No hay stock cargado">
            Cuando las variantes tengan unidades en alguna sucursal, acá se ve cuánto hace que no se
            venden.
          </EstadoVacio>
        </Tarjeta>
      ) : (
        <>
          <Tramos
            datos={datos!}
            elegido={tramo}
            onElegir={(t) => {
              setTramo(t);
              setPage(1);
            }}
            locale={tienda.locale}
          />

          <Tarjeta sinRelleno>
            <TituloDeTarjeta>
              {tramo
                ? `Sin vender: ${ETIQUETA_TRAMO[tramo]}`
                : 'Todo el stock, lo más viejo primero'}
            </TituloDeTarjeta>
            <div className="overflow-x-auto" aria-busy={consulta.isFetching}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="w-20 text-right">Stock</TableHead>
                    <TableHead className="w-44">Sin vender</TableHead>
                    <TableHead className="w-36 text-right">A precio</TableHead>
                    <TableHead className="w-36 pr-6 text-right">A costo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className={cn(consulta.isFetching && 'opacity-60')}>
                  {datos!.items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="p-0">
                        <EstadoVacio titulo="Nada en este tramo" />
                      </TableCell>
                    </TableRow>
                  ) : (
                    datos!.items.map((v) => (
                      <TableRow key={v.variantId}>
                        <TableCell>
                          <Link
                            to="/productos/$id"
                            params={{ id: v.productId }}
                            className="flex flex-col gap-0.5 hover:underline"
                          >
                            <span className="font-medium">
                              {v.title}
                              {v.variantTitle && (
                                <span className="text-muted-foreground"> · {v.variantTitle}</span>
                              )}
                            </span>
                            <span className="text-muted-foreground text-xs">{v.sku}</span>
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{v.stock}</TableCell>
                        <TableCell className="text-sm">
                          {v.days} días
                          {!v.lastSoldAt && (
                            <span className="text-muted-foreground block text-xs">
                              nunca se vendió
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(v.priceValue, tienda.locale)}
                        </TableCell>
                        <TableCell className="text-muted-foreground pr-6 text-right tabular-nums">
                          {v.costValue ? formatMoney(v.costValue, tienda.locale) : 'sin costo'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <Paginacion
              datos={datos!}
              sustantivo="variantes"
              cargando={consulta.isFetching}
              onPagina={setPage}
            />
          </Tarjeta>
        </>
      )}
    </PaginaAdmin>
  );
}
