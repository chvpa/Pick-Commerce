import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import { repositorioCaracteristicas } from '@pick/adapter-supabase';
import type { Caracteristica } from '@pick/commerce-core';
import { Selector } from '@/components/pagina';
import { Input } from '@/components/ui/input';
import { SelectItem } from '@/components/ui/select';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import {
  formatearAtributos,
  parsearAtributos,
  type FormularioProducto,
  type ProductoValidado,
} from './esquema';

/**
 * Las características al cargar un producto (ADR-161).
 *
 * Los valores viven en las variantes —`product_variants.attributes`, como
 * siempre—. Lo que cambia es cómo se escriben: las de variante, en cada
 * variante con sus opciones; las del producto, una sola vez y para todas. Lo que
 * no está declarado sigue en el campo libre, porque un catálogo importado trae
 * atributos que nadie definió todavía.
 */

const SIN = '__sin__';

export function useCaracteristicas() {
  const tienda = useTiendaActiva();
  return useQuery({
    queryKey: ['caracteristicas', tienda.id],
    queryFn: () => repositorioCaracteristicas(db).listar(tienda.id),
  });
}

interface Comun {
  readonly control: Control<FormularioProducto, unknown, ProductoValidado>;
  readonly setValue: UseFormSetValue<FormularioProducto>;
}

/** Un valor, con las opciones si las tiene. */
function Valor({
  c,
  valor,
  onCambiar,
  disabled,
}: {
  c: Caracteristica;
  valor: string;
  onCambiar: (v: string) => void;
  disabled?: boolean;
}) {
  const etiqueta = (
    <span className="text-[13.5px] font-medium">
      {c.label}
      {c.required && <span className="text-ink-faint font-normal"> · obligatoria</span>}
    </span>
  );
  if (c.kind === 'text') {
    return (
      <label className="flex flex-col gap-1.5">
        {etiqueta}
        <Input value={valor} disabled={disabled} onChange={(e) => onCambiar(e.target.value)} />
      </label>
    );
  }
  // Un valor que ya tenía y no está entre las opciones se muestra igual: borrarlo
  // por no estar declarado sería perder un dato.
  const opciones = valor && !c.options.includes(valor) ? [valor, ...c.options] : c.options;
  return (
    <label className="flex flex-col gap-1.5">
      {etiqueta}
      <Selector
        aria-label={c.label}
        value={valor || SIN}
        disabled={disabled}
        onValueChange={(v) => onCambiar(v === SIN ? '' : v)}
      >
        <SelectItem value={SIN}>Sin {c.label.toLocaleLowerCase('es')}</SelectItem>
        {opciones.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </Selector>
    </label>
  );
}

function conValor(mapa: Record<string, string>, clave: string, valor: string) {
  const nuevo = { ...mapa };
  if (valor.trim() === '') delete nuevo[clave];
  else nuevo[clave] = valor.trim();
  return nuevo;
}

/** Las de variante, y lo no declarado, dentro de una variante. */
export function CaracteristicasDeVariante({ i, comun }: { i: number; comun: Comun }) {
  const definidas = useCaracteristicas().data ?? [];
  const nombre = `variantes.${i}.atributos` as const;
  const texto = (useWatch({ control: comun.control, name: nombre }) as string | undefined) ?? '';
  const mapa = parsearAtributos(texto);
  const declaradas = new Set(definidas.map((c) => c.name));
  const deVariante = definidas.filter((c) => c.forVariants);

  // Lo no declarado se edita como texto, con su propio estado: el que se está
  // escribiendo puede no tener todavía los dos puntos, y no se puede perder.
  const [otros, setOtros] = useState(() =>
    formatearAtributos(
      Object.fromEntries(Object.entries(mapa).filter(([k]) => !declaradas.has(k))),
    ),
  );

  const escribir = (nuevo: Record<string, string>) =>
    comun.setValue(nombre, formatearAtributos(nuevo), { shouldDirty: true });

  return (
    <div className="flex flex-col gap-4 sm:col-span-3">
      {deVariante.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {deVariante.map((c) => (
            <Valor
              key={c.id}
              c={c}
              valor={mapa[c.name] ?? ''}
              onCambiar={(v) => escribir(conValor(mapa, c.name, v))}
            />
          ))}
        </div>
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-[13.5px] font-medium">
          {deVariante.length > 0 ? 'Otros atributos' : 'Atributos'}
        </span>
        <textarea
          value={otros}
          rows={2}
          onChange={(e) => {
            const nuevoTexto = e.currentTarget.value;
            setOtros(nuevoTexto);
            const declarados = Object.fromEntries(
              Object.entries(mapa).filter(([k]) => declaradas.has(k)),
            );
            escribir({ ...parsearAtributos(nuevoTexto), ...declarados });
          }}
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-focus-tint min-h-16 rounded-[9px] border px-3 py-2 text-sm outline-none focus-visible:ring-3"
        />
        <span className="text-ink-3 text-xs">
          Uno por línea, como «origen: Paraguay». Para que se elija de una lista, declaralo en
          Características.
        </span>
      </label>
    </div>
  );
}

/**
 * Las del producto: material, origen. Se escriben una vez y van a todas sus
 * variantes, que es donde las leen los filtros y el guardado.
 */
export function CaracteristicasDelProducto({ comun }: { comun: Comun }) {
  const definidas = (useCaracteristicas().data ?? []).filter((c) => !c.forVariants);
  const todas = (useWatch({ control: comun.control, name: 'variantes' }) ?? []) as {
    atributos?: string;
  }[];
  if (definidas.length === 0) return null;
  const mapa = parsearAtributos(todas[0]?.atributos ?? '');

  const aTodas = (clave: string, valor: string) =>
    todas.forEach((v, i) =>
      comun.setValue(
        `variantes.${i}.atributos`,
        formatearAtributos(conValor(parsearAtributos(v.atributos ?? ''), clave, valor)),
        { shouldDirty: true },
      ),
    );

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-[15px] font-semibold">Características</h2>
      {definidas.map((c) => (
        <Valor key={c.id} c={c} valor={mapa[c.name] ?? ''} onCambiar={(v) => aTodas(c.name, v)} />
      ))}
    </div>
  );
}
