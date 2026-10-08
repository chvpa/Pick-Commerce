import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type FieldErrors,
  type Path,
  type UseFormSetValue,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { repositorioAdminCatalogo, subirImagenDeProducto } from '@pick/adapter-supabase';
import {
  ETIQUETA_ESTADO,
  esEditable,
  formatMoney,
  money,
  slugify,
  toMajorUnits,
  type FieldSources,
} from '@pick/commerce-core';
import type { ProductStatus } from '@pick/commerce-types';
import {
  AlertCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
  MinusIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from '@/components/iconos';
import { Esqueleto, EstadoVacio, PaginaAdmin, Selector, Tarjeta } from '@/components/pagina';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SelectItem } from '@/components/ui/select';
import { rutasDeCategorias, useCategorias } from '@/features/tienda/useCategorias';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { useSucursales } from '@/features/tienda/useSucursales';
import { db } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import {
  formatearAtributos,
  parsearAtributos,
  productoParaGuardar,
  productoSchema,
  type FormularioProducto as Valores,
  type ProductoValidado,
} from './esquema';
import { LimpiezaDeFoto } from './LimpiezaDeFoto';
import { SugerenciasDeIA, type CampoAplicable } from './SugerenciasDeIA';

const ESTADOS: readonly ProductStatus[] = ['draft', 'active', 'inactive', 'archived'];

/*
 * «Única» y no vacío: con una sola variante su nombre no se pide —el handoff no
 * lo muestra—, y la base lo necesita para el carrito y la ficha.
 */
const VARIANTE_VACIA = {
  sku: '',
  title: 'Única',
  barcode: '',
  internalCode: '',
  precio: '',
  precioAnterior: '',
  costo: '',
  stock: '',
  atributos: '',
};

const VACIO: Valores = {
  title: '',
  sku: '',
  handle: '',
  description: '',
  brand: '',
  categoryId: '',
  status: 'draft',
  variantes: [VARIANTE_VACIA],
  media: [],
};

/** Las fotos que se subieron a la tienda: se optimizan solas y no piden medidas. */
const DEL_BUCKET = '/storage/v1/object/public/product-media/';

type ControlDelProducto = Control<Valores, unknown, ProductoValidado>;

