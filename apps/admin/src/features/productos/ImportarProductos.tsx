import { useState } from 'react';
import Papa from 'papaparse';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { repositorioAdminCatalogo } from '@pick/adapter-supabase';
import type { ResultadoImport } from '@pick/commerce-core';
import {
  AlertCircleIcon,
  CheckCircleIcon,
  CheckIcon,
  DownloadIcon,
  FileIcon,
  UploadIcon,
} from '@/components/iconos';
import {
  PaginaAdmin,
  Paginacion,
  Segmentado,
  Selector,
  Tarjeta,
  TituloDeTarjeta,
} from '@/components/pagina';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { SelectItem } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCategorias } from '@/features/tienda/useCategorias';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { useSucursales } from '@/features/tienda/useSucursales';
import { descargar } from '@/lib/descargar';
import { db } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import {
  COLUMNAS,
  FILAS_PLANTILLA,
  OBLIGATORIAS,
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

/** Cuántas filas de la revisión por página: un archivo puede traer miles. */
const POR_PAGINA = 50;

const PASOS = ['Subir planilla', 'Revisar', 'Listo'] as const;

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Importar el catálogo desde una planilla, en tres pasos (ADR-154).
 *
 * Subir, revisar fila por fila y el resultado. Hasta «Importar» nada se escribe:
 * el archivo se lee en el navegador, y la revisión muestra qué entra, qué se
 * actualiza y por qué no entra cada fila que no entra.
 */
export function ImportarProductos() {
  const tienda = useTiendaActiva();
  const cliente = useQueryClient();
  const repo = repositorioAdminCatalogo(db);

  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [preparado, setPreparado] = useState<Preparado | null>(null);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [avance, setAvance] = useState<{ hechos: number; total: number } | null>(null);
  const [reporte, setReporte] = useState<readonly ResultadoImport[] | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [vista, setVista] = useState<'todas' | 'errores'>('todas');
  const [pagina, setPagina] = useState(1);

  /*
   * Un archivo plano tiene **una** columna de stock, así que la sucursal la
   * elige la pantalla. La misma para las dos direcciones: si el export saca la
   * suma de las sucursales y el import la mete en una, un ida y vuelta duplica
   * el inventario.
   */
  const { sucursales, varias, unica } = useSucursales();
  const [sucursal, setSucursal] = useState<string | undefined>(undefined);
  const elegida = sucursal ?? unica ?? sucursales[0]?.id;

  const categorias = useCategorias();

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

    // Excel no: leerlo pide una dependencia nueva, y cualquier planilla se
    // guarda como CSV en dos clics.
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') {
      setErrorArchivo(
        'Sólo se leen archivos CSV. Si tu planilla es de Excel, guardala como CSV y subila de nuevo.',
      );
      return;
    }

    Papa.parse<Partial<Fila>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      // El encabezado suele venir con espacios o mayúsculas de la planilla.
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (resultado) => {
        const faltan = OBLIGATORIAS.filter((c) => !(resultado.meta.fields ?? []).includes(c));
        if (faltan.length > 0) {
          setErrorArchivo(
            `Al archivo le faltan columnas obligatorias: ${faltan.join(', ')}. ` +
              'Descargá la plantilla para ver el formato.',
          );
          return;
        }

        setArchivo(file.name);
        setPreparado(
          prepararImport(resultado.data, {
            // El archivo trae el slug, que es lo que un operador conoce; el
            // catálogo guarda el id.
            categorias: new Map((categorias.data ?? []).map((c) => [c.slug, c.id])),
            existentes: existentes.data ?? new Set(),
            moneda: tienda.currency,
            ...(elegida ? { sucursalId: elegida } : {}),
          }),
        );
        setVista('todas');
        setPagina(1);
        setPaso(2);
      },
      error: (error: Error) => setErrorArchivo(`No se pudo leer el archivo: ${error.message}`),
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
      setAvance(null);
      setPaso(3);
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
        filas.push(...filasDe(lote, porId, elegida));
        if (lote.length < 100) break;
      }
      descargar(`catalogo-${tienda.slug}.csv`, Papa.unparse(filas, { columns: [...COLUMNAS] }));
    },
  });

  function otraVez() {
    setPreparado(null);
    setArchivo(null);
    setReporte(null);
    importar.reset();
    setPaso(1);
  }

  return (
    <PaginaAdmin
      titulo="Importar productos"
      descripcion="Cargá o actualizá el catálogo con una planilla. Los productos que ya existen se reconocen por su handle."
      acciones={
        <Button
          variant="outline"
          disabled={exportar.isPending || !listo}
          onClick={() => exportar.mutate()}
        >
          <DownloadIcon />
          {exportar.isPending ? 'Exportando…' : 'Exportar catálogo'}
        </Button>
      }
    >
      {exportar.isError && (
        <p className="text-destructive text-sm" role="alert">
          {(exportar.error as Error).message}
        </p>
      )}

      <ol aria-label="Pasos" className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {PASOS.map((nombre, i) => {
          const n = i + 1;
          const hecho = paso > n;
          const actual = paso === n;
          return (
            <li
              key={nombre}
              aria-current={actual ? 'step' : undefined}
              className="flex items-center gap-2.5"
            >
              <span
                className={cn(
                  'flex size-6 items-center justify-center rounded-full text-xs font-semibold',
                  hecho || actual ? 'bg-[#3b5bdb] text-white' : 'text-ink-3 bg-[#f1f2f5]',
                )}
              >
                {hecho ? <CheckIcon className="size-3.5" /> : n}
              </span>
              <span
                className={cn(
                  'text-sm',
                  actual ? 'text-foreground font-semibold' : 'text-ink-3 font-medium',
                )}
              >
                {nombre}
              </span>
              {n < PASOS.length && (
                <span aria-hidden="true" className="h-px w-5 bg-[#e6e8ee] sm:w-12" />
              )}
            </li>
          );
        })}
      </ol>

      {paso === 1 && (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex flex-col gap-3">
            {/*
              Un `<label>` con el input adentro: el clic abre el selector del
              sistema sin código, y el teclado llega al input. Arrastrar es un
              agregado, no el único camino.
            */}
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setArrastrando(true);
              }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastrando(false);
                const file = e.dataTransfer.files[0];
                if (file && listo) leer(file);
              }}
              className={cn(
                'focus-within:ring-focus-tint flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors focus-within:ring-3',
                listo ? 'cursor-pointer' : 'cursor-wait opacity-70',
                arrastrando
                  ? 'border-[#3b5bdb] bg-[#f5f7fe]'
                  : 'border-[#d8dce4] bg-white hover:border-[#3b5bdb] hover:bg-[#f5f7fe]',
              )}
            >
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                aria-label="Archivo CSV"
                disabled={!listo}
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  // Vaciarlo deja volver a elegir el mismo archivo corregido.
                  e.currentTarget.value = '';
                  if (file) leer(file);
                }}
              />
              <span className="flex size-12 items-center justify-center rounded-full bg-[#edf1fe] text-[#2b47bd]">
                <UploadIcon className="size-[22px]" />
              </span>
              <span className="text-[15px] font-semibold">Arrastrá tu planilla acá</span>
              <span className="text-ink-3 text-[13px]">
                {listo
                  ? 'o hacé clic para elegirla · un archivo CSV'
                  : 'Cargando el catálogo actual…'}
              </span>
            </label>
            {errorArchivo && (
              <p className="text-destructive text-sm" role="alert">
                {errorArchivo}
              </p>
            )}
          </div>

          <Tarjeta sinRelleno>
            <TituloDeTarjeta>Columnas que se leen</TituloDeTarjeta>
            <div className="flex flex-col gap-3 px-5 pb-5">
              <ul aria-label="Columnas" className="flex flex-wrap gap-1.5">
                {COLUMNAS.map((c) => (
                  <li
                    key={c}
                    className={cn(
                      'rounded-md px-2 py-0.5 font-mono text-[12px]',
                      OBLIGATORIAS.includes(c)
                        ? 'bg-[#edf1fe] text-[#2b47bd]'
                        : 'text-ink-2 bg-[#f1f2f5]',
                    )}
                  >
                    {c}
                  </li>
                ))}
              </ul>
              <p className="text-ink-3 text-[13px]">
                En azul, las obligatorias. Una fila por variante: las que comparten{' '}
                <code>handle</code> forman un producto. Los atributos van como{' '}
                <code>color: Azul | size: M</code>. El archivo no lleva fotos: importar no toca las
                que el producto ya tiene.
              </p>
              <p className="text-ink-3 text-[13px]">
                Para un producto que ya existe, el archivo manda: sus variantes pasan a ser
                exactamente las del archivo.
              </p>
              {/*
                La columna `stock` del archivo habla de una sucursal, en las dos
                direcciones. El control va dentro del `<label>`: así queda
                asociado sin inventar un id.
              */}
              {varias && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13.5px] font-medium">Sucursal del stock</span>
                  <Selector
                    value={elegida ?? ''}
                    aria-label="Sucursal del stock"
                    onValueChange={setSucursal}
                  >
                    {sucursales.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </Selector>
                  <span className="text-ink-3 text-xs">
                    La columna <code>stock</code> se exporta y se importa contra esta sucursal.
                  </span>
                </label>
              )}
              <Button
                variant="outline"
                className="self-start"
                onClick={() =>
                  descargar(
                    'plantilla-productos.csv',
                    Papa.unparse(FILAS_PLANTILLA, { columns: [...COLUMNAS] }),
                  )
                }
              >
                <DownloadIcon />
                Descargar plantilla
              </Button>
            </div>
          </Tarjeta>
        </div>
      )}

      {paso === 2 && preparado && (
        <Revision
          preparado={preparado}
          archivo={archivo ?? ''}
          existentes={existentes.data ?? new Set()}
          vista={vista}
          onVista={(v) => {
            setVista(v);
            setPagina(1);
          }}
          pagina={pagina}
          onPagina={setPagina}
          importando={importar.isPending}
          avance={avance}
          error={importar.isError ? (importar.error as Error).message : null}
          onImportar={() => importar.mutate()}
          onDescartar={otraVez}
        />
      )}

      {paso === 3 && preparado && reporte && (
        <Resultado preparado={preparado} reporte={reporte} onOtro={otraVez} />
      )}
    </PaginaAdmin>
  );
}

