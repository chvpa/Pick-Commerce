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
import { PercentIcon } from '@/components/iconos';
import { Button } from '@/components/ui/button';
import {
  BarraDeAcciones,
  Esqueleto,
  PaginaAdmin,
  Selector,
  Tarjeta,
  TituloDeTarjeta,
} from '@/components/pagina';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Campo, atributosDeError } from '@/components/campo';
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
import { SelectItem } from '@/components/ui/select';

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
  /*
   * Los desplegables ya no son `<select>` nativos, así que `register` no
   * alcanza: un control de Base UI no recibe un evento de cambio sino el valor
   * elegido. Se leen con `useWatch` y se escriben con `setValue`, que es lo que
   * este formulario ya hacía con `targetKind` y con el interruptor.
   */
  const tipoDeDescuento = useWatch({ control, name: 'discountType' });
  const estado = useWatch({ control, name: 'status' });

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
    mutationFn: (v: PromocionValidada) =>
      repositorioPromociones(db).guardar(tienda.id, aDatos(v), id),
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
      <PaginaAdmin titulo="Editar promoción" icono={PercentIcon}>
        <Tarjeta sinRelleno>
          <Esqueleto />
        </Tarjeta>
      </PaginaAdmin>
    );
  }

  return (
    // El `<form>` envuelve a la página para que guardar viva arriba a la derecha,
    // que es donde está la acción principal en todas las demás pantallas.
    <form
      onSubmit={handleSubmit((v) => {
        setErrorGeneral(null);
        guardar.mutate(v);
      })}
    >
      <PaginaAdmin titulo={id ? 'Editar promoción' : 'Nueva promoción'} icono={PercentIcon}>
        {errorGeneral && (
          <p className="text-destructive text-sm" role="alert">
            {errorGeneral}
          </p>
        )}

        <div className="flex max-w-2xl flex-col gap-5">
          <Tarjeta sinRelleno>
            <TituloDeTarjeta>El descuento</TituloDeTarjeta>
            <div className="flex flex-col gap-4 p-4">
              <Campo
                id="title"
                label="Nombre"
                error={formState.errors.title?.message}
                ayuda="Lo ve el comprador en el resumen de su pedido."
              >
                <Input
                  id="title"
                  {...register('title')}
                  {...atributosDeError('title', formState.errors.title?.message)}
                />
              </Campo>

              <div className="grid gap-4 sm:grid-cols-2">
                <Campo id="discountType" label="Tipo">
                  <Selector
                    id="discountType"
                    value={tipoDeDescuento}
                    onValueChange={(v) => setValue('discountType', v as Valores['discountType'])}
                  >
                    <SelectItem value="percentage">Porcentaje</SelectItem>
                    <SelectItem value="fixed">Monto fijo</SelectItem>
                  </Selector>
                </Campo>

                <Campo
                  id="discountValue"
                  label={tipo === 'percentage' ? 'Porcentaje' : 'Monto'}
                  error={formState.errors.discountValue?.message}
                >
                  <Input
                    id="discountValue"
                    inputMode="decimal"
                    placeholder={tipo === 'percentage' ? '15' : '50000'}
                    {...register('discountValue')}
                    {...atributosDeError('discountValue', formState.errors.discountValue?.message)}
                  />
                </Campo>
              </div>

              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1.5 text-sm font-medium">A qué productos alcanza</legend>
                <Selector
                  value={alcance}
                  onValueChange={(valor) => {
                    setValue('targetKind', valor as Valores['targetKind']);
                    // Cambiar de tipo con ids de otro tipo dejaría una selección
                    // que no corresponde a nada.
                    setValue('targetIds', []);
                  }}
                >
                  <SelectItem value="all">Todo el catálogo</SelectItem>
                  <SelectItem value="category">Categorías</SelectItem>
                  <SelectItem value="product">Productos</SelectItem>
                </Selector>

                {alcance === 'category' && (
                  <SelectorDeCategorias
                    categorias={categorias.data ?? []}
                    cargando={categorias.isPending}
                    ids={ids ?? []}
                    alternar={alternar}
                  />
                )}

                {alcance === 'product' && (
                  <SelectorDeProductos ids={ids ?? []} alternar={alternar} />
                )}

                {formState.errors.targetIds && (
                  <span className="text-destructive text-xs">
                    {formState.errors.targetIds.message}
                  </span>
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
                    Por ejemplo, «{ejemplo.title}» pasa de{' '}
                    {formatMoney(ejemplo.price, tienda.locale)} a{' '}
                    <strong className="text-foreground">
                      {formatMoney(despues, tienda.locale)}
                    </strong>
                    .
                  </p>
                )}
                {soloEnElCarrito && (
                  <p className="text-muted-foreground text-xs">
                    Con cupón o con un mínimo, el descuento{' '}
                    <strong>no se muestra en el catálogo</strong>: recién se aplica en el carrito,
                    que es donde se puede evaluar la condición.
                  </p>
                )}
              </div>
            </div>
          </Tarjeta>

          <Tarjeta sinRelleno>
            <TituloDeTarjeta>Condiciones</TituloDeTarjeta>
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <Campo id="code" label="Código de cupón" error={formState.errors.code?.message}>
                <Input
                  id="code"
                  placeholder="Sin código: se aplica sola"
                  {...register('code')}
                  {...atributosDeError('code', formState.errors.code?.message)}
                />
              </Campo>

              <Campo
                id="usageLimit"
                label="Tope de usos"
                error={formState.errors.usageLimit?.message}
                ayuda="Cuántos pedidos pueden aprovecharla. Vacío: sin tope."
              >
                <Input
                  id="usageLimit"
                  inputMode="numeric"
                  placeholder="Sin tope"
                  {...register('usageLimit')}
                  {...atributosDeError('usageLimit', formState.errors.usageLimit?.message)}
                />
              </Campo>

              <Campo id="startsAt" label="Empieza" error={formState.errors.startsAt?.message}>
                <Input
                  id="startsAt"
                  type="datetime-local"
                  {...register('startsAt')}
                  {...atributosDeError('startsAt', formState.errors.startsAt?.message)}
                />
              </Campo>

              <Campo id="endsAt" label="Termina" error={formState.errors.endsAt?.message}>
                <Input
                  id="endsAt"
                  type="datetime-local"
                  {...register('endsAt')}
                  {...atributosDeError('endsAt', formState.errors.endsAt?.message)}
                />
              </Campo>

              <Campo
                id="minSubtotal"
                label="Compra mínima"
                error={formState.errors.minSubtotal?.message}
                ayuda={`Desde cuánto aplica, en ${tienda.currency}. Vacío: sin mínimo.`}
              >
                <Input
                  id="minSubtotal"
                  inputMode="numeric"
                  placeholder="Sin mínimo"
                  {...register('minSubtotal')}
                  {...atributosDeError('minSubtotal', formState.errors.minSubtotal?.message)}
                />
              </Campo>

              <Campo
                id="minQuantity"
                label="Cantidad mínima"
                error={formState.errors.minQuantity?.message}
                ayuda="Cuántas unidades tiene que llevar. Vacío: sin mínimo."
              >
                <Input
                  id="minQuantity"
                  inputMode="numeric"
                  placeholder="Sin mínimo"
                  {...register('minQuantity')}
                  {...atributosDeError('minQuantity', formState.errors.minQuantity?.message)}
                />
              </Campo>
            </div>
          </Tarjeta>

          <Tarjeta sinRelleno>
            <TituloDeTarjeta>Publicación</TituloDeTarjeta>
            <div className="flex flex-col gap-4 p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="status">Estado</Label>
                  <Selector
                    id="status"
                    value={estado}
                    onValueChange={(v) => setValue('status', v as Valores['status'])}
                  >
                    <SelectItem value="draft">Borrador</SelectItem>
                    <SelectItem value="active">Activa</SelectItem>
                    <SelectItem value="archived">Archivada</SelectItem>
                  </Selector>
                  <span className="text-muted-foreground text-xs">
                    Sólo las activas descuentan. Se archiva en vez de borrar, para que los pedidos
                    viejos sigan explicando su descuento.
                  </span>
                </div>
                <Campo
                  id="priority"
                  label="Prioridad"
                  error={formState.errors.priority?.message}
                  ayuda="Mayor primero, cuando hay dos que alcanzan al mismo producto."
                >
                  <Input
                    id="priority"
                    inputMode="numeric"
                    {...register('priority')}
                    {...atributosDeError('priority', formState.errors.priority?.message)}
                  />
                </Campo>
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
            </div>
          </Tarjeta>
        </div>
        <BarraDeAcciones>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => void navegar({ to: '/promociones' })}
          >
            Cancelar
          </Button>
          <Button type="submit" size="lg" disabled={guardar.isPending}>
            {guardar.isPending ? 'Guardando…' : id ? 'Guardar cambios' : 'Crear promoción'}
          </Button>
        </BarraDeAcciones>
      </PaginaAdmin>
    </form>
  );
}

