import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  repositorioAdminCatalogo,
  repositorioCatalogo,
  repositorioPromociones,
} from '@pick/adapter-supabase';
import { formatMoney, percentageOf, subtractMoney } from '@pick/commerce-core';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import {
  aCampoDeFecha,
  aDatos,
  promocionSchema,
  type FormularioPromocion as Valores,
  type PromocionValidada,
} from './esquema';

const SELECT =
  'border-border bg-background focus-visible:border-ring focus-visible:ring-ring/50 ' +
  'h-9 cursor-pointer rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3';

/**
 * Alta y edición de una promoción.
 *
 * Lo que el operador escribe está en sus unidades —«15» por ciento— y se
 * convierte en `aDatos`. El descuento **no se calcula acá**: esto sólo compone
 * el dato. Quien decide cuánto se descuenta es el servidor, y el preview usa las
 * mismas funciones del core que usa él, no una cuenta propia.
 */
export function FormularioPromocion({ id }: { id?: string }) {
  const tienda = useTiendaActiva();
  const navegar = useNavigate();
  const queryClient = useQueryClient();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const existente = useQuery({
    queryKey: ['promocion', tienda.id, id],
    queryFn: () => repositorioPromociones(db).porId(tienda.id, id!),
    enabled: Boolean(id),
  });

  const categorias = useQuery({
    queryKey: ['categorias', tienda.id],
    queryFn: () => repositorioCatalogo(db).categorias(tienda.id),
  });

  // Tres parámetros como en el formulario de producto: la entrada son strings
  // —lo que el operador escribe— y la salida ya son números, que es lo que el
  // esquema transforma. Sin declarar los dos, el resolver no encaja.
  const formulario = useForm<Valores, unknown, PromocionValidada>({
    resolver: zodResolver(promocionSchema),
    defaultValues: {
      title: '',
      status: 'draft',
      priority: '0',
      stackable: false,
      discountType: 'percentage',
      discountValue: '',
      targetKind: 'all',
      targetIds: [],
      code: '',
      startsAt: '',
      endsAt: '',
      usageLimit: '',
      minSubtotal: '',
      minQuantity: '',
    },
  });

  const { register, handleSubmit, control, reset, setValue, formState } = formulario;

  // Al editar, el formulario se rellena cuando llega el dato.
  useEffect(() => {
    const p = existente.data;
    if (!p) return;
    reset({
      title: p.title,
      status: p.status,
      priority: String(p.priority),
      stackable: p.stackable,
      discountType: p.discountType,
      discountValue:
        p.discountType === 'percentage' ? String(p.discountValue / 100) : String(p.discountValue),
      targetKind: p.target.kind,
      targetIds: p.target.kind === 'all' ? [] : [...p.target.ids],
      code: p.code ?? '',
      startsAt: aCampoDeFecha(p.startsAt),
      endsAt: aCampoDeFecha(p.endsAt),
      usageLimit: p.usageLimit !== undefined ? String(p.usageLimit) : '',
      minSubtotal: p.minSubtotal !== undefined ? String(p.minSubtotal) : '',
      minQuantity: p.minQuantity !== undefined ? String(p.minQuantity) : '',
    });
  }, [existente.data, reset]);

  const tipo = useWatch({ control, name: 'discountType' });
  const alcance = useWatch({ control, name: 'targetKind' });
  const ids = useWatch({ control, name: 'targetIds' });
  const valor = useWatch({ control, name: 'discountValue' });
  const codigo = useWatch({ control, name: 'code' });
  const minSubtotal = useWatch({ control, name: 'minSubtotal' });
  const minQuantity = useWatch({ control, name: 'minQuantity' });
  // `useWatch` y no `formulario.watch()`: el segundo devuelve una función que el
  // compilador de React no puede memoizar, y lo marca el lint.
  const combina = useWatch({ control, name: 'stackable' });

  /* Una promoción con cupón o con mínimos no se puede pintar en la grilla: sin
     carrito no hay subtotal contra el que evaluarla. Decirlo mientras se escribe
     evita la pregunta de por qué no se ve en la vidriera. */
  const soloEnElCarrito = Boolean(codigo?.trim() || minSubtotal?.trim() || minQuantity?.trim());

  // El preview sale del servidor —cuántos productos alcanza y uno de ejemplo— y
  // el precio resultante lo calcula el core, con las mismas funciones que usa
  // `cart_promotions`. Una cuenta propia acá podría no coincidir con el cobro.
  const preview = useQuery({
    queryKey: ['alcance', tienda.id, alcance, [...(ids ?? [])].sort().join(',')],
    queryFn: () =>
      repositorioPromociones(db).alcance(
        tienda.id,
        alcance === 'all' ? { kind: 'all' } : { kind: alcance, ids: ids ?? [] },
      ),
    enabled: alcance === 'all' || (ids ?? []).length > 0,
  });

  const guardar = useMutation({
    mutationFn: (v: PromocionValidada) => repositorioPromociones(db).guardar(tienda.id, aDatos(v), id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['promociones', tienda.id] });
      await navegar({ to: '/promociones' });
    },
    onError: (e: Error) => setErrorGeneral(e.message),
  });

  function alternar(valorId: string): void {
    const actuales = ids ?? [];
    setValue(
      'targetIds',
      actuales.includes(valorId) ? actuales.filter((x) => x !== valorId) : [...actuales, valorId],
      { shouldValidate: true },
    );
  }

  const ejemplo = preview.data?.ejemplo;
  const numero = Number(String(valor).replace(',', '.'));
  const despues =
    ejemplo && Number.isFinite(numero) && numero > 0
      ? subtractMoney(
          ejemplo.price,
          tipo === 'percentage'
            ? percentageOf(ejemplo.price, Math.round(numero * 100))
            : { amount: numero, currency: ejemplo.price.currency },
        )
      : null;

  if (id && existente.isPending) {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        Cargando la promoción…
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit((v) => {
        setErrorGeneral(null);
        guardar.mutate(v);
      })}
      className="flex max-w-2xl flex-col gap-6"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">Nombre</Label>
        <Input id="title" {...register('title')} aria-invalid={!!formState.errors.title} />
        {formState.errors.title && (
          <span className="text-destructive text-xs">{formState.errors.title.message}</span>
        )}
        <span className="text-muted-foreground text-xs">
          Lo ve el comprador en el resumen de su pedido.
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="discountType">Tipo</Label>
          <select id="discountType" {...register('discountType')} className={SELECT}>
            <option value="percentage">Porcentaje</option>
            <option value="fixed">Monto fijo</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="discountValue">{tipo === 'percentage' ? 'Porcentaje' : 'Monto'}</Label>
          <Input
            id="discountValue"
            inputMode="decimal"
            placeholder={tipo === 'percentage' ? '15' : '50000'}
            {...register('discountValue')}
            aria-invalid={!!formState.errors.discountValue}
          />
          {formState.errors.discountValue && (
            <span className="text-destructive text-xs">
              {formState.errors.discountValue.message}
            </span>
          )}
        </div>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">A qué productos alcanza</legend>
        <select
          {...register('targetKind')}
          className={SELECT}
          onChange={(e) => {
            setValue('targetKind', e.currentTarget.value as Valores['targetKind']);
            // Cambiar de tipo con ids de otro tipo dejaría una selección que no
            // corresponde a nada.
            setValue('targetIds', []);
          }}
        >
          <option value="all">Todo el catálogo</option>
          <option value="category">Categorías</option>
          <option value="product">Productos</option>
        </select>

        {alcance === 'category' && (
          <div className="border-border flex flex-col gap-2 rounded-lg border p-3">
            {categorias.isPending ? (
              <p className="text-muted-foreground text-sm">Cargando categorías…</p>
            ) : (categorias.data ?? []).length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Esta tienda todavía no tiene categorías.
              </p>
            ) : (
              categorias.data!.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={(ids ?? []).includes(c.id)}
                    onCheckedChange={() => alternar(c.id)}
                  />
                  {c.name}
                </label>
              ))
            )}
          </div>
        )}

        {alcance === 'product' && <SelectorDeProductos ids={ids ?? []} alternar={alternar} />}

        {formState.errors.targetIds && (
          <span className="text-destructive text-xs">{formState.errors.targetIds.message}</span>
        )}
      </fieldset>

      {/* Preview: PROJECT.md §15 pide poder simular antes de publicar. */}
      <div className="bg-muted/40 border-border flex flex-col gap-1 rounded-lg border p-4">
        <p className="text-sm font-medium">
          {preview.isPending && preview.fetchStatus !== 'idle'
            ? 'Calculando el alcance…'
            : preview.data
              ? `Alcanza ${preview.data.count} producto${preview.data.count === 1 ? '' : 's'}.`
              : 'Elegí a qué alcanza para ver el impacto.'}
        </p>
        {ejemplo && despues && (
          <p className="text-muted-foreground text-sm">
            Por ejemplo, «{ejemplo.title}» pasa de {formatMoney(ejemplo.price, tienda.locale)} a{' '}
            <strong className="text-foreground">{formatMoney(despues, tienda.locale)}</strong>.
          </p>
        )}
        {soloEnElCarrito && (
          <p className="text-muted-foreground text-xs">
            Con cupón o con un mínimo, el descuento <strong>no se muestra en el catálogo</strong>:
            recién se aplica en el carrito, que es donde se puede evaluar la condición.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">Código de cupón</Label>
          <Input id="code" placeholder="Sin código: se aplica sola" {...register('code')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="usageLimit">Tope de usos</Label>
          <Input id="usageLimit" inputMode="numeric" placeholder="Sin tope" {...register('usageLimit')} />
          {formState.errors.usageLimit && (
            <span className="text-destructive text-xs">{formState.errors.usageLimit.message}</span>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="startsAt">Empieza</Label>
          <Input id="startsAt" type="datetime-local" {...register('startsAt')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="endsAt">Termina</Label>
          <Input
            id="endsAt"
            type="datetime-local"
            {...register('endsAt')}
            aria-invalid={!!formState.errors.endsAt}
          />
          {formState.errors.endsAt && (
            <span className="text-destructive text-xs">{formState.errors.endsAt.message}</span>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="minSubtotal">Compra mínima</Label>
          <Input id="minSubtotal" inputMode="numeric" placeholder="Sin mínimo" {...register('minSubtotal')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="minQuantity">Cantidad mínima</Label>
          <Input id="minQuantity" inputMode="numeric" placeholder="Sin mínimo" {...register('minQuantity')} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="status">Estado</Label>
          <select id="status" {...register('status')} className={SELECT}>
            <option value="draft">Borrador</option>
            <option value="active">Activa</option>
            <option value="archived">Archivada</option>
          </select>
          <span className="text-muted-foreground text-xs">
            Sólo las activas descuentan. Se archiva en vez de borrar, para que los pedidos viejos
            sigan explicando su descuento.
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="priority">Prioridad</Label>
          <Input id="priority" inputMode="numeric" {...register('priority')} />
          <span className="text-muted-foreground text-xs">
            Mayor primero, cuando hay dos que alcanzan al mismo producto.
          </span>
        </div>
      </div>

      <label className="flex items-start gap-3">
        <Switch checked={combina} onCheckedChange={(v) => setValue('stackable', v)} />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Se combina con otras</span>
          <span className="text-muted-foreground text-xs">
            Si no, se aplica sola: la de mayor prioridad gana y las demás no entran.
          </span>
        </span>
      </label>

      {errorGeneral && (
        <p className="text-destructive text-sm" role="alert">
          {errorGeneral}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={guardar.isPending}>
          {guardar.isPending ? 'Guardando…' : id ? 'Guardar cambios' : 'Crear promoción'}
        </Button>
        <Button type="button" variant="outline" onClick={() => void navegar({ to: '/promociones' })}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/** Buscador de productos para acotar el alcance a unos pocos. */
function SelectorDeProductos({
  ids,
  alternar,
}: {
  ids: readonly string[];
  alternar: (id: string) => void;
}) {
  const tienda = useTiendaActiva();
  const [texto, setTexto] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setQuery(texto), 300);
    return () => clearTimeout(t);
  }, [texto]);

  const consulta = useQuery({
    queryKey: ['productos-para-promo', tienda.id, query],
    queryFn: () =>
      repositorioAdminCatalogo(db).listar(tienda.id, { query, page: 1, perPage: 20 }),
  });

  return (
    <div className="border-border flex flex-col gap-3 rounded-lg border p-3">
      <Input
        value={texto}
        onChange={(e) => setTexto(e.currentTarget.value)}
        placeholder="Buscar productos"
        aria-label="Buscar productos"
      />
      <p className="text-muted-foreground text-xs" aria-live="polite">
        {ids.length} seleccionado{ids.length === 1 ? '' : 's'}
        {consulta.data && consulta.data.total > 20
          ? ` · se muestran los primeros 20 de ${consulta.data.total}, afiná la búsqueda`
          : ''}
      </p>
      <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
        {consulta.isPending ? (
          <p className="text-muted-foreground text-sm">Buscando…</p>
        ) : (consulta.data?.items ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">Ningún producto coincide.</p>
        ) : (
          consulta.data!.items.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={ids.includes(p.id)} onCheckedChange={() => alternar(p.id)} />
              <span className="truncate">{p.title}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
