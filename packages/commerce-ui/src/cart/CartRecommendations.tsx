import { useEffect, useState } from 'preact/hooks';
import { formatMoney } from '@pick/commerce-core';
import type { Money } from '@pick/commerce-types';
import { cn } from '../lib/cn.ts';
import { getLines, subscribe, type CartLine } from './store.ts';

/** Lo poquito que la tira necesita de cada producto. */
interface Sugerido {
  readonly handle: string;
  readonly title: string;
  readonly brand?: string;
  readonly image?: { readonly url: string; readonly alt?: string | null };
  readonly price?: Money;
}

export interface CartRecommendationsProps {
  locale?: string;
  /**
   * Si la tira está a la vista. El drawer la monta con la página pero la muestra
   * recién al abrirse: sin esto, cada carga de cualquier página con el carrito
   * lleno pediría recomendaciones que nadie va a ver.
   */
  activo?: boolean;
  /** Cuántas mostrar. Tres entran en el drawer sin hacerlo scrollear dos veces. */
  limite?: number;
  className?: string;
}

/**
 * «Suele mirarse con lo que tenés en el carrito».
 *
 * Vive del lado del cliente porque **el carrito también**: está en
 * `localStorage`, así que el servidor no sabe qué hay adentro y no puede
 * renderizar esto en el HTML. El endpoint recibe las variantes y devuelve
 * productos ya serializados por el catálogo (ADR-127), así que el precio, la
 * promoción y el stock son los mismos que en cualquier otra tarjeta.
 *
 * Tres reglas que la hacen inofensiva:
 *
 * 1. **Sin carrito no pide nada** y no dibuja nada.
 * 2. **Sin respuesta no hay tira**: un fallo deja la página como estaba. Una
 *    recomendación es ayuda, no contenido.
 * 3. **Una petición por composición de carrito**, no por render: el efecto
 *    depende de los ids, así que cambiar la cantidad de una línea no vuelve a
 *    pedir.
 */
export function CartRecommendations({
  locale,
  activo = true,
  limite = 3,
  className,
}: CartRecommendationsProps) {
  const [lines, setLines] = useState<readonly CartLine[]>([]);
  const [sugeridos, setSugeridos] = useState<readonly Sugerido[]>([]);

  useEffect(() => {
    setLines(getLines());
    return subscribe(setLines);
  }, []);

  const variantes = lines.map((l) => l.variantId).join(',');

  useEffect(() => {
    if (!activo || variantes === '') {
      setSugeridos([]);
      return;
    }

    const corte = new AbortController();
    void fetch(`/api/recomendados?v=${encodeURIComponent(variantes)}&limite=${limite}`, {
      signal: corte.signal,
    })
      .then((r) => (r.ok ? r.json() : { productos: [] }))
      .then((cuerpo: { productos?: Sugerido[] }) => setSugeridos(cuerpo.productos ?? []))
      .catch(() => setSugeridos([]));

    return () => corte.abort();
  }, [activo, variantes, limite]);

  if (sugeridos.length === 0) return null;

  return (
    <section className={cn('border-t border-border px-5 py-4', className)}>
      <h2 className="mb-3 text-xs font-medium tracking-wide text-fg-muted uppercase">
        Suele mirarse con esto
      </h2>
      <ul className="flex flex-col gap-3">
        {sugeridos.map((p) => (
          <li key={p.handle}>
            <a
              href={`/productos/${p.handle}`}
              className="flex cursor-pointer items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {p.image ? (
                <img
                  src={p.image.url}
                  alt=""
                  width={48}
                  height={64}
                  loading="lazy"
                  decoding="async"
                  className="h-16 w-12 shrink-0 rounded-sm object-cover"
                />
              ) : null}
              <span className="flex min-w-0 flex-col">
                {p.brand ? <span className="text-xs text-fg-subtle">{p.brand}</span> : null}
                <span className="truncate text-sm">{p.title}</span>
                {p.price ? (
                  <span className="text-sm font-medium">{formatMoney(p.price, locale)}</span>
                ) : null}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
