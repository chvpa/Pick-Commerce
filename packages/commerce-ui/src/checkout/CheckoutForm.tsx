import { useEffect, useRef, useState } from 'preact/hooks';
import { formatMoney, validarDatosDeCheckout } from '@pick/commerce-core';
import type { Money } from '@pick/commerce-types';
import { cn } from '../lib/cn.ts';
import { buttonVariants } from '../recipes/button.ts';
import { clear, getLines, replaceLines, subscribe, type CartLine } from '../cart/store.ts';

interface LineaValidada {
  variantId: string;
  title: string;
  variantTitle?: string;
  price: Money;
  available: number;
  quantity: number;
  subtotal: Money;
}

interface Problema {
  type: string;
  variantId: string;
  available?: number;
}

export interface CheckoutFormProps {
  /** Formas de pago habilitadas para la tienda, resueltas en el servidor. */
  metodos: readonly { id: string; label: string }[];
  metodoPorDefecto: string;
  locale?: string;
  catalogHref?: string;
  confirmacionHref?: string;
  className?: string;
}

type Estado = 'cargando' | 'listo' | 'enviando' | 'vacio';

const CAMPOS = [
  { id: 'name', label: 'Nombre y apellido', tipo: 'text', autoComplete: 'name', grupo: 'customer' },
  { id: 'email', label: 'Correo', tipo: 'email', autoComplete: 'email', grupo: 'customer' },
  { id: 'phone', label: 'Teléfono', tipo: 'tel', autoComplete: 'tel', grupo: 'customer' },
  {
    id: 'street',
    label: 'Dirección',
    tipo: 'text',
    autoComplete: 'street-address',
    grupo: 'address',
  },
  { id: 'city', label: 'Ciudad', tipo: 'text', autoComplete: 'address-level2', grupo: 'address' },
] as const;

/**
 * Checkout.
 *
 * Requiere JavaScript, y es una consecuencia del carrito: vive en
 * `localStorage`, así que el servidor no sabe qué tiene esta persona (ADR-039).
 * La página trae un `<noscript>` que lo dice y manda a `/carrito`.
 *
 * Tres cosas que no son obvias:
 *
 * - La **clave de idempotencia se genera una vez al montar**, no por click. Un
 *   reintento tras un error usa la misma, y la base devuelve el pedido que ya
 *   creó en vez de otro. Se renueva sólo después de un éxito.
 * - El **resumen sale del servidor**, no del carrito. Si el precio cambió o el
 *   stock ya no da, se corrige el espejo local y se avisa: el total que se ve es
 *   el que se va a cobrar.
 * - El pedido confirmado se guarda en `sessionStorage` para la pantalla de
 *   confirmación. No hay lookup público de pedidos: la numeración es secuencial
 *   y sería enumerable.
 */
