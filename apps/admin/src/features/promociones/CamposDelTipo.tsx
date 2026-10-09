import { useEffect, useState } from 'react';
import { useFieldArray, useWatch, type UseFormReturn } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import {
  repositorioConfiguracion,
  repositorioContenido,
  repositorioPromociones,
} from '@pick/adapter-supabase';
import { TOPE_DE_COLECCIONES, configuracionDeEnvio } from '@pick/commerce-core';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SelectItem } from '@/components/ui/select';
import { Selector, Segmentado } from '@/components/pagina';
import { Campo, atributosDeError } from '@/components/campo';
import { PlusIcon, Trash2Icon } from '@/components/iconos';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import type { FormularioPromocion as Valores, PromocionValidada } from './esquema';

/**
 * Los campos de cada tipo de promoción (ADR-164). Cada bloque escribe en los
 * campos planos del formulario; `aDatos` los junta en `rules`.
 */

type Formulario = UseFormReturn<Valores, unknown, PromocionValidada>;

/** Un campo de texto corto con su error, para no repetir las cuatro líneas. */
function Numero({
  formulario,
  nombre,
  label,
  ayuda,
  placeholder,
  sufijo,
}: {
  formulario: Formulario;
  nombre:
    | 'discountValue'
    | 'lleva'
    | 'paga'
    | 'segunda'
    | 'compra'
    | 'cantidadDeRegalo'
    | 'productosDelBundle'
    | 'valorDelBundle';
  label: string;
  ayuda?: string;
  placeholder?: string;
  sufijo?: string;
}) {
  const error = formulario.formState.errors[nombre]?.message;
  return (
    <Campo id={nombre} label={label} error={error} ayuda={ayuda}>
      <div className="flex items-center gap-2">
        <Input
          id={nombre}
          inputMode="decimal"
          placeholder={placeholder}
          {...formulario.register(nombre)}
          {...atributosDeError(nombre, error)}
        />
        {sufijo && <span className="text-muted-foreground shrink-0 text-sm">{sufijo}</span>}
      </div>
    </Campo>
  );
}

export function CamposDelTipo({ formulario }: { formulario: Formulario }) {
  const tienda = useTiendaActiva();
  const kind = useWatch({ control: formulario.control, name: 'kind' });

  switch (kind) {
    case 'discount':
      return <CamposDeDescuento formulario={formulario} />;

    case 'buy_x_pay_y':
      return (
        <div className="flex flex-col gap-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <Numero formulario={formulario} nombre="lleva" label="Lleva" sufijo="unidades" />
            <Numero formulario={formulario} nombre="paga" label="Paga" sufijo="unidades" />
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              [2, 1],
              [3, 2],
              [4, 3],
            ].map(([lleva, paga]) => (
              <Button
                key={`${lleva}x${paga}`}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  formulario.setValue('lleva', String(lleva), { shouldValidate: true });
                  formulario.setValue('paga', String(paga), { shouldValidate: true });
                }}
              >
                {lleva}x{paga}
              </Button>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            Cuentan las unidades del mismo producto, de cualquier talle o color. Lo gratis son las
            más baratas.
          </p>
        </div>
      );

    case 'second_unit':
      return (
        <Numero
          formulario={formulario}
          nombre="segunda"
          label="Descuento de la segunda unidad"
          sufijo="%"
          ayuda="De cada par del mismo producto, la más barata lleva el descuento."
        />
      );

    case 'quantity':
      return <EscalonesDeCantidad formulario={formulario} />;

    case 'tiered':
      return <EscalonesDeMonto formulario={formulario} moneda={tienda.currency} />;

    case 'gift':
      return (
        <div className="flex flex-col gap-4">
          <Numero
            formulario={formulario}
            nombre="compra"
            label="Comprando"
            sufijo="unidades de lo alcanzado"
          />
          <Regalo formulario={formulario} />
        </div>
      );

    case 'bundle':
      return <CamposDeBundle formulario={formulario} />;

    case 'free_shipping':
      return <ZonasDeEnvio formulario={formulario} />;
  }
}

function CamposDeDescuento({ formulario }: { formulario: Formulario }) {
  const tipo = useWatch({ control: formulario.control, name: 'discountType' });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo id="discountType" label="Tipo">
        <Selector
          id="discountType"
          value={tipo}
          onValueChange={(v) => formulario.setValue('discountType', v as Valores['discountType'])}
        >
          <SelectItem value="percentage">Porcentaje</SelectItem>
          <SelectItem value="fixed">Monto fijo</SelectItem>
        </Selector>
      </Campo>
      <Numero
        formulario={formulario}
        nombre="discountValue"
        label={tipo === 'percentage' ? 'Porcentaje' : 'Monto'}
        placeholder={tipo === 'percentage' ? '15' : '50000'}
      />
    </div>
  );
}

