import { useState } from 'react';
import Papa from 'papaparse';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { repositorioDashboard } from '@pick/adapter-supabase';
import {
  ETIQUETA_MODO,
  formatMoney,
  type ModoDeRendimiento,
  type Periodo,
} from '@pick/commerce-core';
import {
  Esqueleto,
  EstadoDeError,
  Paginacion,
  Selector,
  Tarjeta,
  TituloDeTarjeta,
} from '@/components/pagina';
import { Button } from '@/components/ui/button';
import { SelectItem } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { descargar } from '@/lib/descargar';
import { db } from '@/lib/supabase';

const POR_PAGINA = 10;

/**
 * Qué se vendió, y qué no.
 *
 * Vivía en el Resumen y se mudó a Analytics con el Inicio del handoff (ADR-145):
 * el Inicio muestra lo más vendido en cinco filas y enlaza acá para el resto.
 *
 * Las dos preguntas en una tabla porque son la misma mirada desde dos lados: qué
 * conviene reponer y qué está inmovilizando plata. Separarlas en dos tarjetas
 * obligaría a comparar entre dos listas que nunca están a la misma altura.
 *
 * Reemplazó al «Lo más vendido» de la Fase 6, que era un top cinco sin
 * paginación: servía para mirar de reojo y no para decidir nada. Éste pagina, se
 * exporta, y trae el margen por producto.
 */
export function VentasPorProducto({
  rango,
  periodo,
}: {
  rango: { from: string; to: string };
  periodo: Periodo;
}) {
  const tienda = useTiendaActiva();
  const [modo, setModo] = useState<ModoDeRendimiento>('vendidos');
  const [page, setPage] = useState(1);

  const consulta = useQuery({
    queryKey: ['rendimiento', tienda.id, periodo, modo, page],
    queryFn: () =>
      repositorioDashboard(db).rendimiento(tienda.id, rango.from, rango.to, modo, page, POR_PAGINA),
    placeholderData: keepPreviousData,
  });

  /*
   * El export recorre la paginación, como el del catálogo.
   *
   * No se pide «todo de una» ni acá ni en el RPC: un catálogo real no entra en
   * una respuesta, y la regla de ADR-024 no tiene una excepción para los
   * informes.
   */
  const exportar = useMutation({
    mutationFn: async () => {
      const repo = repositorioDashboard(db);
      const filas: Record<string, string | number>[] = [];

      for (let p = 1; ; p += 1) {
        const lote = await repo.rendimiento(tienda.id, rango.from, rango.to, modo, p, 100);
        filas.push(
          ...lote.items.map((f) => ({
            sku: f.sku,
            producto: f.title,
            variante: f.variantTitle ?? '',
            unidades: f.unidades,
            ingresos: f.ingresos.amount,
            // Vacío y no cero cuando no hay costo: en una planilla, un cero se
            // suma y miente el total.
            margen: f.margen ? f.margen.amount : '',
            stock: f.stock ?? '',
            moneda: f.ingresos.currency,
          })),
        );
        if (lote.page >= lote.pageCount) break;
      }

      descargar(
        `ventas-${tienda.slug}-${modo}-${rango.from.slice(0, 10)}.csv`,
        Papa.unparse(filas, {
          columns: [
            'sku',
            'producto',
            'variante',
            'unidades',
            'ingresos',
            'margen',
            'stock',
            'moneda',
          ],
        }),
      );
    },
  });

  const datos = consulta.data;

  return (
    <Tarjeta sinRelleno>
      <TituloDeTarjeta
        accion={
          <div className="flex items-center gap-2">
            <Selector
              value={modo}
              onValueChange={(valor) => {
                setModo(valor as ModoDeRendimiento);
                setPage(1);
              }}
              aria-label="Qué mostrar"
            >
              {(['vendidos', 'sin_movimiento'] as const).map((m) => (
                <SelectItem key={m} value={m}>
                  {ETIQUETA_MODO[m]}
                </SelectItem>
              ))}
            </Selector>
            <Button
              variant="outline"
              size="sm"
              disabled={exportar.isPending || !datos || datos.total === 0}
              onClick={() => exportar.mutate()}
            >
              {exportar.isPending ? 'Exportando…' : 'Exportar CSV'}
            </Button>
          </div>
        }
      >
        Ventas por producto
      </TituloDeTarjeta>

      {exportar.isError && (
        <p className="text-destructive border-b px-4 py-3 text-sm" role="alert">
          {(exportar.error as Error).message}
        </p>
      )}

      {consulta.isError ? (
        <EstadoDeError
          titulo="No se pudieron cargar las ventas por producto"
          error={consulta.error as Error}
          onReintentar={() => void consulta.refetch()}
        />
      ) : consulta.isPending ? (
        <Esqueleto />
      ) : datos && datos.items.length === 0 ? (
        <p className="text-muted-foreground px-4 py-6 text-sm">
          {modo === 'vendidos'
            ? 'Todavía no se vendió nada en este período.'
            : 'Todo lo publicado vendió al menos una unidad.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                {modo === 'vendidos' ? (
                  <>
                    <TableHead className="text-right">Unidades</TableHead>
                    <TableHead className="text-right">Ingresos</TableHead>
                    <TableHead className="text-right">Margen</TableHead>
                  </>
                ) : (
                  <TableHead className="text-right">Sin vender</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {datos?.items.map((f) => (
                <TableRow key={f.sku}>
                  <TableCell>
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium">
                        {f.title}
                        {f.variantTitle && (
                          <span className="text-muted-foreground font-normal">
                            {' · '}
                            {f.variantTitle}
                          </span>
                        )}
                      </span>
                      <span className="text-muted-foreground font-mono text-xs">{f.sku}</span>
                    </span>
                  </TableCell>
                  {modo === 'vendidos' ? (
                    <>
                      <TableCell className="text-right tabular-nums">{f.unidades}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(f.ingresos, tienda.locale)}
                      </TableCell>
                      {/*
                        Un guion y no un cero: este producto no tiene costo
                        cargado, que es distinto de haberlo vendido sin ganancia.
                      */}
                      <TableCell className="text-muted-foreground text-right tabular-nums">
                        {f.margen ? formatMoney(f.margen, tienda.locale) : '—'}
                      </TableCell>
                    </>
                  ) : (
                    <TableCell className="text-right tabular-nums">{f.stock ?? 0}</TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {datos && (
        <Paginacion
          datos={datos}
          sustantivo="productos"
          cargando={consulta.isFetching}
          onPagina={setPage}
        />
      )}
    </Tarjeta>
  );
}
