import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { repositorioAdminCatalogo, repositorioPromociones } from '@pick/adapter-supabase';
import { TIPOS_CON_CUPON } from '@pick/commerce-core';
import { Button } from '@/components/ui/button';
import {
  BarraDeAcciones,
  Esqueleto,
  PaginaAdmin,
  Segmentado,
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
import { cn } from '@/lib/utils';
import {
  TIPOS,
  VALORES_INICIALES,
  aDatos,
  aFormulario,
  promocionSchema,
  usaAlcance,
  usaCompraMinima,
  type FormularioPromocion as Valores,
  type PromocionValidada,
} from './esquema';
import { CamposDelTipo, useColecciones } from './CamposDelTipo';
import { carritoDeEjemplo, resumen } from './vistaPrevia';
import { SelectItem } from '@/components/ui/select';
import { useCategorias } from '@/features/tienda/useCategorias';

/**
 * Alta y edición de una promoción, de cualquiera de los ocho tipos (ADR-164).
 *
 * Lo que el operador escribe está en sus unidades —«15» por ciento— y se
 * convierte en `aDatos`. El descuento **no se calcula acá**: esto sólo compone
 * el dato. Quien decide cuánto se descuenta es el servidor, y la vista previa
 * usa la misma función del core que es la especificación del cobro, no una
 * cuenta propia.
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

  const categorias = useCategorias();
  const colecciones = useColecciones();

  // Tres parámetros como en el formulario de producto: la entrada son strings
  // —lo que el operador escribe— y la salida ya son números, que es lo que el
  // esquema transforma. Sin declarar los dos, el resolver no encaja.
  const formulario = useForm<Valores, unknown, PromocionValidada>({
    resolver: zodResolver(promocionSchema),
    defaultValues: VALORES_INICIALES,
  });

  const { register, handleSubmit, control, reset, setValue, formState } = formulario;

  // Al editar, el formulario se rellena cuando llega el dato.
  useEffect(() => {
    if (existente.data) reset(aFormulario(existente.data));
  }, [existente.data, reset]);

  // `useWatch` y no `formulario.watch()`: el segundo vuelve a dibujar el
  // formulario entero con cada tecla; `useWatch` escucha sólo lo pedido.
  const valores = useWatch({ control }) as Valores;
  const { kind, modo, targetKind: alcance, targetIds: ids = [], stackable: combina } = valores;
  const estado = valores.status;

  // El ejemplo del carrito sale del alcance real de la tienda: cuántos productos
  // alcanza y uno de ellos con su precio.
  const objetivo =
    kind === 'bundle'
      ? valores.coleccion
        ? ({ kind: 'collection', ids: [valores.coleccion] } as const)
        : null
      : !usaAlcance(kind) || alcance === 'all'
        ? ({ kind: 'all' } as const)
        : ids.length > 0
          ? ({ kind: alcance, ids } as const)
          : null;

  const preview = useQuery({
    queryKey: [
      'alcance',
      tienda.id,
      objetivo?.kind,
      objetivo && objetivo.kind !== 'all' ? [...objetivo.ids].sort().join(',') : '',
    ],
    queryFn: () => repositorioPromociones(db).alcance(tienda.id, objetivo!),
    enabled: objetivo !== null,
  });

  /*
   * La vista previa usa los datos **validados**, sin mostrar errores: si todavía
   * no valida no hay carrito que armar, y el resumen igual acompaña lo escrito.
   */
  const validos = useMemo(() => promocionSchema.safeParse(valores), [valores]);
  const carrito =
    validos.success && objetivo
      ? carritoDeEjemplo(
          aDatos(validos.data),
          preview.data?.ejemplo,
          valores.nombreDelRegalo,
          tienda.locale,
        )
      : null;

  const nombreDeColeccion = colecciones.data?.items.find((c) => c.id === valores.coleccion)?.title;
  const textoDelAlcance = !usaAlcance(kind)
    ? ''
    : alcance === 'all'
      ? 'en todo el catálogo'
      : alcance === 'category'
        ? `en ${
            (categorias.data ?? [])
              .filter((c) => ids.includes(c.id))
              .map((c) => c.name)
              .join(', ') || '…'
          }`
        : alcance === 'collection'
          ? `en ${
              (colecciones.data?.items ?? [])
                .filter((c) => ids.includes(c.id))
                .map((c) => c.title)
                .join(', ') || '…'
            }`
          : `en ${ids.length} producto${ids.length === 1 ? '' : 's'}`;
  const frase = resumen(valores, {
    alcance: textoDelAlcance,
    ...(nombreDeColeccion ? { coleccion: nombreDeColeccion } : {}),
    moneda: tienda.currency,
    locale: tienda.locale,
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
    setValue(
      'targetIds',
      ids.includes(valorId) ? ids.filter((x) => x !== valorId) : [...ids, valorId],
      {
        shouldValidate: true,
      },
    );
  }

  if (id && existente.isPending) {
    return (
      <PaginaAdmin titulo="Editar promoción">
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
      <PaginaAdmin titulo={id ? 'Editar promoción' : 'Nueva promoción'}>
        {errorGeneral && (
          <p className="text-destructive text-sm" role="alert">
            {errorGeneral}
          </p>
        )}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-5">
            <Tarjeta sinRelleno>
              <TituloDeTarjeta>La promoción</TituloDeTarjeta>
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

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Cómo se aplica</span>
                  <Segmentado
                    etiqueta="Cómo se aplica"
                    opciones={[
                      { valor: 'auto', etiqueta: 'Automática' },
                      { valor: 'codigo', etiqueta: 'Con código' },
                    ]}
                    valor={modo}
                    onCambiar={(v) => {
                      setValue('modo', v);
                      // Con código sólo hay descuento o envío gratis: si el tipo
                      // elegido no puede, vuelve al descuento en vez de quedar en
                      // una combinación que no se puede guardar.
                      if (v === 'codigo' && !TIPOS_CON_CUPON.includes(kind))
                        setValue('kind', 'discount');
                    }}
                  />
                </div>

                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1.5 text-sm font-medium">Tipo</legend>
                  <div
                    role="radiogroup"
                    aria-label="Tipo de promoción"
                    className="grid gap-2 grid-cols-2 xl:grid-cols-4"
                  >
                    {TIPOS.map((t) => {
                      const elegido = kind === t.kind;
                      const soloAutomatica = modo === 'codigo' && !TIPOS_CON_CUPON.includes(t.kind);
                      return (
                        <button
                          key={t.kind}
                          type="button"
                          role="radio"
                          aria-checked={elegido}
                          aria-disabled={soloAutomatica}
                          disabled={soloAutomatica}
                          onClick={() =>
                            setValue('kind', t.kind, { shouldValidate: formState.isSubmitted })
                          }
                          className={cn(
                            'focus-visible:ring-focus-tint flex flex-col items-start gap-0.5 rounded-[10px] border-[1.5px] px-3 py-2.5 text-left outline-none focus-visible:ring-3',
                            soloAutomatica
                              ? 'border-border bg-muted/50 cursor-not-allowed opacity-60'
                              : elegido
                                ? 'cursor-pointer border-[#3b5bdb] bg-[#f5f7fe]'
                                : 'border-border hover:border-ink-3 cursor-pointer bg-white',
                          )}
                        >
                          <span className="text-sm font-medium">{t.label}</span>
                          <span className="text-muted-foreground text-xs">
                            {soloAutomatica ? 'Sólo automática' : t.ejemplo}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {formState.errors.kind && (
                    <span role="alert" className="text-destructive text-xs">
                      {formState.errors.kind.message}
                    </span>
                  )}
                </fieldset>
              </div>
            </Tarjeta>

            <Tarjeta sinRelleno>
              <TituloDeTarjeta>El beneficio</TituloDeTarjeta>
              <div className="p-4">
                <CamposDelTipo formulario={formulario} />
              </div>
            </Tarjeta>

            {usaAlcance(kind) && (
              <Tarjeta sinRelleno>
                <TituloDeTarjeta>A qué productos alcanza</TituloDeTarjeta>
                <fieldset className="flex flex-col gap-3 p-4">
                  <legend className="sr-only">A qué productos alcanza</legend>
                  <Selector
                    aria-label="A qué productos alcanza"
                    value={alcance}
                    onValueChange={(v) => {
                      setValue('targetKind', v as Valores['targetKind']);
                      // Cambiar de tipo con ids de otro tipo dejaría una selección
                      // que no corresponde a nada.
                      setValue('targetIds', []);
                    }}
                  >
                    <SelectItem value="all">Todo el catálogo</SelectItem>
                    <SelectItem value="category">Categorías</SelectItem>
                    <SelectItem value="collection">Colecciones</SelectItem>
                    <SelectItem value="product">Productos</SelectItem>
                  </Selector>

                  {alcance === 'category' && (
                    <SelectorDeCategorias
                      categorias={categorias.data ?? []}
                      cargando={categorias.isPending}
                      ids={ids}
                      alternar={alternar}
                    />
                  )}
                  {alcance === 'collection' && (
                    <SelectorDeColecciones
                      colecciones={colecciones.data?.items ?? []}
                      cargando={colecciones.isPending}
                      ids={ids}
                      alternar={alternar}
                    />
                  )}
                  {alcance === 'product' && <SelectorDeProductos ids={ids} alternar={alternar} />}

                  {formState.errors.targetIds && (
                    <span role="alert" className="text-destructive text-xs">
                      {formState.errors.targetIds.message}
                    </span>
                  )}
                  <p className="text-muted-foreground text-sm" aria-live="polite">
                    {preview.isPending && preview.fetchStatus !== 'idle'
                      ? 'Calculando el alcance…'
                      : preview.data
                        ? `Alcanza ${preview.data.count} producto${preview.data.count === 1 ? '' : 's'}.`
                        : 'Elegí a qué alcanza para ver el impacto.'}
                  </p>
                </fieldset>
              </Tarjeta>
            )}

            <Tarjeta sinRelleno>
              <TituloDeTarjeta>Condiciones</TituloDeTarjeta>
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                {modo === 'codigo' && (
                  <Campo
                    id="code"
                    label="Código de cupón"
                    error={formState.errors.code?.message}
                    ayuda="El comprador lo escribe al pagar. Sin distinguir mayúsculas."
                  >
                    <Input
                      id="code"
                      placeholder="VOLVE10"
                      {...register('code')}
                      {...atributosDeError('code', formState.errors.code?.message)}
                    />
                  </Campo>
                )}

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

                {usaCompraMinima(kind) && (
                  <Campo
                    id="minSubtotal"
                    label={kind === 'free_shipping' ? 'Envío gratis desde' : 'Compra mínima'}
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
                )}

                {kind === 'discount' && (
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
                )}
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

          {/* Al costado en escritorio y al final en el teléfono: la promoción en una frase y su efecto. */}
          <aside className="flex flex-col gap-4 lg:sticky lg:top-4" aria-label="Vista previa">
            <Tarjeta>
              <div className="flex flex-col gap-2">
                <h2 className="text-[15px] font-semibold">Resumen</h2>
                <p className="text-sm leading-6" aria-live="polite">
                  {frase}
                </p>
                {kind === 'discount' &&
                modo === 'auto' &&
                !valores.minSubtotal &&
                !valores.minQuantity ? (
                  <p className="text-muted-foreground text-xs">
                    Se ve en el catálogo con el precio tachado.
                  </p>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    No se muestra en el catálogo: se aplica en el carrito, que es donde se puede
                    evaluar.
                  </p>
                )}
              </div>
            </Tarjeta>
            <Tarjeta>
              <div
                className="flex flex-col gap-2.5"
                aria-label="Así se ve en el carrito"
                role="group"
              >
                <span className="text-muted-foreground text-[12.5px] font-medium">
                  Así se ve en el carrito
                </span>
                {carrito ? (
                  <>
                    {carrito.filas.map((f, i) => (
                      <div
                        key={i}
                        className={cn(
                          'flex justify-between gap-3 text-[13.5px]',
                          f.promo ? 'text-[#13774a]' : 'text-ink-3',
                        )}
                      >
                        <span className="min-w-0">{f.etiqueta}</span>
                        <span className="whitespace-nowrap tabular-nums">{f.valor}</span>
                      </div>
                    ))}
                    <div className="bg-border h-px" />
                    <div className="flex justify-between font-semibold">
                      <span>Total</span>
                      <span className="tabular-nums">{carrito.total}</span>
                    </div>
                    {carrito.noAplica && (
                      <p className="text-muted-foreground text-xs">
                        Con este carrito de ejemplo no aplica. Revisá las condiciones.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Completá el beneficio para ver el ejemplo.
                  </p>
                )}
              </div>
            </Tarjeta>
          </aside>
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

/** Colecciones para el alcance, con la misma forma que las categorías. */
function SelectorDeColecciones({
  colecciones,
  cargando,
  ids,
  alternar,
}: {
  colecciones: readonly { id: string; title: string }[];
  cargando: boolean;
  ids: readonly string[];
  alternar: (id: string) => void;
}) {
  if (cargando) return <p className="text-muted-foreground text-sm">Cargando colecciones…</p>;
  if (colecciones.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">Esta tienda todavía no tiene colecciones.</p>
    );
  }
  return (
    <div className="border-border flex max-h-64 flex-col gap-2 overflow-y-auto rounded-lg border p-3">
      {colecciones.map((c) => (
        <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={ids.includes(c.id)} onCheckedChange={() => alternar(c.id)} />
          {c.title}
        </label>
      ))}
    </div>
  );
}

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
