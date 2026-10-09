import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearch } from '@tanstack/react-router';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type RowSelectionState,
} from '@tanstack/react-table';
import { repositorioAdminCatalogo, subirImagenDeProducto } from '@pick/adapter-supabase';
import {
  ETIQUETA_ESTADO,
  ETIQUETA_PESTANA_PRODUCTOS,
  PESTANAS_DE_PRODUCTOS,
  STOCK_BAJO,
  formatMoney,
  type EstadoAlternable,
  type FiltroDeStock,
  type PestanaDeProductos,
  type ResumenProducto,
} from '@pick/commerce-core';
import type { ProductStatus } from '@pick/commerce-types';
import { DialogoDeConfirmacion } from '@/components/acciones';
import {
  CameraIcon,
  CameraOffIcon,
  CheckCircleIcon,
  DiscountIcon,
  HourglassIcon,
  LayoutDashboardIcon,
  NoteEditIcon,
  SparklesIcon,
  PlusIcon,
  TagsIcon,
  UploadIcon,
  EyeIcon,
  ArchiveIcon,
} from '@/components/iconos';
import {
  BarraDeSeleccion,
  BotonDeLote,
  CampoDeBusqueda,
  Esqueleto,
  EstadoDeError,
  EstadoVacio,
  FiltroAgregable,
  PaginaAdmin,
  Paginacion,
  Pestanas,
  Tarjeta,
} from '@/components/pagina';
import { buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
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
import { limpiarFondo } from '@/lib/ia';
import { db } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { TOPE_POR_TANDA, limpiarFondosEnLote } from './limpieza';
import { rutasDeCategorias, useCategorias } from '@/features/tienda/useCategorias';

const POR_PAGINA = 20;

const columna = createColumnHelper<ResumenProducto>();

const ICONO_DE_PESTANA: Readonly<
  Record<PestanaDeProductos, (props: { className?: string }) => ReactNode>
> = {
  todos: LayoutDashboardIcon,
  publicados: EyeIcon,
  borradores: NoteEditIcon,
  sinfoto: CameraOffIcon,
  quieto: HourglassIcon,
  archivados: ArchiveIcon,
};

/** El estado, dicho con su color al lado del interruptor, como el handoff. */
const COLOR_DE_ESTADO: Readonly<Record<ProductStatus, string>> = {
  active: '#13774a',
  draft: '#535b6e',
  inactive: '#9a5b0b',
  archived: '#8a91a2',
};

const STOCKS: readonly { readonly valor: FiltroDeStock; readonly etiqueta: string }[] = [
  { valor: 'sin', etiqueta: 'Sin stock' },
  { valor: 'pocos', etiqueta: 'Quedan pocos' },
  { valor: 'con', etiqueta: 'Con stock' },
];

/**
 * El catálogo, como lo dibuja el handoff (ADR-143, ADR-148).
 *
 * Las pestañas cruzan el estado con lo que la tienda necesita mirar: lo que no
 * tiene foto y lo que no se vende. Antes eran pantallas aparte; ahora son la
 * misma lista con una banda que dice qué hacer, y las pantallas de trabajo —sacar
 * las fotos desde el depósito, la antigüedad por tramo— quedan a un clic.
 *
 * Usa TanStack Table sólo para modelar filas y selección: la búsqueda, los
 * filtros y la paginación son del servidor, como manda ADR-024. ADR-060 dejó
 * escrito que la tabla entraba cuando apareciera la selección múltiple, y es
 * ésta.
 */
export function ListaProductos() {
  const tienda = useTiendaActiva();
  const cliente = useQueryClient();
  const puede = usePuede();
  const escribe = puede('catalog.write');
  const { tab } = useSearch({ from: '/productos' });
  const pestana: PestanaDeProductos = tab ?? 'todos';

  const [texto, setTexto] = useState('');
  const [query, setQuery] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [marca, setMarca] = useState<string | null>(null);
  const [stock, setStock] = useState<FiltroDeStock | null>(null);
  const [page, setPage] = useState(1);
  const [seleccion, setSeleccion] = useState<RowSelectionState>({});
  const [porArchivar, setPorArchivar] = useState<ResumenProducto | null>(null);
  const [lotePorConfirmar, setLotePorConfirmar] = useState<'active' | 'archived' | null>(null);
  /*
   * Los ids se guardan **al abrir** el diálogo, no al confirmar. La selección se
   * limpia sola cuando la lista se refresca —al cambiar la búsqueda o la
   * página—, y con el diálogo abierto eso dejaba la tanda en cero: decía «1
   * foto» y no limpiaba ninguna. Medido.
   */
  const [limpiezaPorConfirmar, setLimpiezaPorConfirmar] = useState<readonly string[] | null>(null);
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null);

  // La búsqueda va al servidor: sin esperar, cada tecla sería una consulta.
  useEffect(() => {
    const id = setTimeout(() => setQuery(texto.trim()), 300);
    return () => clearTimeout(id);
  }, [texto]);

  /*
   * Otra pestaña, otra búsqueda u otro filtro: la página y lo elegido eran de la
   * lista anterior, y actuar sobre lo que nadie ve es la forma de archivar veinte
   * productos sin querer. Se reinician durante el render, como en Pedidos.
   */
  const clave = JSON.stringify([pestana, query, categoria, marca, stock]);
  const [claveVista, setClaveVista] = useState(clave);
  if (clave !== claveVista) {
    setClaveVista(clave);
    setPage(1);
    setSeleccion({});
  }

  const resumen = useQuery({
    queryKey: ['productos', tienda.id, 'resumen'],
    queryFn: () => repositorioAdminCatalogo(db).resumen(tienda.id),
  });

  const categorias = useCategorias();
  const opcionesDeCategoria = useMemo(
    () => rutasDeCategorias(categorias.data ?? []),
    [categorias.data],
  );

  const consulta = useQuery({
    queryKey: ['productos', tienda.id, pestana, query, categoria, marca, stock, page],
    queryFn: () =>
      repositorioAdminCatalogo(db).listar(tienda.id, {
        query,
        pestana,
        ...(categoria ? { categoria } : {}),
        ...(marca ? { marca } : {}),
        ...(stock ? { stock } : {}),
        page,
        perPage: POR_PAGINA,
      }),
    // Sin esto la tabla parpadea a vacío en cada página y en cada búsqueda.
    placeholderData: keepPreviousData,
  });

  /**
   * La limpieza de fondos, en tanda (ADR-130).
   *
   * Se resuelven primero las fotos en el servidor —la tabla no las trae todas—,
   * y después va una imagen por pedido al Worker del Admin. Nada se publica: lo
   * que queda es una propuesta por producto, para revisar con la original al
   * lado.
   */
  const limpieza = useMutation({
    mutationFn: async (ids: readonly string[]) => {
      const fotos = await repositorioAdminCatalogo(db).fotosParaLimpiar(tienda.id, ids);
      setProgreso({ hechas: 0, total: Math.min(fotos.length, TOPE_POR_TANDA) });

      return limpiarFondosEnLote(
        fotos,
        {
          limpiar: (url) => limpiarFondo(tienda.id, url),
          subir: async (archivo) =>
            (await subirImagenDeProducto(db, tienda.tenantId, archivo, 'ia')).url,
          proponer: (productId, urls) =>
            repositorioAdminCatalogo(db).proponerFoto(tienda.tenantId, tienda.id, productId, urls),
        },
        (hechas, total) => setProgreso({ hechas, total }),
      );
    },
    onSettled: () => {
      setProgreso(null);
      setSeleccion({});
      void cliente.invalidateQueries({ queryKey: ['propuestas', tienda.id] });
    },
  });

  // El resumen comparte el prefijo: publicar o archivar también mueve los conteos.
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
        meta: { ancho: 'w-10' },
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
            className="relative z-10"
          />
        ),
      }),
      columna.accessor('title', {
        header: 'Producto',
        cell: ({ row }) => {
          const p = row.original;
          return (
            <span className="flex min-w-0 items-center gap-3">
              {p.imagen ? (
                /*
                 * Si no carga, queda el recuadro: los medios viejos guardaban
                 * rutas del storefront —`/products/x.jpg`— que desde el dominio
                 * del Admin no resuelven, y el ícono de imagen rota deja la tabla
                 * con pinta de estar mal.
                 */
                <span className="size-10 shrink-0 overflow-hidden rounded-[9px] bg-[repeating-linear-gradient(135deg,#f3f4f7_0_5px,#eaecf1_5px_10px)]">
                  <img
                    src={p.imagen}
                    alt=""
                    width={40}
                    height={40}
                    className="size-10 object-cover"
                    onError={(e) => {
                      e.currentTarget.hidden = true;
                    }}
                  />
                </span>
              ) : (
                <span
                  title="Sin foto"
                  className="flex size-10 shrink-0 items-center justify-center rounded-[9px] border-[1.5px] border-dashed border-[#d3d7df] text-[#a3aab8]"
                >
                  <CameraOffIcon className="size-[17px]" />
                  <span className="sr-only">Sin foto</span>
                </span>
              )}
              <span className="flex min-w-0 flex-col">
                {/*
                  Toda la fila lleva al producto: el título se estira sobre ella, y
                  el checkbox y el interruptor quedan encima. Un `<tr>` con
                  `onClick` no se alcanza con el teclado.
                */}
                <Link
                  to="/productos/$id"
                  params={{ id: p.id }}
                  className="truncate font-medium outline-none after:absolute after:inset-0 focus-visible:after:ring-3 focus-visible:after:ring-[#e4e9fc] focus-visible:after:ring-inset"
                >
                  {p.title}
                </Link>
                <span className="text-ink-3 hidden truncate text-[12.5px] sm:block">
                  {p.brand ? `${p.brand} · ` : ''}
                  {p.variantes} {p.variantes === 1 ? 'variante' : 'variantes'}
                </span>
                {/*
                  En el teléfono las otras columnas no entran: lo que dicen va acá,
                  en una línea. El interruptor no: publicar y archivar se hacen en
                  lote o desde el producto.
                */}
                <span className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] sm:hidden">
                  <span style={{ color: COLOR_DE_ESTADO[p.status] }}>
                    {ETIQUETA_ESTADO[p.status]}
                  </span>
                  <span className="text-ink-faint">·</span>
                  <span style={{ color: inventario(p).tinta }}>{inventario(p).texto}</span>
                  {p.precioDesde !== undefined && (
                    <>
                      <span className="text-ink-faint">·</span>
                      <span className="text-ink-2 tabular-nums">
                        {formatMoney(
                          { amount: p.precioDesde, currency: (p.currency ?? 'PYG') as 'PYG' },
                          tienda.locale,
                        )}
                      </span>
                    </>
                  )}
                </span>
              </span>
            </span>
          );
        },
      }),
      columna.accessor('status', {
        meta: { ancho: 'w-40', escritorio: true },
        header: 'En la tienda',
        cell: ({ row, getValue }) => {
          const estado = getValue();
          const publicado = estado === 'active';
          return (
            <span className="relative z-10 inline-flex items-center gap-2.5">
              {/*
                Encender siempre publica, venga de donde venga, que es lo que
                significa «habilitarlo de nuevo». Apagar archiva, con
                confirmación porque saca el producto de la tienda. Los otros dos
                estados no caben en un interruptor, así que se leen al lado y se
                eligen desde el formulario.
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
                  // El interruptor no se mueve hasta que la mutación vuelve, así
                  // que cancelar el diálogo lo deja donde estaba.
                  setPorArchivar(row.original);
                }}
              />
              <span className="text-[13px] font-medium" style={{ color: COLOR_DE_ESTADO[estado] }}>
                {ETIQUETA_ESTADO[estado]}
              </span>
            </span>
          );
        },
      }),
      columna.accessor('stock', {
        meta: { ancho: 'w-44', escritorio: true },
        header: 'Inventario',
        cell: ({ row }) => <Inventario producto={row.original} quieto={pestana === 'quieto'} />,
      }),
      columna.accessor('categoria', {
        meta: { ancho: 'w-44', escritorio: true },
        header: 'Categoría',
        cell: ({ getValue }) => (
          <span className="text-ink-2 block truncate text-[13.5px]">{getValue() ?? '—'}</span>
        ),
      }),
      columna.accessor('precioDesde', {
        meta: { ancho: 'w-32', escritorio: true },
        header: () => <span className="block text-right">Precio desde</span>,
        cell: ({ row, getValue }) => (
          <span className="block text-right font-medium whitespace-nowrap tabular-nums">
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
    [cambiarEstado, escribe, pestana, tienda.locale],
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
    initialState: { columnVisibility: { seleccion: escribe } },
  });

  const marcados = tabla.getSelectedRowModel().rows.map((r) => r.original);
  const columnasVisibles = tabla.getVisibleFlatColumns().length;
  const filtrando = Boolean(query || categoria || marca || stock);
  const numero = (n: number) => n.toLocaleString(tienda.locale);

  return (
    <PaginaAdmin
      titulo="Productos"
      descripcion={
        resumen.data
          ? `${numero(resumen.data.todos)} ${resumen.data.todos === 1 ? 'producto' : 'productos'} · ${numero(resumen.data.seVen)} se ven en la tienda`
          : 'Lo que la tienda vende.'
      }
      acciones={
        /*
          Enlaces con pinta de botón, no un `Button` que renderiza un enlace:
          envolverlo le pone `role="button"` y un lector de pantalla lo anuncia
          como botón cuando en realidad navega.
        */
        escribe && (
          <>
            <Link
              to="/productos/caracteristicas"
              className={buttonVariants({ variant: 'outline', size: 'lg' })}
            >
              <TagsIcon aria-hidden="true" />
              Características
            </Link>
            <Link
              to="/productos/importar"
              className={buttonVariants({ variant: 'outline', size: 'lg' })}
            >
              <UploadIcon aria-hidden="true" />
              Importar
            </Link>
            {/*
              El alta con la cámara se muestra a quien puede gastar la clave del
              comercio, que es lo que esa pantalla necesita (ADR-131).
            */}
            {puede('settings.write') && (
              <Link
                to="/productos/camara"
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'lg' }),
                  'border-[#e3dbfb] text-[#5f37cf] hover:bg-[#faf8ff] hover:text-[#5f37cf]',
                )}
              >
                <CameraIcon aria-hidden="true" />
                Cargar con la cámara
              </Link>
            )}
            <Link to="/productos/nuevo" className={buttonVariants({ size: 'lg' })}>
              <PlusIcon aria-hidden="true" />
              Nuevo producto
            </Link>
          </>
        )
      }
    >
      <Pestanas
        etiqueta="Productos por estado"
        to="/productos"
        activa={pestana}
        pestanas={PESTANAS_DE_PRODUCTOS.map((p) => ({
          valor: p,
          etiqueta: ETIQUETA_PESTANA_PRODUCTOS[p],
          icono: ICONO_DE_PESTANA[p],
          ...(resumen.data ? { cuenta: resumen.data[p] } : {}),
        }))}
      />

      {pestana === 'sinfoto' && (
        <Banda
          tono="violeta"
          icono={<SparklesIcon className="size-[17px]" />}
          titulo={
            resumen.data?.ocultaSinFoto === false
              ? 'Estos productos se muestran sin foto'
              : 'Estos productos no se ven en la tienda'
          }
          texto={
            resumen.data?.ocultaSinFoto === false
              ? 'Una foto vende más. Sacales una desde el teléfono, parado en el depósito.'
              : 'La tienda oculta los productos sin foto. Sacales una desde el teléfono y vuelven solos a la vitrina.'
          }
          accion={
            escribe && (
              <Link
                to="/productos/sin-foto"
                className={cn(
                  buttonVariants(),
                  'border-[#5f37cf] bg-[#5f37cf] text-white hover:bg-[#5230b8]',
                )}
              >
                <CameraIcon aria-hidden="true" />
                Fotografiar
              </Link>
            )
          }
        />
      )}

      {pestana === 'quieto' && (
        <Banda
          tono="ambar"
          icono={<HourglassIcon className="size-[17px]" />}
          titulo="Plata inmovilizada en stock que no rota"
          texto="Tienen stock y no se vendieron en los últimos 90 días. Una promoción puede moverlos."
          accion={
            <>
              <Link to="/productos/stock-quieto" className={buttonVariants({ variant: 'outline' })}>
                Ver por antigüedad
              </Link>
              {puede('promotion.write') && (
                <Link to="/promociones/nueva" className={buttonVariants({ variant: 'outline' })}>
                  <DiscountIcon aria-hidden="true" />
                  Crear promoción
                </Link>
              )}
            </>
          }
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <CampoDeBusqueda
          valor={texto}
          onCambio={setTexto}
          placeholder="Título, marca o SKU"
          etiqueta="Buscar productos"
        />
        {opcionesDeCategoria.length > 0 && (
          <FiltroAgregable
            etiqueta="Categoría"
            valor={categoria}
            opciones={opcionesDeCategoria}
            onCambiar={setCategoria}
          />
        )}
        {(resumen.data?.marcas.length ?? 0) > 0 && (
          <FiltroAgregable
            etiqueta="Marca"
            valor={marca}
            opciones={(resumen.data?.marcas ?? []).map((m) => ({ valor: m, etiqueta: m }))}
            onCambiar={setMarca}
          />
        )}
        <FiltroAgregable etiqueta="Stock" valor={stock} opciones={STOCKS} onCambiar={setStock} />
      </div>

      {(cambiarEstado.isError || enLote.isError) && (
        <p className="text-destructive text-sm" role="alert">
          {((cambiarEstado.error ?? enLote.error) as Error).message}
        </p>
      )}

      {(progreso ?? limpieza.data ?? limpieza.error) && (
        <p className="text-sm" aria-live="polite">
          {progreso
            ? `Limpiando fondos: ${progreso.hechas} de ${progreso.total}. Cada foto puede tardar hasta dos minutos.`
            : limpieza.error
              ? `No se pudo limpiar: ${(limpieza.error as Error).message}`
              : `Listo: ${limpieza.data?.hechas ?? 0} ${(limpieza.data?.hechas ?? 0) === 1 ? 'propuesta' : 'propuestas'} para revisar${
                  /*
                   * Con el motivo, no sólo el nombre. La falla más común es que
                   * la tienda no tenga credencial de OpenAI, y sin el motivo el
                   * aviso dejaba a alguien buscando el problema en la foto.
                   */
                  limpieza.data?.errores.length
                    ? `. Falló ${limpieza.data.errores.length}: ${limpieza.data.errores[0]!.title} — ${limpieza.data.errores[0]!.motivo}`
                    : ''
                }.`}
          {!progreso && (limpieza.data?.hechas ?? 0) > 0 && (
            <Link to="/productos/fotos" className="text-link ml-2 font-medium hover:underline">
              Revisar
            </Link>
          )}
        </p>
      )}

      <Tarjeta sinRelleno>
        {consulta.isError ? (
          <EstadoDeError
            titulo="No se pudieron cargar los productos"
            error={consulta.error as Error}
            onReintentar={() => void consulta.refetch()}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table className="sm:min-w-[800px]">
              <TableHeader>
                {tabla.getHeaderGroups().map((grupo) => (
                  <TableRow key={grupo.id}>
                    {grupo.headers.map((h) => (
                      /*
                        El ancho lo declara la columna, no el contenido: sin esto
                        las columnas de números terminan anchas y con el valor
                        flotando en el medio.
                      */
                      <TableHead key={h.id} className={claseDeColumna(h.column.columnDef.meta)}>
                        {h.isPlaceholder
                          ? null
                          : flexRender(h.column.columnDef.header, h.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody aria-busy={consulta.isFetching}>
                {consulta.isPending ? (
                  // Skeleton y no un spinner: conserva el alto de la tabla.
                  <TableRow>
                    <TableCell colSpan={columnasVisibles} className="p-0">
                      <Esqueleto />
                    </TableCell>
                  </TableRow>
                ) : filas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columnasVisibles} className="p-0">
                      <Vacio pestana={pestana} filtrando={filtrando} escribe={escribe} />
                    </TableCell>
                  </TableRow>
                ) : (
                  tabla.getRowModel().rows.map((fila) => (
                    <TableRow
                      key={fila.id}
                      data-state={fila.getIsSelected() ? 'selected' : undefined}
                      className="relative h-16"
                    >
                      {fila.getVisibleCells().map((celda) => (
                        <TableCell
                          key={celda.id}
                          className={cn(
                            'max-w-0 first:max-w-none',
                            claseDeColumna(celda.column.columnDef.meta),
                          )}
                        >
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

        {/* La paginación va dentro de la tarjeta, pegada a lo que pagina. */}
        {datos && (
          <Paginacion
            datos={datos}
            sustantivo="productos"
            cargando={consulta.isFetching}
            onPagina={(p) => {
              setPage(p);
              setSeleccion({});
            }}
          />
        )}
      </Tarjeta>

      <BarraDeSeleccion
        cuenta={marcados.length}
        etiqueta="Acciones sobre los productos elegidos"
        onSoltar={() => setSeleccion({})}
      >
        <BotonDeLote
          icono={CheckCircleIcon}
          etiqueta="Publicar"
          disabled={enLote.isPending}
          onClick={() => setLotePorConfirmar('active')}
        />
        <BotonDeLote
          icono={ArchiveIcon}
          etiqueta="Archivar"
          disabled={enLote.isPending}
          onClick={() => setLotePorConfirmar('archived')}
        />
        {/*
          Limpiar el fondo gasta la clave de OpenAI del comercio, así que lo ve
          quien puede configurarla —owner y admin—, igual que el enriquecimiento.
        */}
        {puede('settings.write') && (
          <BotonDeLote
            icono={SparklesIcon}
            etiqueta="Limpiar fondo con IA"
            disabled={limpieza.isPending}
            onClick={() => setLimpiezaPorConfirmar(marcados.map((p) => p.id))}
          />
        )}
      </BarraDeSeleccion>

      <DialogoDeConfirmacion
        abierto={porArchivar !== null}
        onAbierto={(abierto) => !abierto && setPorArchivar(null)}
        titulo={`¿Archivar «${porArchivar?.title ?? ''}»?`}
        descripcion="Deja de verse en la tienda. Se puede volver a publicar con el mismo interruptor."
        confirmar="Archivar"
        pendiente={cambiarEstado.isPending}
        onConfirmar={() => {
          if (porArchivar) cambiarEstado.mutate({ id: porArchivar.id, status: 'archived' });
          setPorArchivar(null);
        }}
      />

      <DialogoDeConfirmacion
        abierto={limpiezaPorConfirmar !== null}
        onAbierto={(abierto) => !abierto && setLimpiezaPorConfirmar(null)}
        titulo={`¿Limpiar el fondo de ${Math.min(limpiezaPorConfirmar?.length ?? 0, TOPE_POR_TANDA)} ${
          Math.min(limpiezaPorConfirmar?.length ?? 0, TOPE_POR_TANDA) === 1 ? 'foto' : 'fotos'
        }?`}
        descripcion={`Usa la clave de OpenAI de la tienda: cada foto se paga en esa cuenta.${
          (limpiezaPorConfirmar?.length ?? 0) > TOPE_POR_TANDA
            ? ` De ${limpiezaPorConfirmar?.length} seleccionados, se hacen ${TOPE_POR_TANDA} por tanda.`
            : ''
        } No se publica nada: quedan como propuestas, con la original al lado, para aprobar una por una.`}
        confirmar="Limpiar fondo"
        pendiente={limpieza.isPending}
        onConfirmar={() => {
          if (limpiezaPorConfirmar) limpieza.mutate(limpiezaPorConfirmar);
          setLimpiezaPorConfirmar(null);
        }}
      />

      <DialogoDeConfirmacion
        abierto={lotePorConfirmar !== null}
        onAbierto={(abierto) => !abierto && setLotePorConfirmar(null)}
        titulo={
          lotePorConfirmar === 'archived'
            ? `¿Archivar ${marcados.length} ${marcados.length === 1 ? 'producto' : 'productos'}?`
            : `¿Publicar ${marcados.length} ${marcados.length === 1 ? 'producto' : 'productos'}?`
        }
        descripcion={
          lotePorConfirmar === 'archived'
            ? 'Dejan de verse en la tienda. Se pueden volver a publicar.'
            : /* Publicar es la misma semántica que el interruptor de cada fila:
                 publicar es publicar, venga el producto de donde venga. */
              'Pasan a verse en la tienda, incluidos los que estaban en borrador o archivados.'
        }
        confirmar={lotePorConfirmar === 'archived' ? 'Archivar' : 'Publicar'}
        destructivo={lotePorConfirmar === 'archived'}
        pendiente={enLote.isPending}
        onConfirmar={() => {
          if (lotePorConfirmar) {
            enLote.mutate({ ids: marcados.map((p) => p.id), status: lotePorConfirmar });
          }
          setLotePorConfirmar(null);
        }}
      />
    </PaginaAdmin>
  );
}

/** Las columnas de datos se esconden en el teléfono; su contenido va bajo el título. */
function claseDeColumna(meta: unknown): string {
  const m = meta as { ancho?: string; escritorio?: boolean } | undefined;
  return cn(m?.ancho, m?.escritorio && 'hidden sm:table-cell');
}

/** «Sin stock», «3 · quedan pocos» o «24 en 6 variantes», con su color. */
function inventario(p: ResumenProducto): { texto: string; tinta: string; punto: string } {
  if (p.stock <= 0) return { texto: 'Sin stock', tinta: '#bf3324', punto: '#e5484d' };
  if (p.stock <= STOCK_BAJO)
    return { texto: `${p.stock} · quedan pocos`, tinta: '#9a5b0b', punto: '#e8930c' };
  return {
    texto: `${p.stock} en ${p.variantes} ${p.variantes === 1 ? 'variante' : 'variantes'}`,
    tinta: '#353d50',
    punto: '#22a565',
  };
}

function Inventario({ producto: p, quieto }: { producto: ResumenProducto; quieto: boolean }) {
  const { texto, tinta, punto } = inventario(p);
  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1.5 text-[13.5px]" style={{ color: tinta }}>
        <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: punto }} />
        {texto}
      </span>
      {/* En «Stock quieto», cuánto hace: es lo que ordena la pestaña. */}
      {quieto && p.diasSinVender !== undefined && (
        <span className="text-ink-3 text-[12.5px]">{p.diasSinVender} días sin vender</span>
      )}
    </span>
  );
}

function Banda({
  tono,
  icono,
  titulo,
  texto,
  accion,
}: {
  tono: 'violeta' | 'ambar';
  icono: ReactNode;
  titulo: string;
  texto: string;
  accion?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3.5 rounded-xl border px-4 py-3.5',
        tono === 'violeta' ? 'border-[#e9e4fb] bg-[#fcfbff]' : 'border-[#f3e6c4] bg-[#fffcf4]',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-[34px] shrink-0 items-center justify-center rounded-[9px]',
          tono === 'violeta' ? 'bg-[#f0ebfe] text-[#5f37cf]' : 'bg-[#fdf4e3] text-[#9a5b0b]',
        )}
      >
        {icono}
      </span>
      <div className="min-w-[240px] flex-1">
        <p className="font-semibold">{titulo}</p>
        <p className="text-ink-2 mt-0.5 text-[13.5px]">{texto}</p>
      </div>
      {accion && <div className="flex flex-wrap gap-2">{accion}</div>}
    </div>
  );
}

function Vacio({
  pestana,
  filtrando,
  escribe,
}: {
  pestana: PestanaDeProductos;
  filtrando: boolean;
  escribe: boolean;
}) {
  if (filtrando) {
    return (
      <EstadoVacio titulo="Ningún producto coincide">
        Probá con otras palabras o sacá un filtro.
      </EstadoVacio>
    );
  }
  if (pestana === 'todos') {
    return (
      <EstadoVacio
        titulo="Todavía no hay productos"
        accion={
          escribe ? (
            <Link to="/productos/nuevo" className={buttonVariants({ size: 'lg' })}>
              Nuevo producto
            </Link>
          ) : undefined
        }
      >
        Cargá el primero a mano, o traé el catálogo entero desde un CSV.
      </EstadoVacio>
    );
  }
  const TEXTOS: Record<Exclude<PestanaDeProductos, 'todos'>, [string, string]> = {
    publicados: ['Nada publicado todavía', 'Lo que se publica se ve en la tienda.'],
    borradores: ['Sin borradores', 'Un producto en borrador se termina antes de publicarlo.'],
    sinfoto: ['Todo lo publicado tiene foto', 'No queda nada oculto por falta de foto.'],
    quieto: ['Nada quieto', 'Todo lo que tiene stock se vendió en los últimos 90 días.'],
    archivados: ['Nada archivado', 'Lo que se archiva sale de la tienda y queda acá.'],
  };
  const [titulo, texto] = TEXTOS[pestana];
  return <EstadoVacio titulo={titulo}>{texto}</EstadoVacio>;
}