function Campo({
  label,
  error,
  ayuda,
  className,
  children,
}: {
  label: ReactNode;
  error?: string;
  ayuda?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    /*
     * El control va **dentro** del `<label>`: eso los asocia sin inventar un id
     * por campo. Con la etiqueta al lado y sin `htmlFor` no hay asociación
     * ninguna, y un lector de pantalla anuncia un campo sin nombre.
     */
    <label className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <span className="text-[13.5px] font-medium">{label}</span>
      {children}
      {ayuda && !error && <span className="text-ink-3 text-xs">{ayuda}</span>}
      {/* `role="alert"` para que el lector de pantalla lo anuncie al aparecer. */}
      {error && (
        <span className="text-destructive text-xs" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

/**
 * Un campo atado al formulario por su ruta, controlado.
 *
 * Los de las variantes y las fotos aparecen en dos lugares —la fila y su
 * diálogo—, y dos inputs con `register` sobre el mismo campo no se enteran uno
 * del otro: se escribía en el diálogo y la fila seguía mostrando lo de antes.
 * Leyendo con `useWatch` los dos dibujan el mismo valor. El `name` queda en el
 * DOM porque los smokes encuentran los campos por él.
 */
function Entrada({
  control,
  setValue,
  name,
  validar,
  ...props
}: {
  control: ControlDelProducto;
  setValue: UseFormSetValue<Valores>;
  name: Path<Valores>;
  /** Después del primer intento de guardar, cada cambio vuelve a validar. */
  validar: boolean;
} & Omit<ComponentProps<typeof Input>, 'name' | 'value' | 'onChange'>) {
  const valor = useWatch({ control, name }) as string | number | undefined;
  return (
    <Input
      name={name}
      value={valor ?? ''}
      onChange={(e) =>
        setValue(name, e.currentTarget.value as never, {
          shouldDirty: true,
          shouldValidate: validar,
        })
      }
      {...props}
    />
  );
}

/** Igual que `Entrada`, para los atributos de una variante. */
function AreaDeTexto({
  control,
  setValue,
  name,
  validar,
  ...props
}: {
  control: ControlDelProducto;
  setValue: UseFormSetValue<Valores>;
  name: Path<Valores>;
  validar: boolean;
} & Omit<ComponentProps<'textarea'>, 'name' | 'value' | 'onChange'>) {
  const valor = useWatch({ control, name }) as string | undefined;
  return (
    <textarea
      name={name}
      value={valor ?? ''}
      onChange={(e) =>
        setValue(name, e.currentTarget.value as never, {
          shouldDirty: true,
          shouldValidate: validar,
        })
      }
      className={claseTextarea}
      {...props}
    />
  );
}

const claseTextarea =
  'border-input bg-background focus-visible:border-ring focus-visible:ring-focus-tint min-h-20 rounded-[9px] border px-3 py-2 text-sm outline-none focus-visible:ring-3 disabled:opacity-50';

type ErroresDeVariante = Partial<
  Record<
    'sku' | 'title' | 'precio' | 'precioAnterior' | 'costo' | 'stock' | 'atributos',
    { message?: string }
  >
>;

/**
 * La ficha de un producto, como la dibuja el handoff (ADR-143, ADR-149).
 *
 * Dos columnas: a la izquierda lo que el producto es —título, códigos, fotos,
 * precio y variantes, cómo se ve en Google—, a la derecha cómo se organiza. Con
 * una sola variante no hay tabla: precio y stock son campos del producto. Con
 * varias, la tabla edita lo de todos los días —precio, costo, stock— y el resto
 * va en el diálogo de cada una.
 *
 * Guardar aparece cuando hay algo que guardar, en una barra abajo.
 */
export function FormularioProducto({ id }: { id?: string }) {
  const tienda = useTiendaActiva();
  const navegar = useNavigate();
  const cliente = useQueryClient();
  const repo = repositorioAdminCatalogo(db);

  const cargado = useQuery({
    queryKey: ['producto', tienda.id, id],
    queryFn: () => repo.porId(tienda.id, id!),
    enabled: id !== undefined,
  });

  const categorias = useCategorias();

  // Las marcas que la tienda ya usa, para sugerirlas: la misma consulta que la
  // lista de productos, así que si se vino de ahí no se pide de nuevo.
  const resumen = useQuery({
    queryKey: ['productos', tienda.id, 'resumen'],
    queryFn: () => repo.resumen(tienda.id),
  });

  /*
   * El stock se edita **de una sucursal a la vez**, y con una sola —el caso de
   * todas las tiendas de hoy— no se elige nada y la pantalla es la de siempre.
   */
  const { sucursales, varias, unica } = useSucursales();
  const [sucursal, setSucursal] = useState<string | undefined>(undefined);
  const elegida = sucursal ?? unica ?? sucursales[0]?.id;

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    getValues,
    getFieldState,
    formState: { errors, isSubmitting, isSubmitted, isDirty },
  } = useForm<Valores, unknown, ProductoValidado>({
    resolver: zodResolver(productoSchema),
    defaultValues: VACIO,
  });

  const estado = useWatch({ control, name: 'status' });
  const categoriaElegida = useWatch({ control, name: 'categoryId' });

  const variantes = useFieldArray({ control, name: 'variantes' });
  const medios = useFieldArray({ control, name: 'media' });
  const [varianteAbierta, setVarianteAbierta] = useState<number | null>(null);
  const [fotoAbierta, setFotoAbierta] = useState<number | null>(null);

  const archivoRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [errorImagen, setErrorImagen] = useState<string | null>(null);

  /**
   * Sube la imagen y la agrega con sus dimensiones **reales**.
   *
   * Las mide en el browser con `createImageBitmap`, que es lo único que las
   * conoce sin volver a descargar el archivo. Inventarlas produciría exactamente
   * el salto de layout que las columnas existen para evitar (ADR-034).
   */
  async function subir(archivo: File): Promise<void> {
    setSubiendo(true);
    setErrorImagen(null);
    try {
      const bitmap = await createImageBitmap(archivo);
      const { width, height } = bitmap;
      bitmap.close();

      const { url } = await subirImagenDeProducto(db, tienda.tenantId, archivo);
      medios.append({ url, alt: '', width: String(width), height: String(height) } as never);
    } catch (error) {
      setErrorImagen((error as Error).message);
    } finally {
      setSubiendo(false);
    }
  }

  /** Qué campos administra el ERP. Ausente = los administra el comercio. */
  const fuentes: FieldSources = cargado.data?.fieldSources ?? {};

  useEffect(() => {
    const cargadoOk = cargado.data;
    if (!cargadoOk) return;
    const p = cargadoOk.producto;
    reset({
      id: p.id,
      title: p.title,
      sku: p.sku ?? '',
      handle: p.handle,
      description: p.description ?? '',
      brand: p.brand ?? '',
      categoryId: p.categoryId ?? '',
      status: p.status,
      variantes: p.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        title: v.title,
        barcode: v.barcode ?? '',
        internalCode: v.internalCode ?? '',
        precio: String(toMajorUnits({ amount: v.price, currency: v.currency as 'PYG' })),
        precioAnterior:
          v.compareAtPrice === undefined
            ? ''
            : String(toMajorUnits({ amount: v.compareAtPrice, currency: v.currency as 'PYG' })),
        costo:
          v.cost === undefined
            ? ''
            : String(toMajorUnits({ amount: v.cost, currency: v.currency as 'PYG' })),
        stock: v.stock === undefined ? '' : String(v.stock),
        atributos: formatearAtributos(v.attributes),
      })),
      // El formulario administra las imágenes, así que siempre manda la clave:
      // vacía significa "sin imágenes", no "no las toques".
      media: (p.media ?? []).map((m) => ({
        ...m,
        width: String(m.width),
        height: String(m.height),
      })),
    } as unknown as Valores);
  }, [cargado.data, reset]);

  /*
   * El stock que se muestra es el de la sucursal elegida, no la suma.
   *
   * Aparte del `reset` y no adentro porque también corre al **cambiar** de
   * sucursal, y ahí resetear el formulario entero tiraría lo que se esté
   * editando. Se empareja por id de variante.
   */
  useEffect(() => {
    const p = cargado.data?.producto;
    if (!p || !elegida) return;
    getValues('variantes').forEach((fila, i) => {
      const v = p.variants.find((x) => x.id === fila.id);
      if (v) setValue(`variantes.${i}.stock`, String(v.stockPorSucursal?.[elegida] ?? 0));
    });
  }, [cargado.data, elegida, getValues, setValue]);

  // El handle se propone desde el título mientras nadie lo haya tocado: es la
  // URL pública del producto y cambiarla después rompe los enlaces que ya
  // circulan, así que se propone una vez y no se vuelve a pisar.
  const title = useWatch({ control, name: 'title' });
  useEffect(() => {
    if (id !== undefined) return;
    if (getFieldState('handle').isDirty) return;
    setValue('handle', slugify(title ?? ''));
  }, [title, id, getFieldState, setValue]);

  const guardar = useMutation({
    mutationFn: async (valores: ProductoValidado) =>
      repo.guardar(tienda.id, productoParaGuardar(valores, tienda.currency as 'PYG', elegida)),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['productos', tienda.id] });
      // Y la ficha, que quedaba cacheada con lo de antes: volver a abrirla
      // mostraba el valor viejo hasta que la consulta se revalidara sola.
      await cliente.invalidateQueries({ queryKey: ['producto', tienda.id] });
      await cliente.invalidateQueries({ queryKey: ['sucursales', tienda.id] });
      await navegar({ to: '/productos' });
    },
  });

  if (id !== undefined && cargado.isPending) {
    return (
      <PaginaAdmin titulo="Producto">
        <Tarjeta sinRelleno>
          <Esqueleto />
        </Tarjeta>
      </PaginaAdmin>
    );
  }

  if (id !== undefined && cargado.data === null) {
    return (
      <PaginaAdmin titulo="Producto">
        <Tarjeta sinRelleno>
          <EstadoVacio
            titulo="Este producto no existe en la tienda seleccionada"
            accion={
              <Link to="/productos" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
                Volver a productos
              </Link>
            }
          >
            Puede haberse archivado, o pertenecer a otra tienda de la organización.
          </EstadoVacio>
        </Tarjeta>
      </PaginaAdmin>
    );
  }

  const pendiente = isSubmitting || guardar.isPending;
  const original = cargado.data?.producto;
  const publicado = estado === 'active';
  const unaSola = variantes.fields.length === 1;
  const comun = { control, setValue, validar: isSubmitted };
  const opcionesDeCategoria = rutasDeCategorias(categorias.data ?? []);

  const agregarVariante = () => {
    variantes.append({
      ...VARIANTE_VACIA,
      title: '',
      // El código del modelo como punto de partida: casi siempre la variante es
      // el modelo más su talle o su color.
      sku: getValues('sku') ? `${getValues('sku')}-` : '',
    } as never);
    setVarianteAbierta(variantes.fields.length);
  };

  return (
    /*
      El `<form>` envuelve a la página y no al revés: así la barra de guardar
      puede vivir abajo y seguir siendo el submit de este formulario.
    */
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit((valores) => guardar.mutateAsync(valores))(e);
      }}
      noValidate
    >
      <PaginaAdmin
        titulo={original ? original.title : 'Nuevo producto'}
        acciones={
          <>
            {/*
              El interruptor del handoff: publica o lo saca de la tienda. Es un
              campo más del formulario —se guarda con el resto—, y los otros
              estados se eligen en «Organización».
            */}
            <button
              type="button"
              role="switch"
              aria-checked={publicado}
              title={
                publicado
                  ? 'Se ve en la tienda. Tocá para ocultarlo'
                  : 'No se ve en la tienda. Tocá para publicarlo'
              }
              onClick={() =>
                setValue(
                  'status',
                  publicado
                    ? original && original.status !== 'active'
                      ? original.status
                      : id
                        ? 'inactive'
                        : 'draft'
                    : 'active',
                  { shouldDirty: true },
                )
              }
              className="focus-visible:ring-focus-tint inline-flex h-9 cursor-pointer items-center gap-2.5 rounded-[9px] border border-[#e1e4ea] bg-white px-3 text-sm font-medium outline-none hover:bg-[#f7f8fa] focus-visible:ring-3"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                  publicado ? 'bg-[#3b5bdb]' : 'bg-[#d3d7df]',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-[left]',
                    publicado ? 'left-[18px]' : 'left-0.5',
                  )}
                />
              </span>
              {publicado ? 'Publicado' : 'Oculto'}
            </button>
            {original?.status === 'active' && tienda.domain && (
              <a
                href={`https://${tienda.domain}/productos/${original.handle}`}
                target="_blank"
                rel="noreferrer"
                aria-label="Ver en la tienda"
                title="Ver en la tienda"
                className={cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'size-9')}
              >
                <ExternalLinkIcon className="size-4" />
              </a>
            )}
          </>
        }
      >
        {guardar.isError && (
          <p className="text-destructive text-sm" role="alert">
            {(guardar.error as Error).message}
          </p>
        )}
        {isSubmitted && Object.keys(errors).length > 0 && (
          <p className="text-destructive flex items-center gap-2 text-sm" role="alert">
            <AlertCircleIcon className="size-4" />
            Revisá los campos marcados.
          </p>
        )}

        <div className="flex flex-wrap items-start gap-5">
          <div className="flex min-w-0 flex-[2_1_520px] flex-col gap-5">
            <Tarjeta className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
                <Campo
                  label="Título"
                  error={errors.title?.message}
                  ayuda={esEditable(fuentes, 'title') ? undefined : 'Lo administra el ERP'}
                >
                  <Input {...register('title')} disabled={!esEditable(fuentes, 'title')} />
                </Campo>
                <Campo
                  label="SKU"
                  error={errors.sku?.message}
                  ayuda={
                    esEditable(fuentes, 'sku')
                      ? 'Del producto. Lo comparten todas las variantes'
                      : 'Lo administra el ERP'
                  }
                >
                  <Input
                    {...register('sku')}
                    disabled={!esEditable(fuentes, 'sku')}
                    className="font-mono text-[13px]"
                  />
                </Campo>
              </div>
              <Campo label="Descripción" error={errors.description?.message}>
                <textarea
                  {...register('description')}
                  disabled={!esEditable(fuentes, 'description')}
                  rows={5}
                  className={claseTextarea}
                />
              </Campo>
            </Tarjeta>

            <SugerenciasDeIA
              storeId={tienda.id}
              fuentes={fuentes}
              categorias={(categorias.data ?? []).map((c) => ({ id: c.id, nombre: c.name }))}
              variantes={(getValues('variantes') ?? []).map((v) => ({
                titulo: v.title ?? '',
                atributos: v.atributos ?? '',
              }))}
              /*
               * Se lee del formulario y no de lo que trajo la consulta: lo que se
               * enriquece es lo que hay en pantalla, con los cambios sin guardar
               * incluidos.
               */
              leer={() => {
                const v = getValues();
                return {
                  title: v.title ?? '',
                  description: v.description,
                  brand: v.brand,
                  categoria: (categorias.data ?? []).find((c) => c.id === v.categoryId)?.name,
                  variantes: (v.variantes ?? []).map((x) => ({
                    title: x.title ?? '',
                    atributos: parsearAtributos(x.atributos ?? ''),
                  })),
                  // Las del bucket, que es público: OpenAI las descarga por URL.
                  imagenes: (v.media ?? []).map((m) => m.url).filter(Boolean),
                };
              }}
              aplicar={(campo: CampoAplicable, valor: string) =>
                setValue(campo, valor, { shouldDirty: true })
              }
              aplicarAtributos={(i, texto) =>
                setValue(`variantes.${i}.atributos`, texto, { shouldDirty: true })
              }
            />

            <Fotos
              medios={medios.fields}
              control={control}
              errores={errors}
              subiendo={subiendo}
              errorImagen={errorImagen}
              onSubir={() => archivoRef.current?.click()}
              onPegar={() => {
                medios.append({ url: '', alt: '', width: '', height: '' } as never);
                setFotoAbierta(medios.fields.length);
              }}
              onAbrir={setFotoAbierta}
            />
            <input
              ref={archivoRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
              className="hidden"
              onChange={(e) => {
                const archivo = e.currentTarget.files?.[0];
                e.currentTarget.value = '';
                if (archivo) void subir(archivo);
              }}
            />

            {/*
              Con varias sucursales, el stock es el de **una** y hay que decir
              cuál. Cambiar de sucursal recarga los números; lo demás no se toca.
            */}
            {unaSola ? (
              <Tarjeta className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-[15px] font-semibold">Precio y stock</h2>
                  <Button type="button" variant="outline" size="sm" onClick={agregarVariante}>
                    <PlusIcon />
                    Agregar variantes
                  </Button>
                </div>
                {varias && (
                  <SucursalDelStock
                    sucursales={sucursales}
                    elegida={elegida}
                    onElegir={setSucursal}
                  />
                )}
                <CamposDeVariante
                  i={0}
                  comun={comun}
                  errores={errors.variantes?.[0] as ErroresDeVariante | undefined}
                  fuentes={fuentes}
                  moneda={tienda.currency}
                  conNombre={false}
                />
                <Margen control={control} moneda={tienda.currency} locale={tienda.locale} />
              </Tarjeta>
            ) : (
              <Tarjeta sinRelleno>
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-[18px] pb-3">
                  <h2 className="text-[15px] font-semibold">Variantes</h2>
                  <Button type="button" variant="outline" size="sm" onClick={agregarVariante}>
                    <PlusIcon />
                    Agregar variante
                  </Button>
                </div>
                {varias && (
                  <div className="px-5 pb-3">
                    <SucursalDelStock
                      sucursales={sucursales}
                      elegida={elegida}
                      onElegir={setSucursal}
                    />
                  </div>
                )}
                <TablaDeVariantes
                  filas={variantes.fields}
                  comun={comun}
                  errores={errors}
                  fuentes={fuentes}
                  onEditar={setVarianteAbierta}
                  onQuitar={(i) => variantes.remove(i)}
                />
              </Tarjeta>
            )}

            <VistaDeGoogle
              control={control}
              registro={register('handle')}
              errorDeUrl={errors.handle?.message}
              nuevo={id === undefined}
            />
          </div>

          <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
            <Tarjeta className="flex flex-col gap-4">
              <h2 className="text-[15px] font-semibold">Organización</h2>
              {/*
                Estado y categoría se leen con `useWatch` y se escriben con
                `setValue` en vez de con `register`: un desplegable de Base UI
                devuelve el valor elegido y no un evento de cambio.
              */}
              <Campo label="Estado" error={errors.status?.message}>
                <Selector
                  value={estado}
                  aria-label="Estado"
                  onValueChange={(v) =>
                    setValue('status', v as Valores['status'], { shouldDirty: true })
                  }
                >
                  {ESTADOS.map((e) => (
                    <SelectItem key={e} value={e}>
                      {ETIQUETA_ESTADO[e]}
                    </SelectItem>
                  ))}
                </Selector>
              </Campo>
              <Campo label="Categoría" error={errors.categoryId?.message}>
                <Selector
                  value={categoriaElegida ?? ''}
                  aria-label="Categoría"
                  onValueChange={(v) => setValue('categoryId', v, { shouldDirty: true })}
                >
                  <SelectItem value="">Sin categoría</SelectItem>
                  {opcionesDeCategoria.map((c) => (
                    <SelectItem key={c.valor} value={c.valor}>
                      {c.etiqueta}
                    </SelectItem>
                  ))}
                </Selector>
              </Campo>
              <Campo
                label="Marca"
                error={errors.brand?.message}
                ayuda={esEditable(fuentes, 'brand') ? undefined : 'La administra el ERP'}
              >
                <Input
                  {...register('brand')}
                  disabled={!esEditable(fuentes, 'brand')}
                  list="marcas-de-la-tienda"
                  autoComplete="off"
                />
                {/* Las que ya usa la tienda: «Nike» y «nike» serían dos marcas en el filtro. */}
                <datalist id="marcas-de-la-tienda">
                  {(resumen.data?.marcas ?? []).map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </Campo>
            </Tarjeta>
          </div>
        </div>

        {(isDirty || id === undefined) && (
          <div
            role="region"
            aria-label="Cambios sin guardar"
            className="shadow-modal fixed inset-x-4 bottom-4 z-30 flex items-center gap-2 rounded-xl bg-[#0e1525] p-1.5 pl-4 text-white sm:inset-x-auto sm:bottom-6 sm:left-1/2 sm:-translate-x-1/2"
          >
            <AlertCircleIcon className="size-4 text-[#f5b94a]" />
            <span className="mr-2 text-[13.5px] font-medium whitespace-nowrap">
              {id === undefined ? 'Producto nuevo' : 'Cambios sin guardar'}
            </span>
            <button
              type="button"
              disabled={pendiente}
              onClick={() => (id === undefined ? void navegar({ to: '/productos' }) : reset())}
              className="ml-auto flex h-8 cursor-pointer items-center rounded-lg px-3 text-[13.5px] font-medium text-[#c9cedb] outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-40 sm:ml-0"
            >
              Descartar
            </button>
            {/* `disabled` mientras envía: sin eso, dos clicks son dos productos. */}
            <button
              type="submit"
              disabled={pendiente}
              className="flex h-8 cursor-pointer items-center rounded-lg bg-white px-3.5 text-[13.5px] font-medium text-[#0e1525] outline-none hover:bg-[#eef0f4] focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-wait disabled:opacity-60"
            >
              {pendiente ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        )}

        <Dialog
          open={varianteAbierta !== null}
          onOpenChange={(abierto) => !abierto && setVarianteAbierta(null)}
        >
          {varianteAbierta !== null && varianteAbierta < variantes.fields.length && (
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  <NombreDeVariante control={control} i={varianteAbierta} />
                </DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4 px-5 py-4">
                <CamposDeVariante
                  i={varianteAbierta}
                  comun={comun}
                  errores={errors.variantes?.[varianteAbierta] as ErroresDeVariante | undefined}
                  fuentes={fuentes}
                  moneda={tienda.currency}
                  conNombre
                />
              </div>
              <DialogFooter>
                {variantes.fields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-[#bf3324] hover:text-[#bf3324]"
                    onClick={() => {
                      variantes.remove(varianteAbierta);
                      setVarianteAbierta(null);
                    }}
                  >
                    <Trash2Icon />
                    Quitar variante
                  </Button>
                )}
                <Button type="button" className="ml-auto" onClick={() => setVarianteAbierta(null)}>
                  Listo
                </Button>
              </DialogFooter>
            </DialogContent>
          )}
        </Dialog>

        <Dialog
          open={fotoAbierta !== null}
          onOpenChange={(abierto) => !abierto && setFotoAbierta(null)}
        >
          {fotoAbierta !== null && fotoAbierta < medios.fields.length && (
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{fotoAbierta === 0 ? 'Foto de portada' : 'Foto'}</DialogTitle>
              </DialogHeader>
              <DialogoDeFoto i={fotoAbierta} comun={comun} errores={errors} />
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-[#bf3324] hover:text-[#bf3324]"
                  onClick={() => {
                    medios.remove(fotoAbierta);
                    setFotoAbierta(null);
                  }}
                >
                  <Trash2Icon />
                  Quitar
                </Button>
                {fotoAbierta > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      medios.move(fotoAbierta, 0);
                      setFotoAbierta(null);
                    }}
                  >
                    Hacer portada
                  </Button>
                )}
                <Button type="button" className="ml-auto" onClick={() => setFotoAbierta(null)}>
                  Listo
                </Button>
              </DialogFooter>
            </DialogContent>
          )}
        </Dialog>
      </PaginaAdmin>
    </form>
  );
}