/** Buscador de productos para acotar el alcance a unos pocos. */
/**
 * Elegir categorías sin desplegar las doscientas.
 *
 * Antes se listaban todas, siempre abiertas: con un catálogo de verdad eso
 * empuja el resto del formulario fuera de la pantalla y obliga a hacer scroll
 * por una lista para llegar al botón de guardar. Ahora el bloque se abre, tiene
 * su propio scroll y se cierra con «Listo», así que ocupa lugar sólo mientras se
 * está usando.
 *
 * El buscador aparece recién con unas cuantas: con cinco categorías es un campo
 * de más.
 */
function SelectorDeCategorias({
  categorias,
  cargando,
  ids,
  alternar,
}: {
  categorias: readonly { id: string; name: string }[];
  cargando: boolean;
  ids: readonly string[];
  alternar: (id: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');

  const elegidas = categorias.filter((c) => ids.includes(c.id));
  const filtradas = texto.trim()
    ? categorias.filter((c) => c.name.toLowerCase().includes(texto.trim().toLowerCase()))
    : categorias;

  if (cargando) {
    return <p className="text-muted-foreground text-sm">Cargando categorías…</p>;
  }

  if (categorias.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">Esta tienda todavía no tiene categorías.</p>
    );
  }

  if (!abierto) {
    return (
      <div className="border-border flex items-center justify-between gap-3 rounded-lg border p-3">
        <p className="min-w-0 text-sm">
          {elegidas.length === 0 ? (
            <span className="text-muted-foreground">Ninguna categoría elegida</span>
          ) : (
            <span className="line-clamp-2">{elegidas.map((c) => c.name).join(', ')}</span>
          )}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => setAbierto(true)}>
          {elegidas.length === 0 ? 'Elegir' : 'Cambiar'}
        </Button>
      </div>
    );
  }

  return (
    <div className="border-border flex flex-col gap-3 rounded-lg border p-3">
      {categorias.length > 8 && (
        <Input
          value={texto}
          onChange={(e) => setTexto(e.currentTarget.value)}
          placeholder="Buscar categoría"
          aria-label="Buscar categoría"
        />
      )}

      <p className="text-muted-foreground text-xs" aria-live="polite">
        {ids.length} de {categorias.length} elegidas
      </p>

      <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
        {filtradas.length === 0 ? (
          <p className="text-muted-foreground text-sm">Ninguna categoría coincide.</p>
        ) : (
          filtradas.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={ids.includes(c.id)} onCheckedChange={() => alternar(c.id)} />
              {c.name}
            </label>
          ))
        )}
      </div>

      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={() => setAbierto(false)}>
          Listo
        </Button>
      </div>
    </div>
  );
}

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
    queryFn: () => repositorioAdminCatalogo(db).listar(tienda.id, { query, page: 1, perPage: 20 }),
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
