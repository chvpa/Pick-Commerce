import { useState } from 'react';
import Papa from 'papaparse';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repositorioAdminCatalogo, repositorioCatalogo } from '@pick/adapter-supabase';
import type { ResultadoImport } from '@pick/commerce-core';
import { PackageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PaginaAdmin, Tarjeta, TituloDeTarjeta } from '@/components/pagina';
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
import { descargar } from '@/lib/descargar';
import {
  COLUMNAS,
  FILAS_PLANTILLA,
  filasDe,
  prepararImport,
  type Fila,
  type Preparado,
} from './csv';

/**
 * Cuántos productos por llamada.
 *
 * Ni uno por uno —serían cientos de peticiones— ni todos juntos: un archivo
 * grande en un solo cuerpo puede pasarse del límite de la petición, y con un
 * lote por vez se puede mostrar avance.
 */
const LOTE = 50;

export function ImportarProductos() {
  const tienda = useTiendaActiva();
  const cliente = useQueryClient();
  const repo = repositorioAdminCatalogo(db);

  const [preparado, setPreparado] = useState<Preparado | null>(null);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [avance, setAvance] = useState<{ hechos: number; total: number } | null>(null);
  const [reporte, setReporte] = useState<readonly ResultadoImport[] | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);

  const categorias = useQuery({
    queryKey: ['categorias', tienda.id],
    queryFn: () => repositorioCatalogo(db).categorias(tienda.id),
  });

  // Para decir qué se crea y qué se actualiza hace falta saber qué existe. El
  // listado ya pagina, así que se piden los handles de a páginas grandes.
  const existentes = useQuery({
    queryKey: ['handles', tienda.id],
    queryFn: async () => {
      const vistos = new Set<string>();
      for (let page = 1; ; page += 1) {
        const r = await repo.listar(tienda.id, { page, perPage: 200 });
        for (const p of r.items) vistos.add(p.handle);
        if (page >= r.pageCount) return vistos;
      }
    },
  });

  const listo = categorias.data !== undefined && existentes.data !== undefined;

  function leer(file: File) {
    setErrorArchivo(null);
    setReporte(null);
    setArchivo(file.name);

    Papa.parse<Partial<Fila>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      // El encabezado suele venir con espacios o mayúsculas de la planilla.
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (resultado) => {
        const faltan = ['handle', 'titulo', 'sku', 'precio'].filter(
          (c) => !(resultado.meta.fields ?? []).includes(c),
        );
        if (faltan.length > 0) {
          setPreparado(null);
          setErrorArchivo(
            `Al archivo le faltan columnas obligatorias: ${faltan.join(', ')}. ` +
              'Descargá la plantilla para ver el formato.',
          );
          return;
        }

        setPreparado(
          prepararImport(resultado.data, {
            // El archivo trae el slug, que es lo que un operador conoce; el
            // catálogo guarda el id.
            categorias: new Map((categorias.data ?? []).map((c) => [c.slug, c.id])),
            existentes: existentes.data ?? new Set(),
            moneda: tienda.currency,
          }),
        );
      },
      error: (error: Error) => {
        setPreparado(null);
        setErrorArchivo(`No se pudo leer el archivo: ${error.message}`);
      },
    });
  }

  const importar = useMutation({
    mutationFn: async () => {
      const productos = preparado?.productos ?? [];
      const resultados: ResultadoImport[] = [];

      setAvance({ hechos: 0, total: productos.length });
      for (let i = 0; i < productos.length; i += LOTE) {
        const lote = productos.slice(i, i + LOTE);
        const parcial = await repo.importar(tienda.id, lote);
        // El índice que devuelve la función es relativo al lote.
        resultados.push(...parcial.map((r) => ({ ...r, indice: r.indice + i })));
        setAvance({ hechos: Math.min(i + LOTE, productos.length), total: productos.length });
      }
      return resultados;
    },
    onSuccess: async (resultados) => {
      setReporte(resultados);
      setPreparado(null);
      setAvance(null);
      await cliente.invalidateQueries({ queryKey: ['productos', tienda.id] });
      await cliente.invalidateQueries({ queryKey: ['handles', tienda.id] });
    },
    onError: () => setAvance(null),
  });

  const exportar = useMutation({
    mutationFn: async () => {
      const porId = new Map((categorias.data ?? []).map((c) => [c.id, c.slug]));
      const filas: Fila[] = [];
      // Paginado: un catálogo grande no entra en una consulta (ADR-024).
      for (let page = 1; ; page += 1) {
        const lote = await repo.completos(tienda.id, page, 100);
        filas.push(...filasDe(lote, porId));
        if (lote.length < 100) break;
      }
      descargar(`catalogo-${tienda.slug}.csv`, Papa.unparse(filas, { columns: [...COLUMNAS] }));
    },
  });

  return (
    <PaginaAdmin
      titulo="Importar / exportar"
      icono={PackageIcon}
      descripcion="El catálogo entero en un CSV: para traerlo de otro sistema o para editarlo en planilla."
    >
      <div className="flex max-w-4xl flex-col gap-5">
        <Tarjeta sinRelleno>
          <TituloDeTarjeta>1 · El formato</TituloDeTarjeta>
          <div className="flex flex-col gap-3 p-4">
            <p className="text-muted-foreground text-sm">
              Una fila por variante, agrupadas por <code>handle</code>. Los datos del producto
              —título, marca, categoría, estado— los toma la primera fila de cada handle. Los
              atributos van como <code>color: Azul | size: M</code>. El archivo no lleva imágenes:
              importar no toca las que el producto ya tenga.
            </p>
            <p className="text-muted-foreground text-sm">
              Para un producto que ya existe, el archivo manda: sus variantes pasan a ser
              exactamente las del archivo.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  descargar(
                    'plantilla-productos.csv',
                    Papa.unparse(FILAS_PLANTILLA, { columns: [...COLUMNAS] }),
                  )
                }
              >
                Descargar plantilla
              </Button>
              <Button
                variant="outline"
                disabled={exportar.isPending || !listo}
                onClick={() => exportar.mutate()}
              >
                {exportar.isPending ? 'Exportando…' : 'Exportar catálogo'}
              </Button>
            </div>
            {exportar.isError && (
              <p className="text-destructive text-sm" role="alert">
                {(exportar.error as Error).message}
              </p>
            )}
          </div>
        </Tarjeta>

        <Tarjeta sinRelleno>
          <TituloDeTarjeta>2 · El archivo</TituloDeTarjeta>
          <div className="flex flex-col gap-3 p-4">
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={!listo || importar.isPending}
              aria-label="Archivo CSV"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) leer(file);
              }}
              className="text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm"
            />
            {!listo && (
              <p className="text-muted-foreground text-sm" role="status">
                Cargando el catálogo actual…
              </p>
            )}
            {errorArchivo && (
              <p className="text-destructive text-sm" role="alert">
                {errorArchivo}
              </p>
            )}
          </div>
        </Tarjeta>

        {preparado && (
          <Tarjeta sinRelleno>
            <TituloDeTarjeta>3 · Qué va a pasar</TituloDeTarjeta>
            <div className="flex flex-col gap-3 p-4">
              <p className="text-sm">
                <strong>{archivo}</strong>: {preparado.nuevos} a crear, {preparado.existentes} a
                actualizar, {preparado.errores.length} fila(s) rechazada(s).
              </p>

              {preparado.errores.length > 0 && (
                <div className="border-border max-h-64 overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Línea</TableHead>
                        <TableHead>Handle</TableHead>
                        <TableHead>Motivo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preparado.errores.map((e, i) => (
                        <TableRow key={`${e.linea}-${i}`}>
                          <TableCell className="tabular-nums">{e.linea}</TableCell>
                          <TableCell>{e.handle}</TableCell>
                          <TableCell className="text-destructive">{e.motivo}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="flex items-center gap-3">
                {/* Nada se escribió todavía: hasta acá el archivo sólo se leyó. */}
                <Button
                  disabled={preparado.productos.length === 0 || importar.isPending}
                  onClick={() => importar.mutate()}
                >
                  {importar.isPending
                    ? `Importando… ${avance?.hechos ?? 0}/${avance?.total ?? 0}`
                    : `Importar ${preparado.productos.length} producto(s)`}
                </Button>
                <Button
                  variant="ghost"
                  disabled={importar.isPending}
                  onClick={() => setPreparado(null)}
                >
                  Descartar
                </Button>
              </div>

              {importar.isError && (
                <p className="text-destructive text-sm" role="alert">
                  {(importar.error as Error).message}
                </p>
              )}
            </div>
          </Tarjeta>
        )}

        {reporte && (
          <Tarjeta sinRelleno>
            <TituloDeTarjeta>Resultado</TituloDeTarjeta>
            <div className="flex flex-col gap-3 p-4">
              <p className="text-sm" role="status">
                {reporte.filter((r) => r.accion === 'creado').length} creados,{' '}
                {reporte.filter((r) => r.accion === 'actualizado').length} actualizados,{' '}
                {reporte.filter((r) => !r.ok).length} rechazados.
              </p>

              {reporte.some((r) => !r.ok) && (
                <div className="border-border max-h-64 overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Handle</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reporte
                        .filter((r) => !r.ok)
                        .map((r) => (
                          <TableRow key={r.indice}>
                            <TableCell>{r.handle}</TableCell>
                            <TableCell className="text-destructive">{r.error}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Descargable: un import de cientos de filas no se revisa en pantalla. */}
              <div>
                <Button
                  variant="outline"
                  onClick={() =>
                    descargar(
                      'reporte-import.csv',
                      Papa.unparse(
                        reporte.map((r) => ({
                          handle: r.handle,
                          accion: r.accion,
                          error: r.error ?? '',
                        })),
                      ),
                    )
                  }
                >
                  Descargar reporte
                </Button>
              </div>
            </div>
          </Tarjeta>
        )}
      </div>
    </PaginaAdmin>
  );
}