function SucursalDelStock({
  sucursales,
  elegida,
  onElegir,
}: {
  sucursales: readonly { id: string; name: string }[];
  elegida: string | undefined;
  onElegir: (id: string) => void;
}) {
  return (
    <Campo label="Sucursal del stock" ayuda="El stock es el de esta sucursal">
      <Selector value={elegida ?? ''} aria-label="Sucursal del stock" onValueChange={onElegir}>
        {sucursales.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </Selector>
    </Campo>
  );
}

/**
 * Lo editable de una variante. Con una sola, va en la ficha y sin nombre —es
 * «Única»—; con varias, en su diálogo.
 */
function CamposDeVariante({
  i,
  comun,
  errores,
  fuentes,
  moneda,
  conNombre,
}: {
  i: number;
  comun: { control: ControlDelProducto; setValue: UseFormSetValue<Valores>; validar: boolean };
  errores?: ErroresDeVariante;
  fuentes: FieldSources;
  moneda: string;
  conNombre: boolean;
}) {
  const precioDelErp = !esEditable(fuentes, 'price');
  const stockDelErp = !esEditable(fuentes, 'stock');
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {conNombre && (
        <Campo label="Nombre" error={errores?.title?.message} className="sm:col-span-3">
          <Entrada {...comun} name={`variantes.${i}.title`} placeholder="M, Azul, 42…" />
        </Campo>
      )}
      <Campo
        label={`Precio (${moneda})`}
        error={errores?.precio?.message}
        ayuda={precioDelErp ? 'Lo administra el ERP' : undefined}
      >
        <Entrada
          {...comun}
          name={`variantes.${i}.precio`}
          inputMode="numeric"
          disabled={precioDelErp}
        />
      </Campo>
      <Campo
        label={
          <>
            Costo <span className="text-ink-faint font-normal">opcional</span>
          </>
        }
        error={errores?.costo?.message}
      >
        <Entrada {...comun} name={`variantes.${i}.costo`} inputMode="numeric" />
      </Campo>
      <Campo
        label="Stock"
        error={errores?.stock?.message}
        ayuda={stockDelErp ? 'Lo administra el ERP' : 'Vacío deja el actual'}
      >
        <Entrada
          {...comun}
          name={`variantes.${i}.stock`}
          inputMode="numeric"
          disabled={stockDelErp}
        />
      </Campo>
      <Campo label="SKU" error={errores?.sku?.message}>
        <Entrada {...comun} name={`variantes.${i}.sku`} className="font-mono text-[13px]" />
      </Campo>
      <Campo
        label="Código interno"
        ayuda={
          esEditable(fuentes, 'internal_code')
            ? 'El del sistema de gestión'
            : 'Lo administra el ERP'
        }
      >
        <Entrada
          {...comun}
          name={`variantes.${i}.internalCode`}
          disabled={!esEditable(fuentes, 'internal_code')}
          className="font-mono text-[13px]"
        />
      </Campo>
      <Campo label="Código de barras">
        <Entrada
          {...comun}
          name={`variantes.${i}.barcode`}
          placeholder="EAN o UPC"
          inputMode="numeric"
          className="font-mono text-[13px]"
        />
      </Campo>
      <Campo
        label={
          <>
            Precio anterior <span className="text-ink-faint font-normal">opcional</span>
          </>
        }
        error={errores?.precioAnterior?.message}
        ayuda="Se muestra tachado al lado del precio"
      >
        <Entrada {...comun} name={`variantes.${i}.precioAnterior`} inputMode="numeric" />
      </Campo>
      <Campo
        label="Atributos"
        error={errores?.atributos?.message}
        ayuda="Uno por línea, como color: Azul. Arman los filtros de la tienda."
        className="sm:col-span-2"
      >
        <AreaDeTexto {...comun} name={`variantes.${i}.atributos`} rows={2} />
      </Campo>
    </div>
  );
}