export function CheckoutForm({
  metodos,
  metodoPorDefecto,
  locale,
  catalogHref = '/catalogo',
  confirmacionHref = '/checkout/confirmacion',
  className,
}: CheckoutFormProps) {
  const [estado, setEstado] = useState<Estado>('cargando');
  const [lineas, setLineas] = useState<readonly LineaValidada[]>([]);
  const [total, setTotal] = useState<Money | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [metodo, setMetodo] = useState(metodoPorDefecto);

  const clave = useRef<string>('');
  const enVuelo = useRef(false);
  const formulario = useRef<HTMLFormElement>(null);

  if (clave.current === '') clave.current = crypto.randomUUID();

  /**
   * Revalida el carrito contra el servidor y **corrige el espejo local**.
   *
   * Que corrija y no sólo avise es deliberado: si el carrito dice 5 y hay 2, lo
   * que la persona puede comprar son 2, y dejar el 5 en el drawer la haría
   * chocar de nuevo en el siguiente intento.
   */
  async function revalidar(): Promise<readonly LineaValidada[]> {
    const guardadas = getLines();
    if (guardadas.length === 0) {
      setEstado('vacio');
      return [];
    }

    const respuesta = await fetch('/api/cart/validate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lines: guardadas.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      }),
    });

    if (!respuesta.ok) throw new Error('validate');

    const datos = (await respuesta.json()) as {
      lines: LineaValidada[];
      issues: Problema[];
      total: Money | null;
    };

    if (datos.issues.length > 0) {
      const sinStock = datos.issues.filter((p) => p.type === 'insufficient_stock');
      setAviso(
        sinStock.length > 0
          ? 'Ajustamos tu carrito: algún producto ya no tiene el stock que había.'
          : 'Quitamos de tu carrito un producto que ya no está disponible.',
      );
    }

    // El espejo se alinea con lo que el servidor dice que existe.
    const porId = new Map(guardadas.map((l) => [l.variantId, l]));
    replaceLines(
      datos.lines.map((l): CartLine => ({
        variantId: l.variantId,
        quantity: l.quantity,
        title: porId.get(l.variantId)?.title ?? l.title,
        price: l.price,
        available: l.available,
        ...(porId.get(l.variantId)?.imageUrl ? { imageUrl: porId.get(l.variantId)!.imageUrl } : {}),
      })),
    );

    setLineas(datos.lines);
    setTotal(datos.total);
    setEstado(datos.lines.length === 0 ? 'vacio' : 'listo');
    return datos.lines;
  }

  useEffect(() => {
    revalidar().catch(() => {
      // Sin poder validar no se puede mostrar un total confiable, pero tampoco
      // hay que dejar a la persona sin salida: se muestra lo que tiene guardado.
      const guardadas = getLines();
      setLineas(
        guardadas.map((l) => ({
          variantId: l.variantId,
          title: l.title,
          price: l.price,
          available: l.available ?? l.quantity,
          quantity: l.quantity,
          subtotal: { amount: l.price.amount * l.quantity, currency: l.price.currency },
        })),
      );
      setEstado(guardadas.length === 0 ? 'vacio' : 'listo');
      setAviso('No pudimos confirmar precios y stock. Los verificamos al confirmar el pedido.');
    });

    // Si la persona edita el carrito en otra pestaña, esta pantalla se entera.
    return subscribe(() => {
      if (!enVuelo.current) revalidar().catch(() => undefined);
    });
  }, []);

  async function enviar(evento: Event): Promise<void> {
    evento.preventDefault();
    // Doble defensa contra el doble submit: el botón deshabilitado y esta
    // guarda, que cubre el doble click antes de que el estado se pinte.
    if (enVuelo.current) return;

    const datos = Object.fromEntries(new FormData(formulario.current!).entries());
    const entrada = {
      customer: {
        name: datos.name,
        email: datos.email,
        phone: datos.phone,
        taxId: datos.taxId,
        taxName: datos.taxName,
      },
      address: { street: datos.street, city: datos.city, reference: datos.reference },
      paymentMethod: metodo,
      notes: datos.notes,
    };

    const validado = validarDatosDeCheckout(entrada);
    if (!validado.datos) {
      setErrores(validado.errores as Record<string, string>);
      setErrorGeneral(null);
      formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }

    enVuelo.current = true;
    setErrores({});
    setErrorGeneral(null);
    setEstado('enviando');

    /*
     * Con éxito **no** se libera la guarda.
     *
     * `location.assign` no navega en el acto, así que liberar deja una ventana
     * —corta, pero abierta— en la que un segundo click volvería a enviar. No es
     * lo que garantiza que no haya pedido doble: eso lo hace la clave de
     * idempotencia, que es la misma en el reintento. Es evitar el viaje de más y
     * el parpadeo del formulario volviendo a habilitarse justo antes de irse.
     */
    let navegando = false;

    try {
      const respuesta = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...entrada,
          idempotencyKey: clave.current,
          lines: getLines().map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        }),
      });

      if (respuesta.status === 409) {
        // El stock cambió mientras completaba el formulario. Se corrige el
        // carrito y se la deja reintentar: la clave sigue siendo la misma.
        await revalidar().catch(() => undefined);
        setErrorGeneral(
          'Cambió la disponibilidad de algún producto. Revisá el resumen y confirmá de nuevo.',
        );
        return;
      }

      const cuerpo = (await respuesta.json()) as {
        order?: unknown;
        /** Presente cuando la forma de pago tiene pasarela: a dónde mandarla. */
        pago?: { url?: string };
        errores?: Record<string, string>;
        message?: string;
      };

      if (respuesta.status === 400 && cuerpo.errores) {
        setErrores(cuerpo.errores);
        return;
      }

      if (!respuesta.ok || !cuerpo.order) {
        setErrorGeneral(cuerpo.message ?? 'No pudimos confirmar tu pedido. Probá de nuevo.');
        return;
      }

      try {
        globalThis.sessionStorage?.setItem('pick:last-order', JSON.stringify(cuerpo.order));
      } catch {
        // Sin sessionStorage la confirmación muestra su estado vacío. El pedido
        // ya está creado, que es lo que importa.
      }
      clear();
      navegando = true;
      /*
       * Con pasarela, el siguiente paso es pagar; sin ella, el pedido ya está
       * completo y va directo a la confirmación. En los dos casos el pedido
       * **ya existe** y el carrito ya se vació: no se vuelve acá.
       */
      globalThis.location.assign(cuerpo.pago?.url ?? confirmacionHref);
      return;
    } catch {
      setErrorGeneral('No pudimos conectarnos. Revisá tu conexión y probá de nuevo.');
    } finally {
      if (!navegando) {
        enVuelo.current = false;
        setEstado('listo');
      }
    }
  }

  if (estado === 'cargando') {
    return (
      <div class="flex flex-col gap-3 p-5" aria-busy="true">
        <div class="h-4 w-32 animate-pulse rounded-sm bg-surface-muted" />
        <div class="h-16 animate-pulse rounded-sm bg-surface-muted" />
        <div class="h-16 animate-pulse rounded-sm bg-surface-muted" />
        <span class="sr-only">Cargando tu pedido</span>
      </div>
    );
  }

  if (estado === 'vacio') {
    return (
      <div class="flex flex-col items-center gap-4 px-5 py-12 text-center">
        {/*
          El aviso va también acá. Cuando el servidor rechaza **todas** las
          líneas, el carrito queda vacío y la pantalla decía sólo "no hay nada
          para confirmar": la persona no se enteraba de que lo que tenía se
          agotó, sólo de que ya no está. Perder el motivo es peor que el motivo.
        */}
        <p class="text-sm text-fg-muted">{aviso ?? 'No hay nada para confirmar.'}</p>
        <a href={catalogHref} class={buttonVariants({ variant: 'secondary' })}>
          Ver el catálogo
        </a>
      </div>
    );
  }

  const enviando = estado === 'enviando';

  return (
    <form
      ref={formulario}
      onSubmit={enviar}
      noValidate
      class={cn('grid gap-8 md:grid-cols-[1fr_20rem]', className)}
    >
      <div class="flex flex-col gap-6">
        {aviso ? (
          <p role="status" class="rounded-md bg-surface-muted px-4 py-3 text-sm">
            {aviso}
          </p>
        ) : null}

        <fieldset class="flex flex-col gap-4" disabled={enviando}>
          <legend class="text-sm font-medium">Tus datos</legend>
          {CAMPOS.map((campo) => (
            <label key={campo.id} class="flex flex-col gap-1.5">
              <span class="text-sm">{campo.label}</span>
              <input
                name={campo.id}
                type={campo.tipo}
                autocomplete={campo.autoComplete}
                required
                aria-invalid={errores[campo.id] ? 'true' : undefined}
                aria-describedby={errores[campo.id] ? `error-${campo.id}` : undefined}
                class={cn(
                  'rounded-sm border border-border bg-surface px-3 py-2 text-sm',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                  errores[campo.id] && 'border-danger',
                )}
              />
              {errores[campo.id] ? (
                <span id={`error-${campo.id}`} class="text-xs text-danger">
                  {errores[campo.id]}
                </span>
              ) : null}
            </label>
          ))}

          <label class="flex flex-col gap-1.5">
            <span class="text-sm">
              Referencia <span class="text-fg-subtle">(opcional)</span>
            </span>
            <input
              name="reference"
              type="text"
              class="rounded-sm border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm">
              Nota para el comercio <span class="text-fg-subtle">(opcional)</span>
            </span>
            <textarea
              name="notes"
              rows={2}
              class="rounded-sm border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </label>
        </fieldset>

        <fieldset class="flex flex-col gap-4" disabled={enviando}>
          <legend class="text-sm font-medium">
            Facturación <span class="text-fg-subtle">(opcional)</span>
          </legend>
          <label class="flex flex-col gap-1.5">
            <span class="text-sm">RUC</span>
            <input
              name="taxId"
              type="text"
              class="rounded-sm border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="text-sm">Razón social</span>
            <input
              name="taxName"
              type="text"
              class="rounded-sm border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </label>
        </fieldset>

        <fieldset class="flex flex-col gap-3" disabled={enviando}>
          <legend class="text-sm font-medium">Forma de pago</legend>
          {metodos.map((m) => (
            <label key={m.id} class="flex cursor-pointer items-center gap-2.5 text-sm">
              <input
                type="radio"
                name="paymentMethod"
                value={m.id}
                checked={metodo === m.id}
                onChange={() => setMetodo(m.id)}
                class="accent-accent"
              />
              {m.label}
            </label>
          ))}
          {errores.paymentMethod ? (
            <span class="text-xs text-danger">{errores.paymentMethod}</span>
          ) : null}
        </fieldset>
      </div>

      <aside class="flex h-fit flex-col gap-4 rounded-md border border-border p-5">
        <h2 class="text-sm font-medium">Tu pedido</h2>

        <ul class="flex flex-col gap-3">
          {lineas.map((l) => (
            <li key={l.variantId} class="flex justify-between gap-3 text-sm">
              <span class="min-w-0">
                <span class="block truncate">{l.title}</span>
                <span class="text-fg-subtle">
                  {l.quantity} × {formatMoney(l.price, locale)}
                </span>
              </span>
              <span class="shrink-0 tabular-nums">{formatMoney(l.subtotal, locale)}</span>
            </li>
          ))}
        </ul>

        {total ? (
          <div class="flex justify-between border-t border-border pt-4 text-sm font-medium">
            <span>Total</span>
            <span class="tabular-nums">{formatMoney(total, locale)}</span>
          </div>
        ) : null}

        <p aria-live="polite" class="min-h-[1.25rem] text-xs text-danger">
          {errorGeneral}
        </p>

        <button
          type="submit"
          disabled={enviando || lineas.length === 0}
          aria-busy={enviando}
          class={cn(buttonVariants(), 'w-full')}
        >
          {enviando ? 'Confirmando…' : 'Confirmar pedido'}
        </button>

        <p class="text-xs text-fg-subtle">
          El pedido queda pendiente de pago hasta que el comercio confirme la transferencia.
        </p>
      </aside>
    </form>
  );
}