function EscalonesDeCantidad({ formulario }: { formulario: Formulario }) {
  const { fields, append, remove } = useFieldArray({
    control: formulario.control,
    name: 'escalonesDeCantidad',
  });
  const mezclar = useWatch({ control: formulario.control, name: 'mezclar' });
  const errores = formulario.formState.errors.escalonesDeCantidad;

  return (
    <div className="flex flex-col gap-3">
      <ul aria-label="Escalones por cantidad" className="flex flex-col gap-2">
        {fields.map((f, i) => (
          <li key={f.id} className="flex flex-wrap items-start gap-2">
            <span className="text-muted-foreground pt-2 text-sm">Desde</span>
            <CampoCorto
              id={`escalonesDeCantidad.${i}.desde`}
              etiqueta={`Unidades del escalón ${i + 1}`}
              error={errores?.[i]?.desde?.message}
              {...formulario.register(`escalonesDeCantidad.${i}.desde`)}
            />
            <span className="text-muted-foreground pt-2 text-sm">unidades,</span>
            <CampoCorto
              id={`escalonesDeCantidad.${i}.porcentaje`}
              etiqueta={`Porcentaje del escalón ${i + 1}`}
              error={errores?.[i]?.porcentaje?.message}
              {...formulario.register(`escalonesDeCantidad.${i}.porcentaje`)}
            />
            <span className="text-muted-foreground pt-2 text-sm">%</span>
            {fields.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Quitar el escalón ${i + 1}`}
                onClick={() => remove(i)}
              >
                <Trash2Icon className="size-4" />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {errores?.root?.message || errores?.message ? (
        <span role="alert" className="text-destructive text-xs">
          {errores.root?.message ?? errores.message}
        </span>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => append({ desde: '', porcentaje: '' })}
      >
        <PlusIcon className="size-4" /> Agregar escalón
      </Button>
      <label className="flex items-start gap-3">
        <Switch
          checked={mezclar}
          onCheckedChange={(v) => formulario.setValue('mezclar', v)}
          aria-label="Mezclar productos"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Mezclar productos</span>
          <span className="text-muted-foreground text-xs">
            {mezclar
              ? 'Si son de distinto precio, el más caro se cobra completo y el descuento va sobre los demás.'
              : 'Apagado: las unidades tienen que ser del mismo producto.'}
          </span>
        </span>
      </label>
    </div>
  );
}

function EscalonesDeMonto({ formulario, moneda }: { formulario: Formulario; moneda: string }) {
  const { fields, insert, remove } = useFieldArray({
    control: formulario.control,
    name: 'escalonesDeMonto',
  });
  const errores = formulario.formState.errors.escalonesDeMonto;

  return (
    <div className="flex flex-col gap-3">
      <ul aria-label="Escalones por monto" className="flex flex-col gap-2">
        {fields.map((f, i) => {
          const ultimo = i === fields.length - 1;
          return (
            <li key={f.id} className="flex flex-wrap items-start gap-2">
              {ultimo ? (
                <span className="text-muted-foreground pt-2 text-sm">Más que eso,</span>
              ) : (
                <>
                  <span className="text-muted-foreground pt-2 text-sm">{`Hasta ${moneda}`}</span>
                  <CampoCorto
                    id={`escalonesDeMonto.${i}.hasta`}
                    etiqueta={`Tope del escalón ${i + 1}`}
                    error={errores?.[i]?.hasta?.message}
                    ancho="w-32"
                    {...formulario.register(`escalonesDeMonto.${i}.hasta`)}
                  />
                </>
              )}
              <CampoCorto
                id={`escalonesDeMonto.${i}.porcentaje`}
                etiqueta={`Porcentaje del escalón ${i + 1}`}
                error={errores?.[i]?.porcentaje?.message}
                {...formulario.register(`escalonesDeMonto.${i}.porcentaje`)}
              />
              <span className="text-muted-foreground pt-2 text-sm">%</span>
              {fields.length > 2 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar el escalón ${i + 1}`}
                  onClick={() => remove(i)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {errores?.root?.message || errores?.message ? (
        <span role="alert" className="text-destructive text-xs">
          {errores.root?.message ?? errores.message}
        </span>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        // El nuevo va antes del último, que es siempre «más que eso».
        onClick={() => insert(fields.length - 1, { hasta: '', porcentaje: '' })}
      >
        <PlusIcon className="size-4" /> Agregar escalón
      </Button>
      <p className="text-muted-foreground text-xs">
        Se mide sobre lo alcanzado, ya con los descuentos del catálogo.
      </p>
    </div>
  );
}

/** Un input angosto con su error debajo. El nombre accesible va por `aria-label`. */
function CampoCorto({
  id,
  etiqueta,
  error,
  ancho = 'w-20',
  ...resto
}: {
  id: string;
  etiqueta: string;
  error?: string;
  ancho?: string;
} & React.ComponentProps<typeof Input>) {
  return (
    <span className="flex flex-col gap-1">
      <Input
        id={id}
        aria-label={etiqueta}
        inputMode="decimal"
        className={ancho}
        {...resto}
        {...atributosDeError(id, error)}
      />
      {error && (
        <span id={`${id}-error`} role="alert" className="text-destructive max-w-48 text-xs">
          {error}
        </span>
      )}
    </span>
  );
}

/** Qué se regala y cuántas: una variante de la tienda, buscada por nombre. */
function Regalo({ formulario }: { formulario: Formulario }) {
  const tienda = useTiendaActiva();
  const elegido = useWatch({ control: formulario.control, name: 'regalo' });
  const nombre = useWatch({ control: formulario.control, name: 'nombreDelRegalo' });
  const [texto, setTexto] = useState('');
  const [query, setQuery] = useState('');
  const [buscando, setBuscando] = useState(!elegido);
  const error = formulario.formState.errors.regalo?.message;

  useEffect(() => {
    const t = setTimeout(() => setQuery(texto), 300);
    return () => clearTimeout(t);
  }, [texto]);

  // Al editar llega el id: el nombre se pide una vez para mostrarlo.
  const cargado = useQuery({
    queryKey: ['regalo', tienda.id, elegido],
    queryFn: () => repositorioPromociones(db).varianteParaRegalar(tienda.id, elegido),
    enabled: Boolean(elegido) && !nombre,
  });
  useEffect(() => {
    const v = cargado.data;
    if (v) {
      formulario.setValue(
        'nombreDelRegalo',
        v.variantTitle ? `${v.title} · ${v.variantTitle}` : v.title,
      );
    }
  }, [cargado.data, formulario]);

  const candidatos = useQuery({
    queryKey: ['variantes-para-regalar', tienda.id, query],
    queryFn: () => repositorioPromociones(db).variantesParaRegalar(tienda.id, query),
    enabled: buscando,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">De regalo</span>
        {!buscando && elegido ? (
          <div className="border-border flex items-center justify-between gap-3 rounded-lg border p-3">
            <span className="min-w-0 truncate text-sm">{nombre || 'Cargando…'}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => setBuscando(true)}>
              Cambiar
            </Button>
          </div>
        ) : (
          <div className="border-border flex flex-col gap-2 rounded-lg border p-3">
            <Input
              value={texto}
              onChange={(e) => setTexto(e.currentTarget.value)}
              placeholder="Buscar el producto que se regala"
              aria-label="Buscar el producto que se regala"
              {...atributosDeError('regalo', error)}
            />
            <div className="flex max-h-56 flex-col gap-1 overflow-y-auto" role="list">
              {candidatos.isPending ? (
                <p className="text-muted-foreground text-sm">Buscando…</p>
              ) : candidatos.isError ? (
                <p className="text-destructive text-sm">No se pudo buscar. Probá de nuevo.</p>
              ) : candidatos.data.length === 0 ? (
                <p className="text-muted-foreground text-sm">Ningún producto coincide.</p>
              ) : (
                candidatos.data.map((v) => {
                  const etiqueta = v.variantTitle ? `${v.title} · ${v.variantTitle}` : v.title;
                  return (
                    <button
                      key={v.variantId}
                      type="button"
                      role="listitem"
                      className="hover:bg-muted flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm"
                      onClick={() => {
                        formulario.setValue('regalo', v.variantId, { shouldValidate: true });
                        formulario.setValue('nombreDelRegalo', etiqueta);
                        setBuscando(false);
                      }}
                    >
                      <span className="min-w-0 truncate">{etiqueta}</span>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {v.stock} en stock
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
        {error && (
          <span id="regalo-error" role="alert" className="text-destructive text-xs">
            {error}
          </span>
        )}
        <span className="text-muted-foreground text-xs">
          Sale del stock como cualquier venta. Si se agota, la promoción deja de aplicar sola.
        </span>
      </div>
      <Numero
        formulario={formulario}
        nombre="cantidadDeRegalo"
        label="Cuántas se regalan"
        sufijo="por pedido"
      />
    </div>
  );
}

const BENEFICIOS = [
  { valor: 'percent', etiqueta: '% de descuento' },
  { valor: 'fixed', etiqueta: 'Monto por producto' },
  { valor: 'free_shipping', etiqueta: 'Envío gratis' },
  { valor: 'gift', etiqueta: 'Regalo' },
] as const;

function CamposDeBundle({ formulario }: { formulario: Formulario }) {
  const tienda = useTiendaActiva();
  const coleccion = useWatch({ control: formulario.control, name: 'coleccion' });
  const beneficio = useWatch({ control: formulario.control, name: 'beneficio' });
  const colecciones = useColecciones();
  const error = formulario.formState.errors.coleccion?.message;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="coleccion" label="Colección" error={error}>
          {colecciones.isPending ? (
            <p className="text-muted-foreground text-sm">Cargando colecciones…</p>
          ) : (colecciones.data?.items ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Esta tienda todavía no tiene colecciones.
            </p>
          ) : (
            <Selector
              id="coleccion"
              value={coleccion}
              placeholder="Elegí una colección"
              onValueChange={(v) =>
                formulario.setValue('coleccion', String(v), { shouldValidate: true })
              }
            >
              {colecciones.data!.items.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.title}
                </SelectItem>
              ))}
            </Selector>
          )}
        </Campo>
        <Numero
          formulario={formulario}
          nombre="productosDelBundle"
          label="Productos distintos"
          sufijo="de la colección"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Qué se lleva</span>
        <Segmentado
          etiqueta="Qué se lleva"
          opciones={BENEFICIOS}
          valor={beneficio}
          onCambiar={(v) => formulario.setValue('beneficio', v, { shouldValidate: true })}
        />
      </div>

      {beneficio === 'percent' && (
        <Numero
          formulario={formulario}
          nombre="valorDelBundle"
          label="Descuento en todos los productos del bundle"
          sufijo="%"
        />
      )}
      {beneficio === 'fixed' && (
        <Numero
          formulario={formulario}
          nombre="valorDelBundle"
          label={`Descuento en cada producto del bundle (${tienda.currency})`}
        />
      )}
      {beneficio === 'gift' && <Regalo formulario={formulario} />}
    </div>
  );
}

/** Las colecciones de la tienda, hasta el techo: alcanza para elegir una. */
export function useColecciones() {
  const tienda = useTiendaActiva();
  return useQuery({
    queryKey: ['colecciones-para-promo', tienda.id],
    queryFn: () =>
      repositorioContenido(db).colecciones(tienda.id, { page: 1, perPage: TOPE_DE_COLECCIONES }),
  });
}

/** Las zonas salen del envío configurado: no hay zonas que inventar acá. */
function ZonasDeEnvio({ formulario }: { formulario: Formulario }) {
  const tienda = useTiendaActiva();
  const todas = useWatch({ control: formulario.control, name: 'todasLasZonas' });
  const zonas = useWatch({ control: formulario.control, name: 'zonas' });
  const error = formulario.formState.errors.zonas?.message;

  const ajustes = useQuery({
    queryKey: ['configuracion', tienda.id],
    queryFn: () => repositorioConfiguracion(db).leer(tienda.id),
  });
  const envio = ajustes.data ? configuracionDeEnvio(ajustes.data) : undefined;
  const disponibles = envio?.mode === 'zones' ? (envio.zones ?? []).map((z) => z.name) : [];

  function alternar(nombre: string) {
    formulario.setValue(
      'zonas',
      zonas.includes(nombre) ? zonas.filter((z) => z !== nombre) : [...zonas, nombre],
      { shouldValidate: true },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {ajustes.isPending ? (
        <p className="text-muted-foreground text-sm">Cargando las zonas de envío…</p>
      ) : disponibles.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          El envío de esta tienda no se cobra por zona, así que el envío gratis vale para todo el
          país. Las zonas se configuran en Configuración › Envío.
        </p>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Zonas</legend>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={todas}
              onCheckedChange={(v) => {
                formulario.setValue('todasLasZonas', v === true, { shouldValidate: true });
              }}
            />
            Todo el país
          </label>
          {!todas && (
            <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
              {disponibles.map((z) => (
                <label key={z} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={zonas.includes(z)} onCheckedChange={() => alternar(z)} />
                  {z}
                </label>
              ))}
            </div>
          )}
          {error && (
            <span role="alert" className="text-destructive text-xs">
              {error}
            </span>
          )}
        </fieldset>
      )}
      <p className="text-muted-foreground text-xs">
        El monto desde el que aplica va en «Compra mínima», más abajo.
      </p>
    </div>
  );
}