/** «Margen 33 % · ganás Gs. 100.000 por unidad», con una sola variante. */
function Margen({
  control,
  moneda,
  locale,
}: {
  control: ControlDelProducto;
  moneda: string;
  locale: string;
}) {
  const precio = Number(useWatch({ control, name: 'variantes.0.precio' }));
  const costoCrudo = useWatch({ control, name: 'variantes.0.costo' });
  const costo = Number(costoCrudo);
  if (!costoCrudo || !Number.isFinite(precio) || !Number.isFinite(costo) || precio <= 0) {
    return null;
  }
  const margen = Math.round(((precio - costo) / precio) * 100);
  return (
    <p className="text-ink-3 text-[13px]">
      Margen <strong className="text-foreground font-semibold">{margen} %</strong> · ganás{' '}
      {formatMoney(money(precio - costo, moneda as 'PYG'), locale)} por unidad
    </p>
  );
}

function NombreDeVariante({ control, i }: { control: ControlDelProducto; i: number }) {
  const nombre = useWatch({ control, name: `variantes.${i}.title` });
  return <>{nombre ? `Variante ${nombre}` : 'Variante nueva'}</>;
}

/**
 * Las variantes, en una tabla que edita lo de todos los días.
 *
 * Precio, costo y stock se editan en la fila; los códigos, el nombre y los
 * atributos, en el diálogo. «Para todas» copia un precio o un costo a todas las
 * filas de una vez: con veinte talles al mismo precio, es la diferencia entre
 * escribirlo una vez y veinte.
 */