function Revision({
  preparado,
  archivo,
  existentes,
  vista,
  onVista,
  pagina,
  onPagina,
  importando,
  avance,
  error,
  onImportar,
  onDescartar,
}: {
  preparado: Preparado;
  archivo: string;
  existentes: ReadonlySet<string>;
  vista: 'todas' | 'errores';
  onVista: (v: 'todas' | 'errores') => void;
  pagina: number;
  onPagina: (p: number) => void;
  importando: boolean;
  avance: { hechos: number; total: number } | null;
  error: string | null;
  onImportar: () => void;
  onDescartar: () => void;
}) {
  const conError = preparado.filas.filter((f) => f.motivo);
  const listas = preparado.filas.length - conError.length;
  const visibles = vista === 'errores' ? conError : preparado.filas;
  const pageCount = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
  const enPagina = visibles.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta className="flex flex-wrap items-center gap-3">
        <span className="text-ink-3 flex size-9 items-center justify-center rounded-lg bg-[#f1f2f5]">
          <FileIcon className="size-[18px]" />
        </span>
        <span className="flex min-w-48 flex-1 flex-col">
          <span className="truncate text-sm font-semibold">{archivo}</span>
          <span className="text-ink-3 text-[13px]">
            {plural(preparado.filas.length, 'fila', 'filas')} ·{' '}
            {plural(preparado.nuevos, 'producto nuevo', 'productos nuevos')} y{' '}
            {preparado.existentes} a actualizar
          </span>
        </span>
        <Badge variant="green">{plural(listas, 'lista', 'listas')}</Badge>
        {conError.length > 0 && <Badge variant="red">{conError.length} con errores</Badge>}
      </Tarjeta>

      <Tarjeta sinRelleno>
        {conError.length > 0 && (
          <div className="px-5 pt-4 pb-3">
            <Segmentado
              etiqueta="Qué filas mostrar"
              valor={vista}
              onCambiar={onVista}
              opciones={[
                { valor: 'todas', etiqueta: `Todas (${preparado.filas.length})` },
                { valor: 'errores', etiqueta: `Con errores (${conError.length})` },
              ]}
            />
          </div>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Fila</TableHead>
                <TableHead className="hidden sm:table-cell">SKU</TableHead>
                <TableHead>Título</TableHead>
                <TableHead className="hidden text-right md:table-cell">Precio</TableHead>
                <TableHead className="hidden text-right md:table-cell">Stock</TableHead>
                <TableHead>Resultado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enPagina.map((f) => (
                <TableRow key={f.linea}>
                  <TableCell className="text-ink-3 tabular-nums">{f.linea}</TableCell>
                  <TableCell className="hidden font-mono text-[12.5px] sm:table-cell">
                    {f.sku}
                  </TableCell>
                  <TableCell className="max-w-64 truncate">
                    {f.titulo}
                    {/* En el teléfono el SKU va debajo: la columna que no se puede perder es el resultado. */}
                    <span className="text-ink-3 block font-mono text-[11.5px] sm:hidden">
                      {f.sku}
                    </span>
                  </TableCell>
                  {/* Lo que dice el archivo, sin formatear: una errata se ve como está. */}
                  <TableCell className="hidden text-right tabular-nums md:table-cell">
                    {f.precio}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">
                    {f.stock}
                  </TableCell>
                  <TableCell className="min-w-44 whitespace-normal">
                    {f.motivo ? (
                      <span className="text-destructive flex items-start gap-1.5 text-[13px]">
                        <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
                        {f.motivo}
                      </span>
                    ) : existentes.has(f.handle) ? (
                      <span className="flex items-center gap-1.5 text-[13px] text-[#2b47bd]">
                        <CheckCircleIcon className="size-3.5" />
                        Se actualiza
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-[13px] text-[#13774a]">
                        <CheckCircleIcon className="size-3.5" />
                        Nuevo
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Paginacion
          datos={{ total: visibles.length, page: pagina, pageCount, perPage: POR_PAGINA }}
          sustantivo="filas"
          cargando={false}
          onPagina={onPagina}
        />
      </Tarjeta>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-3 max-w-xl text-[13px]">
          {conError.length > 0
            ? 'Las filas con errores no se importan, y tampoco el resto de su producto: corregilas en la planilla y volvé a subirla.'
            : 'Hasta que importes no se escribe nada: el archivo sólo se leyó.'}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" disabled={importando} onClick={onDescartar}>
            Descartar
          </Button>
          <Button disabled={listas === 0 || importando} onClick={onImportar}>
            {importando
              ? `Importando… ${avance?.hechos ?? 0}/${avance?.total ?? 0}`
              : `Importar ${plural(listas, 'fila', 'filas')}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Resultado({
  preparado,
  reporte,
  onOtro,
}: {
  preparado: Preparado;
  reporte: readonly ResultadoImport[];
  onOtro: () => void;
}) {
  const creados = reporte.filter((r) => r.accion === 'creado').length;
  const actualizados = reporte.filter((r) => r.accion === 'actualizado').length;
  const rechazados = reporte.filter((r) => !r.ok);
  const afuera = preparado.filas.filter((f) => f.motivo);
  const algo = creados + actualizados > 0;

  return (
    <Tarjeta className="flex flex-col items-center gap-3 py-10 text-center">
      <span
        className={cn(
          'flex size-12 items-center justify-center rounded-full',
          algo ? 'bg-[#e8f6ee] text-[#13774a]' : 'bg-[#fdf4e3] text-[#9a5b0b]',
        )}
      >
        {algo ? <CheckCircleIcon className="size-6" /> : <AlertCircleIcon className="size-6" />}
      </span>
      <p className="text-[17px] font-semibold" role="status">
        {algo ? 'Catálogo actualizado' : 'No se importó ningún producto'}
      </p>
      <p className="text-ink-3 max-w-md text-sm">
        {plural(creados, 'producto nuevo', 'productos nuevos')} y{' '}
        {plural(actualizados, 'actualizado', 'actualizados')}.
        {afuera.length > 0 &&
          ` ${plural(afuera.length, 'fila quedó', 'filas quedaron')} afuera por errores.`}
        {rechazados.length > 0 &&
          ` ${plural(rechazados.length, 'producto no se pudo', 'productos no se pudieron')} guardar.`}
      </p>

      {rechazados.length > 0 && (
        <ul className="text-destructive max-w-md text-left text-[13px]">
          {rechazados.slice(0, 5).map((r) => (
            <li key={r.indice}>
              <strong>{r.handle}</strong>: {r.error}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {/* Descargable: un import de cientos de filas no se revisa en pantalla. */}
        <Button
          variant="outline"
          onClick={() =>
            descargar(
              'reporte-import.csv',
              Papa.unparse([
                ...afuera.map((f) => ({
                  linea: f.linea,
                  handle: f.handle,
                  sku: f.sku,
                  resultado: 'rechazada',
                  motivo: f.motivo ?? '',
                })),
                ...reporte.map((r) => ({
                  linea: '',
                  handle: r.handle,
                  sku: '',
                  resultado: r.accion,
                  motivo: r.error ?? '',
                })),
              ]),
            )
          }
        >
          <DownloadIcon />
          Descargar reporte
        </Button>
        <Button variant="outline" onClick={onOtro}>
          Importar otro archivo
        </Button>
        <Link to="/productos" className={buttonVariants()}>
          Ir a productos
        </Link>
      </div>
    </Tarjeta>
  );
}
