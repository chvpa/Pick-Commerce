import { useEffect } from 'react';
import { useFieldArray, useForm, useWatch, type UseFormRegister } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { repositorioAdminCatalogo, repositorioCatalogo } from '@pick/adapter-supabase';
import {
  ETIQUETA_ESTADO,
  esEditable,
  money,
  slugify,
  toMajorUnits,
  type FieldSources,
} from '@pick/commerce-core';
import type { ProductStatus } from '@pick/commerce-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import {
  formatearAtributos,
  parsearAtributos,
  productoSchema,
  type FormularioProducto as Valores,
  type ProductoValidado,
} from './esquema';

const ESTADOS: readonly ProductStatus[] = ['draft', 'active', 'inactive', 'archived'];

const VARIANTE_VACIA = {
  sku: '',
  title: '',
  precio: '',
  precioAnterior: '',
  costo: '',
  stock: '',
  atributos: '',
};

const VACIO: Valores = {
  title: '',
  handle: '',
  description: '',
  brand: '',
  categoryId: '',
  status: 'draft',
  variantes: [VARIANTE_VACIA],
  media: [],
};

function Campo({
  label,
  error,
  ayuda,
  children,
}: {
  label: string;
  error?: string;
  ayuda?: string;
  children: React.ReactNode;
}) {
  return (
    /*
     * El control va **dentro** del `<label>`: eso los asocia sin inventar un id
     * por campo. Con la etiqueta al lado y sin `htmlFor` no hay asociación
     * ninguna, y un lector de pantalla anuncia un campo sin nombre.
     */
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {ayuda && !error && <span className="text-muted-foreground text-xs">{ayuda}</span>}
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
 * Los errores de una fila.
 *
 * RHF tipa los errores de un array con un `Merge` que no se puede indexar por
 * nombre de campo; acá sólo se lee el mensaje, así que se acota a eso.
 */
type ErroresVariante = Partial<
  Record<'sku' | 'title' | 'precio' | 'precioAnterior' | 'costo' | 'stock' | 'atributos',
    { message?: string }>
>;

const claseTextarea =
  'border-border bg-background focus-visible:border-ring focus-visible:ring-ring/50 min-h-20 rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-3 disabled:opacity-50';

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

  const categorias = useQuery({
    queryKey: ['categorias', tienda.id],
    queryFn: () => repositorioCatalogo(db).categorias(tienda.id),
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    getFieldState,
    formState: { errors, isSubmitting },
  } = useForm<Valores, unknown, ProductoValidado>({
    resolver: zodResolver(productoSchema),
    defaultValues: VACIO,
  });

  const variantes = useFieldArray({ control, name: 'variantes' });
  const medios = useFieldArray({ control, name: 'media' });

  /** Qué campos administra el ERP. Ausente = los administra el comercio. */
  const fuentes: FieldSources = cargado.data?.fieldSources ?? {};

  useEffect(() => {
    const cargadoOk = cargado.data;
    if (!cargadoOk) return;
    const p = cargadoOk.producto;
    reset({
      id: p.id,
      title: p.title,
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
      media: p.media.map((m) => ({ ...m, width: String(m.width), height: String(m.height) })),
    } as unknown as Valores);
  }, [cargado.data, reset]);

  // El handle se propone desde el título mientras nadie lo haya tocado: es la
  // URL pública del producto y cambiarla después rompe los enlaces que ya
  // circulan, así que se propone una vez y no se vuelve a pisar.
  // `useWatch` y no `watch()`: el compilador de React no puede memoizar la
  // función que devuelve `useForm`, y saltea el componente entero por eso.
  const title = useWatch({ control, name: 'title' });
  useEffect(() => {
    if (id !== undefined) return;
    if (getFieldState('handle').isDirty) return;
    setValue('handle', slugify(title ?? ''));
  }, [title, id, getFieldState, setValue]);

  const guardar = useMutation({
    mutationFn: async (valores: ProductoValidado) => {
      const moneda = tienda.currency as 'PYG';
      return repo.guardar(tienda.id, {
        ...(valores.id ? { id: valores.id } : {}),
        handle: valores.handle,
        title: valores.title,
        ...(valores.description ? { description: valores.description } : {}),
        ...(valores.brand ? { brand: valores.brand } : {}),
        ...(valores.categoryId ? { categoryId: valores.categoryId } : {}),
        status: valores.status,
        variants: valores.variantes.map((v) => ({
          ...(v.id ? { id: v.id } : {}),
          sku: v.sku,
          title: v.title,
          ...(v.barcode ? { barcode: v.barcode } : {}),
          // El operador escribe en unidades mayores; el catálogo guarda mínimas.
          price: money(v.precio, moneda).amount,
          currency: moneda,
          ...(v.precioAnterior === undefined
            ? {}
            : { compareAtPrice: money(v.precioAnterior, moneda).amount }),
          ...(v.costo === undefined ? {} : { cost: money(v.costo, moneda).amount }),
          attributes: parsearAtributos(v.atributos),
          ...(v.stock === undefined ? {} : { stock: v.stock }),
        })),
        media: valores.media,
      });
    },
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['productos', tienda.id] });
      await navegar({ to: '/productos' });
    },
  });

  if (id !== undefined && cargado.isPending) {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        Cargando producto…
      </p>
    );
  }

  if (id !== undefined && cargado.data === null) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm">Este producto no existe en la tienda seleccionada.</p>
        <Button variant="outline" onClick={() => void navegar({ to: '/productos' })}>
          Volver
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex max-w-3xl flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit((valores) => guardar.mutateAsync(valores))(e);
      }}
      noValidate
    >
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium">Datos del producto</h2>

        <Campo
          label="Título"
          error={errors.title?.message}
          ayuda={esEditable(fuentes, 'title') ? undefined : 'Lo administra el ERP'}
        >
          <Input {...register('title')} disabled={!esEditable(fuentes, 'title')} />
        </Campo>

        <Campo label="Handle" error={errors.handle?.message} ayuda="Es la URL pública del producto">
          <Input {...register('handle')} />
        </Campo>

        <Campo
          label="Marca"
          error={errors.brand?.message}
          ayuda={esEditable(fuentes, 'brand') ? undefined : 'La administra el ERP'}
        >
          <Input {...register('brand')} disabled={!esEditable(fuentes, 'brand')} />
        </Campo>

        <Campo label="Descripción" error={errors.description?.message}>
          <textarea
            {...register('description')}
            disabled={!esEditable(fuentes, 'description')}
            className={claseTextarea}
          />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Estado" error={errors.status?.message}>
            <select {...register('status')} className={cn(claseTextarea, 'min-h-0 h-8 py-0')}>
              {ESTADOS.map((e) => (
                <option key={e} value={e}>
                  {ETIQUETA_ESTADO[e]}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Categoría" error={errors.categoryId?.message}>
            <select {...register('categoryId')} className={cn(claseTextarea, 'min-h-0 h-8 py-0')}>
              <option value="">Sin categoría</option>
              {(categorias.data ?? []).map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Variantes</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => variantes.append(VARIANTE_VACIA as never)}
          >
            Agregar variante
          </Button>
        </div>

        {errors.variantes?.root?.message && (
          <p className="text-destructive text-xs" role="alert">
            {errors.variantes.root.message}
          </p>
        )}

        {variantes.fields.map((campo, i) => (
          <FilaVariante
            key={campo.id}
            i={i}
            register={register}
            errores={errors.variantes?.[i] as ErroresVariante | undefined}
            precioBloqueado={!esEditable(fuentes, 'price')}
            moneda={tienda.currency}
            // La primera variante es la que muestra la PLP: no se puede quedar
            // sin ninguna, y por eso con una sola no se ofrece quitarla.
            onQuitar={variantes.fields.length > 1 ? () => variantes.remove(i) : undefined}
          />
        ))}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Imágenes</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => medios.append({ url: '', alt: '', width: '', height: '' } as never)}
          >
            Agregar imagen
          </Button>
        </div>

        <p className="text-muted-foreground text-xs">
          Por URL. El alto y el ancho son obligatorios: sin ellos el layout salta al cargar.
        </p>

        {medios.fields.map((campo, i) => (
          <div key={campo.id} className="border-border grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_1fr_5rem_5rem_auto]">
            <Campo label="URL" error={errors.media?.[i]?.url?.message}>
              <Input {...register(`media.${i}.url`)} placeholder="/products/foto.jpg" />
            </Campo>
            <Campo label="Texto alternativo" error={errors.media?.[i]?.alt?.message}>
              <Input {...register(`media.${i}.alt`)} />
            </Campo>
            <Campo label="Ancho" error={errors.media?.[i]?.width?.message}>
              <Input {...register(`media.${i}.width`)} inputMode="numeric" />
            </Campo>
            <Campo label="Alto" error={errors.media?.[i]?.height?.message}>
              <Input {...register(`media.${i}.height`)} inputMode="numeric" />
            </Campo>
            <div className="flex items-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => medios.remove(i)}>
                Quitar
              </Button>
            </div>
          </div>
        ))}
      </section>

      {guardar.isError && (
        <p className="text-destructive text-sm" role="alert">
          No se pudo guardar: {(guardar.error as Error).message}
        </p>
      )}

      <div className="flex items-center gap-3">
        {/* `disabled` mientras envía: sin eso, dos clicks son dos productos. */}
        <Button type="submit" disabled={isSubmitting || guardar.isPending}>
          {isSubmitting || guardar.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={guardar.isPending}
          onClick={() => void navegar({ to: '/productos' })}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function FilaVariante({
  i,
  register,
  errores,
  precioBloqueado,
  moneda,
  onQuitar,
}: {
  i: number;
  register: UseFormRegister<Valores>;
  errores?: ErroresVariante;
  precioBloqueado: boolean;
  moneda: string;
  onQuitar?: () => void;
}) {
  return (
    <div className="border-border flex flex-col gap-3 rounded-lg border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Nombre" error={errores?.title?.message}>
          <Input {...register(`variantes.${i}.title`)} placeholder="Azul / M" />
        </Campo>
        <Campo label="SKU" error={errores?.sku?.message}>
          <Input {...register(`variantes.${i}.sku`)} />
        </Campo>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Campo label={`Precio (${moneda})`} error={errores?.precio?.message} ayuda={precioBloqueado ? 'Lo administra el ERP' : undefined}>
          <Input {...register(`variantes.${i}.precio`)} inputMode="numeric" disabled={precioBloqueado} />
        </Campo>
        <Campo label="Precio anterior" error={errores?.precioAnterior?.message}>
          <Input {...register(`variantes.${i}.precioAnterior`)} inputMode="numeric" />
        </Campo>
        <Campo label="Costo" error={errores?.costo?.message}>
          <Input {...register(`variantes.${i}.costo`)} inputMode="numeric" />
        </Campo>
        <Campo
          label="Stock"
          error={errores?.stock?.message}
          ayuda="Vacío deja el actual"
        >
          <Input {...register(`variantes.${i}.stock`)} inputMode="numeric" />
        </Campo>
      </div>

      <Campo
        label="Atributos"
        error={errores?.atributos?.message}
        ayuda="Uno por línea, como color: Azul. Son los que arman las facetas."
      >
        <textarea {...register(`variantes.${i}.atributos`)} className={claseTextarea} rows={2} />
      </Campo>

      {onQuitar && (
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={onQuitar}>
            Quitar variante
          </Button>
        </div>
      )}
    </div>
  );
}