function TablaDeVariantes({
  filas,
  comun,
  errores,
  fuentes,
  onEditar,
  onQuitar,
}: {
  filas: readonly { id: string }[];
  comun: { control: ControlDelProducto; setValue: UseFormSetValue<Valores>; validar: boolean };
  errores: FieldErrors<Valores>;
  fuentes: FieldSources;
  onEditar: (i: number) => void;
  onQuitar: (i: number) => void;
}) {
  const [precioParaTodas, setPrecioParaTodas] = useState('');
  const [costoParaTodas, setCostoParaTodas] = useState('');
  const precioDelErp = !esEditable(fuentes, 'price');
  const stockDelErp = !esEditable(fuentes, 'stock');
  const columnas = 'sm:grid-cols-[minmax(0,1fr)_104px_104px_128px_68px]';

  return (
    <div>
      <div
        className={cn(
          'text-ink-3 hidden h-9 items-center gap-2.5 border-y border-[#f0f1f4] bg-[#fafbfc] px-5 text-[12.5px] sm:grid',
          columnas,
        )}
      >
        <span>Variante</span>
        <span>Precio</span>
        <span>Costo</span>
        <span>Stock</span>
        <span />
      </div>
      <div
        className={cn(
          'hidden items-center gap-2.5 border-b border-[#f0f1f4] px-5 py-2 sm:grid',
          columnas,
        )}
      >
        <span className="text-ink-3 text-[13px]">Para todas</span>
        <Input
          value={precioParaTodas}
          onChange={(e) => setPrecioParaTodas(e.currentTarget.value)}
          placeholder="Precio"
          aria-label="Precio para todas las variantes"
          inputMode="numeric"
          disabled={precioDelErp}
          className="h-8"
        />
        <Input
          value={costoParaTodas}
          onChange={(e) => setCostoParaTodas(e.currentTarget.value)}
          placeholder="Costo"
          aria-label="Costo para todas las variantes"
          inputMode="numeric"
          className="h-8"
        />
        <span />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!precioParaTodas.trim() && !costoParaTodas.trim()}
          onClick={() => {
            filas.forEach((_, i) => {
              const opciones = { shouldDirty: true, shouldValidate: comun.validar };
              if (precioParaTodas.trim() && !precioDelErp) {
                comun.setValue(`variantes.${i}.precio`, precioParaTodas.trim(), opciones);
              }
              if (costoParaTodas.trim()) {
                comun.setValue(`variantes.${i}.costo`, costoParaTodas.trim(), opciones);
              }
            });
            setPrecioParaTodas('');
            setCostoParaTodas('');
          }}
        >
          Aplicar
        </Button>
      </div>

      <ul>
        {filas.map((fila, i) => {
          const conError = Boolean(errores.variantes?.[i]);
          return (
            <li
              key={fila.id}
              className={cn(
                'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 border-b border-[#f0f1f4] px-5 py-2.5 last:border-b-0',
                columnas,
              )}
            >
              <Identidad control={comun.control} i={i} conError={conError} />
              <span className="hidden sm:block">
                <Entrada
                  {...comun}
                  name={`variantes.${i}.precio`}
                  aria-label={`Precio de la variante ${i + 1}`}
                  inputMode="numeric"
                  disabled={precioDelErp}
                  className="h-8"
                />
              </span>
              <span className="hidden sm:block">
                <Entrada
                  {...comun}
                  name={`variantes.${i}.costo`}
                  aria-label={`Costo de la variante ${i + 1}`}
                  inputMode="numeric"
                  className="h-8"
                />
              </span>
              <span className="hidden sm:block">
                <Paso {...comun} i={i} deshabilitado={stockDelErp} />
              </span>
              <span className="flex justify-end gap-1">
                <button
                  type="button"
                  aria-label={`Editar la variante ${i + 1}`}
                  title="Editar variante"
                  onClick={() => onEditar(i)}
                  className="text-ink-3 hover:text-foreground flex size-8 cursor-pointer items-center justify-center rounded-lg outline-none hover:bg-[#f3f4f7] focus-visible:ring-3 focus-visible:ring-[#e4e9fc]"
                >
                  <PencilIcon className="size-[15px]" />
                </button>
                {filas.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Quitar la variante ${i + 1}`}
                    title="Quitar variante"
                    onClick={() => onQuitar(i)}
                    className="text-ink-3 flex size-8 cursor-pointer items-center justify-center rounded-lg outline-none hover:bg-[#fdf1f0] hover:text-[#bf3324] focus-visible:ring-3 focus-visible:ring-[#e4e9fc]"
                  >
                    <Trash2Icon className="size-[15px]" />
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** El nombre y los códigos de una variante, en la fila. */
function Identidad({
  control,
  i,
  conError,
}: {
  control: ControlDelProducto;
  i: number;
  conError: boolean;
}) {
  const tienda = useTiendaActiva();
  const [nombre, sku, barras, precio, stock] = useWatch({
    control,
    name: [
      `variantes.${i}.title`,
      `variantes.${i}.sku`,
      `variantes.${i}.barcode`,
      `variantes.${i}.precio`,
      `variantes.${i}.stock`,
    ],
  });
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate font-medium">{nombre || 'Sin nombre'}</span>
      <span className="text-ink-faint truncate font-mono text-[11px]">
        {[sku, barras].filter(Boolean).join(' · ') || 'Sin códigos'}
      </span>
      {/* En el teléfono la fila no tiene campos: dice lo que hay y se edita en el diálogo. */}
      <span className="text-ink-3 text-[12.5px] sm:hidden">
        {precio && Number.isFinite(Number(precio))
          ? `${formatMoney(money(Number(precio), tienda.currency as 'PYG'), tienda.locale)} · `
          : ''}
        {stock === '' || stock === undefined ? 'stock sin cambiar' : `${stock} en stock`}
      </span>
      {conError && (
        <span className="text-destructive text-xs" role="alert">
          Revisá esta variante
        </span>
      )}
    </span>
  );
}

/** El stock con − y +: lo más común es sumar o restar una unidad. */
function Paso({
  control,
  setValue,
  validar,
  i,
  deshabilitado,
}: {
  control: ControlDelProducto;
  setValue: UseFormSetValue<Valores>;
  validar: boolean;
  i: number;
  deshabilitado: boolean;
}) {
  const nombre = `variantes.${i}.stock` as const;
  const valor = useWatch({ control, name: nombre });
  const mover = (delta: number) =>
    setValue(nombre, String((Number(valor) || 0) + delta), {
      shouldDirty: true,
      shouldValidate: validar,
    });
  const boton =
    'text-ink-3 hover:text-foreground flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md outline-none hover:bg-[#f3f4f7] disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <span className="flex items-center gap-0.5">
      <button
        type="button"
        aria-label={`Restar 1 al stock de la variante ${i + 1}`}
        disabled={deshabilitado}
        onClick={() => mover(-1)}
        className={boton}
      >
        <MinusIcon className="size-3.5" />
      </button>
      <Entrada
        control={control}
        setValue={setValue}
        validar={validar}
        name={nombre}
        aria-label={`Stock de la variante ${i + 1}`}
        inputMode="numeric"
        disabled={deshabilitado}
        className="h-8 px-1.5 text-center tabular-nums"
      />
      <button
        type="button"
        aria-label={`Sumar 1 al stock de la variante ${i + 1}`}
        disabled={deshabilitado}
        onClick={() => mover(1)}
        className={boton}
      >
        <PlusIcon className="size-3.5" />
      </button>
    </span>
  );
}

/**
 * Las fotos, en grilla: la primera es la portada. Tocar una abre su diálogo, con
 * el texto alternativo, la limpieza de fondo y hacerla portada.
 */
function Fotos({
  medios,
  control,
  errores,
  subiendo,
  errorImagen,
  onSubir,
  onPegar,
  onAbrir,
}: {
  medios: readonly { id: string }[];
  control: ControlDelProducto;
  errores: FieldErrors<Valores>;
  subiendo: boolean;
  errorImagen: string | null;
  onSubir: () => void;
  onPegar: () => void;
  onAbrir: (i: number) => void;
}) {
  const urls = useWatch({ control, name: 'media' }) ?? [];
  return (
    <Tarjeta className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Fotos</h2>
        {/*
          Pegar una URL funciona, pero se sirve tal cual y depende de que ese
          sitio siga en pie: las subidas se guardan en la tienda y se optimizan
          solas (ADR-079, ADR-082). Por eso subir es la casilla grande.
        */}
        <Button type="button" variant="ghost" size="sm" onClick={onPegar}>
          Pegar URL
        </Button>
      </div>
      {errorImagen && (
        <p className="text-destructive text-sm" role="alert">
          {errorImagen}
        </p>
      )}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-3">
        {medios.map((m, i) => {
          const url = urls[i]?.url ?? '';
          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onAbrir(i)}
                aria-label={i === 0 ? 'Foto de portada' : `Foto ${i + 1}`}
                className={cn(
                  'relative block aspect-square w-full cursor-pointer overflow-hidden rounded-[10px] border bg-[repeating-linear-gradient(135deg,#f3f4f7_0_5px,#eaecf1_5px_10px)] outline-none focus-visible:ring-3 focus-visible:ring-[#e4e9fc]',
                  errores.media?.[i] ? 'border-destructive' : 'border-[#e6e8ee]',
                )}
              >
                {url && <img src={url} alt="" className="size-full object-cover" />}
                {i === 0 && (
                  <span className="absolute bottom-1.5 left-1.5 rounded-md bg-[#0e1525]/80 px-1.5 py-0.5 text-[11px] font-medium text-white">
                    Portada
                  </span>
                )}
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            disabled={subiendo}
            onClick={onSubir}
            className="text-ink-3 hover:text-foreground flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] border-[1.5px] border-dashed border-[#d3d7df] text-[13px] font-medium outline-none hover:border-[#b9bfcb] focus-visible:ring-3 focus-visible:ring-[#e4e9fc] disabled:cursor-wait"
          >
            <PlusIcon className="size-4" />
            {subiendo ? 'Subiendo…' : 'Agregar'}
          </button>
        </li>
      </ul>
    </Tarjeta>
  );
}

function DialogoDeFoto({
  i,
  comun,
  errores,
}: {
  i: number;
  comun: { control: ControlDelProducto; setValue: UseFormSetValue<Valores>; validar: boolean };
  errores: FieldErrors<Valores>;
}) {
  const url = (useWatch({ control: comun.control, name: `media.${i}.url` }) as string) ?? '';
  const propia = url.includes(DEL_BUCKET);
  const e = errores.media?.[i];
  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      {url && (
        <img
          src={url}
          alt=""
          className="mx-auto max-h-64 rounded-lg border border-[#eef0f3] object-contain"
        />
      )}
      {/*
        Una foto pegada de otro sitio pide su URL y sus medidas, que son
        obligatorias contra el salto de layout (ADR-034). Una subida ya las trae.
      */}
      {!propia && (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_88px_88px]">
          <Campo label="URL" error={e?.url?.message}>
            <Entrada {...comun} name={`media.${i}.url`} placeholder="https://…" />
          </Campo>
          <Campo label="Ancho" error={e?.width?.message}>
            <Entrada {...comun} name={`media.${i}.width`} inputMode="numeric" />
          </Campo>
          <Campo label="Alto" error={e?.height?.message}>
            <Entrada {...comun} name={`media.${i}.height`} inputMode="numeric" />
          </Campo>
        </div>
      )}
      <Campo
        label="Texto alternativo"
        error={e?.alt?.message}
        ayuda="Qué se ve en la foto, para quien no la ve y para Google"
      >
        <Entrada {...comun} name={`media.${i}.alt`} />
      </Campo>
      {url && (
        <LimpiezaDeFoto
          url={url}
          onAplicar={(foto) => {
            const opciones = { shouldDirty: true };
            comun.setValue(`media.${i}.url`, foto.url, opciones);
            comun.setValue(`media.${i}.width`, String(foto.width) as never, opciones);
            comun.setValue(`media.${i}.height`, String(foto.height) as never, opciones);
          }}
        />
      )}
    </div>
  );
}

/**
 * Cómo se ve en Google, con lo que el storefront de verdad publica: el título
 * con el nombre de la tienda y la descripción, o la frase que se usa cuando no
 * hay. La URL se edita acá, que es donde se ve.
 */
function VistaDeGoogle({
  control,
  registro,
  errorDeUrl,
  nuevo,
}: {
  control: ControlDelProducto;
  registro: ReturnType<ReturnType<typeof useForm<Valores, unknown, ProductoValidado>>['register']>;
  errorDeUrl?: string;
  nuevo: boolean;
}) {
  const tienda = useTiendaActiva();
  // Abierta en un producto nuevo: es cuando se decide la URL.
  const [abierta, setAbierta] = useState(nuevo || Boolean(errorDeUrl));
  const [titulo, handle, descripcion, marca] = useWatch({
    control,
    name: ['title', 'handle', 'description', 'brand'],
  });
  const texto =
    descripcion?.trim() ||
    `${titulo || 'Producto'}${marca ? ` de ${marca}` : ''}. Comprá online con envío a todo el país.`;
  const corto = texto.length > 155 ? `${texto.slice(0, 154).trimEnd()}…` : texto;

  return (
    <Tarjeta sinRelleno>
      <button
        type="button"
        aria-expanded={abierta || Boolean(errorDeUrl)}
        onClick={() => setAbierta((a) => !a)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-[#e4e9fc] focus-visible:ring-inset"
      >
        <h2 className="text-[15px] font-semibold">Cómo se ve en Google</h2>
        {abierta ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
      </button>
      {(abierta || Boolean(errorDeUrl)) && (
        <div className="flex flex-col gap-4 border-t border-[#f0f1f4] px-5 py-4">
          <div className="flex flex-col gap-0.5 rounded-[10px] bg-[#fafbfc] p-4">
            <span className="text-[12.5px] text-[#4d5156]">
              {tienda.domain ?? 'tu-tienda'} › productos › {handle || '…'}
            </span>
            <span className="text-[17px] leading-6 text-[#1a0dab]">
              {titulo || 'Título del producto'} · {tienda.name}
            </span>
            <span className="text-[13px] leading-5 text-[#4d5156]">{corto}</span>
          </div>
          <Campo
            label="URL"
            error={errorDeUrl}
            ayuda="La dirección pública del producto: /productos/…. Cambiarla rompe los enlaces que ya circulan."
          >
            <Input {...registro} className="font-mono text-[13px]" />
          </Campo>
        </div>
      )}
    </Tarjeta>
  );
}
