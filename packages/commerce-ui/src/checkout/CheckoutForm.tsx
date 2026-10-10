import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import {
  esRuc,
  formatMoney,
  validarDatosDeCheckout,
  type ProblemaDeCupon,
} from '@pick/commerce-core';
import type { Money } from '@pick/commerce-types';
import { cn } from '../lib/cn.ts';
import { buttonVariants } from '../recipes/button.ts';
import { clear, getLines, replaceLines, subscribe, type CartLine } from '../cart/store.ts';
import {
  ResumenDePromociones,
  type DineroDelCarrito,
  type RegaloMostrado,
} from '../cart/ResumenDePromociones.tsx';

interface LineaValidada {
  variantId: string;
  title: string;
  variantTitle?: string;
  price: Money;
  available: number;
  quantity: number;
  subtotal: Money;
}

/**
 * Por qué un cupón no entró, en palabras del comprador.
 *
 * Se distingue «no existe» de «venció» y de «se agotó» a propósito: alguien con
 * un cupón legítimamente vencido merece saber que su código era real. Lo que no
 * se hace es buscar por prefijo ni por coincidencia parcial, que sí sería una
 * forma de descubrir códigos probando.
 */
const MOTIVO_DEL_CUPON: Record<ProblemaDeCupon, string> = {
  not_found: 'Ese cupón no existe.',
  not_started: 'Ese cupón todavía no empezó.',
  expired: 'Ese cupón venció.',
  exhausted: 'Ese cupón ya se agotó.',
  minimum: 'Tu pedido no llega al mínimo que pide ese cupón.',
  zone: 'Ese cupón no vale para la zona de envío elegida.',
};

interface Problema {
  type: string;
  variantId: string;
  available?: number;
}

export interface CheckoutFormProps {
  /** Formas de pago habilitadas para la tienda, resueltas en el servidor. */
  metodos: readonly { id: string; label: string }[];
  metodoPorDefecto: string;
  /**
   * Las zonas de entrega cuando la tienda cobra por zona, con su etiqueta ya
   * armada en el servidor («Central · Gs. 30.000»). Vacío: no se pregunta.
   */
  zonas?: readonly { name: string; label: string }[];
  /**
   * El correo de la sesión, cuando quien compra entró a su cuenta.
   *
   * Se muestra y **no se puede cambiar**, y eso cierra el único agujero
   * funcional del diseño de cuentas: el pedido se cuelga del `customers` que
   * lleva ese correo, así que comprar con otro lo dejaría fuera de la cuenta
   * desde la que se está comprando, y quien lo hiciera no tendría cómo darse
   * cuenta. La salida existe y es explícita: salir de la cuenta.
   */
  emailFijo?: string;
  /**
   * La dirección guardada por defecto. A diferencia del correo **se puede
   * editar**: es un punto de partida para no tipear el departamento otra vez, no
   * una restricción. El pedido guarda su propio snapshot igual.
   */
  direccionPrecargada?: {
    readonly street?: string;
    readonly city?: string;
    readonly zone?: string;
    readonly reference?: string;
  };
  locale?: string;
  catalogHref?: string;
  confirmacionHref?: string;
  className?: string;
}

type Estado = 'cargando' | 'listo' | 'enviando' | 'vacio';

/** Los tres pasos del handoff (ADR-166). El índice es el paso; el contenido, sus campos. */
type IndiceDePaso = 0 | 1 | 2;
const CAMPOS_DEL_PASO: readonly (readonly string[])[] = [
  ['email', 'name', 'phone', 'taxId', 'taxName'],
  ['street', 'city', 'zone', 'reference', 'notes'],
  ['paymentMethod'],
];

/** El primer paso que tiene un error, para volver a él. */
function pasoDeLosErrores(errores: Readonly<Record<string, string>>): IndiceDePaso | null {
  const i = CAMPOS_DEL_PASO.findIndex((campos) => campos.some((c) => errores[c]));
  return i < 0 ? null : (i as IndiceDePaso);
}

const ENTRADA =
  'h-11 w-full rounded-[10px] border border-border bg-surface px-3.5 text-[15px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/**
 * Checkout en tres pasos: tus datos, entrega y pago (ADR-166).
 *
 * Cada paso **valida antes de dejar avanzar** con la misma función que corre
 * en el endpoint, filtrada a sus campos, y al pasar se colapsa en una línea con
 * «Cambiar». Los pasos inactivos se esconden pero **no se desmontan**: los
 * campos no son controlados, y desmontarlos se llevaría lo escrito.
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
  zonas = [],
  metodos,
  metodoPorDefecto,
  emailFijo,
  direccionPrecargada,
  locale,
  catalogHref = '/catalogo',
  confirmacionHref = '/checkout/confirmacion',
  className,
}: CheckoutFormProps) {
  const [estado, setEstado] = useState<Estado>('cargando');
  const [lineas, setLineas] = useState<readonly LineaValidada[]>([]);
  const [total, setTotal] = useState<Money | null>(null);
  const [subtotal, setSubtotal] = useState<Money | null>(null);
  const [costoDeEnvio, setCostoDeEnvio] = useState<Money | null>(null);
  const [descuento, setDescuento] = useState<Money | null>(null);
  // Regalos, envío gratis y su umbral (ADR-164): lo que no es un descuento.
  const [regalos, setRegalos] = useState<DineroDelCarrito>({});
  const [promociones, setPromociones] = useState<
    readonly { promotionId: string; title: string; amount: Money }[]
  >([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [metodo, setMetodo] = useState(metodoPorDefecto);

  const [paso, setPaso] = useState<IndiceDePaso>(0);
  /** La línea con que se resume cada paso terminado. */
  const [resumenes, setResumenes] = useState<readonly string[]>(['', '', '']);
  /** Si el documento escrito es un RUC: pide la razón social. */
  const [conRuc, setConRuc] = useState(false);
  /** En el teléfono el resumen del pedido va arriba y plegado, con el total a la vista. */
  const [verResumen, setVerResumen] = useState(false);

  /** Lo que la persona escribió, que no es lo mismo que lo que está aplicado. */
  const [cupon, setCupon] = useState('');
  /** El que el servidor aceptó. Se manda con el pedido y viaja en cada revalidación. */
  const [cuponAplicado, setCuponAplicado] = useState<string | null>(null);
  const [problemaDeCupon, setProblemaDeCupon] = useState<ProblemaDeCupon | null>(null);
  const [validandoCupon, setValidandoCupon] = useState(false);

  const clave = useRef<string>('');
  const enVuelo = useRef(false);
  const formulario = useRef<HTMLFormElement>(null);
  /** El código viaja por ref además de por estado: `revalidar` se llama desde
   * una suscripción que capturó el render viejo. */
  const codigoActual = useRef<string | null>(null);
  /*
   * La zona guardada sólo vale si la tienda todavía la cobra: una dirección de
   * hace seis meses puede apuntar a un departamento que el comercio sacó de la
   * tabla, y precargar un valor que no está entre las opciones deja el `select`
   * en blanco y el envío sin cotizar sin que nadie sepa por qué.
   */
  const zonaPrecargada =
    direccionPrecargada?.zone && zonas.some((z) => z.name === direccionPrecargada.zone)
      ? direccionPrecargada.zone
      : '';

  /** La zona elegida, para que la revalidación cotice el envío con ella. Arranca
   * con la precargada para que la primera cotización ya la use. */
  const zonaActual = useRef<string>(zonaPrecargada);
  /** La misma zona, para dibujar: si todavía no hay, el envío no está cotizado. */
  const [zona, setZona] = useState(zonaPrecargada);

  /** Con qué abre cada campo: la sesión manda el correo, la dirección el resto. */
  function precargado(id: string): string {
    if (id === 'email') return emailFijo ?? '';
    if (id === 'street') return direccionPrecargada?.street ?? '';
    if (id === 'city') return direccionPrecargada?.city ?? '';
    if (id === 'reference') return direccionPrecargada?.reference ?? '';
    return '';
  }
  /**
   * `revalidar` escribe el espejo, y el espejo avisa a los suscriptos, y este
   * formulario está suscripto: sin esta bandera se llama a sí mismo en bucle
   * —una petición por respuesta, mientras el checkout esté abierto—. Se midió
   * en producción: 20 validaciones en cinco segundos con un solo carrito.
   */
  const escribiendo = useRef(false);

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
        ...(codigoActual.current ? { couponCode: codigoActual.current } : {}),
        ...(zonaActual.current ? { zone: zonaActual.current } : {}),
      }),
    });

    if (!respuesta.ok) throw new Error('validate');

    const datos = (await respuesta.json()) as {
      lines: LineaValidada[];
      issues: Problema[];
      total: Money | null;
      subtotal?: Money;
      discount?: Money;
      shipping?: Money;
      appliedPromotions?: { promotionId: string; title: string; amount: Money }[];
      gifts?: RegaloMostrado[];
      freeShipping?: boolean;
      freeShippingFrom?: Money;
      couponIssue?: ProblemaDeCupon;
    };

    const porId = new Map(guardadas.map((l) => [l.variantId, l]));

    /*
     * El aviso dice **qué** pasó con **cuál**. El anterior decía «ajustamos tu
     * carrito» tanto si recortaba una cantidad como si sacaba el producto
     * entero, que son cosas distintas y la segunda se descubría mirando la
     * lista.
     */
    if (datos.issues.length > 0) {
      setAviso(
        datos.issues
          .map((p) => {
            const nombre = porId.get(p.variantId)?.title ?? 'un producto';
            return p.type === 'insufficient_stock' && (p.available ?? 0) > 0
              ? `Dejamos ${p.available} de «${nombre}»: es todo lo que queda.`
              : `Quitamos «${nombre}»: ya no está disponible.`;
          })
          .join(' '),
      );
    }

    // El espejo se alinea con lo que el servidor dice que existe. Si el carrito
    // se vació mientras esto viajaba, `replaceLines` no escribe: ver su docblock.
    escribiendo.current = true;
    try {
      replaceLines(
        datos.lines.map((l): CartLine => ({
          variantId: l.variantId,
          quantity: l.quantity,
          title: porId.get(l.variantId)?.title ?? l.title,
          price: l.price,
          available: l.available,
          ...(porId.get(l.variantId)?.imageUrl
            ? { imageUrl: porId.get(l.variantId)!.imageUrl }
            : {}),
        })),
      );
    } finally {
      escribiendo.current = false;
    }

    setLineas(datos.lines);
    setTotal(datos.total);
    setSubtotal(datos.subtotal ?? null);
    setCostoDeEnvio(datos.shipping ?? null);
    setDescuento(datos.discount ?? null);
    setPromociones(datos.appliedPromotions ?? []);
    setRegalos({
      ...(datos.gifts ? { gifts: datos.gifts } : {}),
      ...(datos.freeShipping ? { freeShipping: true } : {}),
      ...(datos.freeShippingFrom ? { freeShippingFrom: datos.freeShippingFrom } : {}),
    });
    setProblemaDeCupon(datos.couponIssue ?? null);

    // Un cupón que dejó de valer —se agotó, venció, o el carrito bajó del
    // mínimo— se suelta acá. Si se guardara igual, el pedido saldría pidiendo un
    // descuento inexistente y el total mostrado no sería el cobrado.
    if (datos.couponIssue) {
      setCuponAplicado(null);
      codigoActual.current = null;
    }

    setEstado(datos.lines.length === 0 ? 'vacio' : 'listo');
    return datos.lines;
  }

  /**
   * Aplica un cupón revalidando contra el servidor.
   *
   * No calcula nada del lado del browser: manda el código y muestra lo que la
   * base contesta. El precio de un cupón no puede salir de acá.
   */
  async function aplicarCupon(): Promise<void> {
    const codigo = cupon.trim();
    if (codigo === '' || validandoCupon) return;

    setValidandoCupon(true);
    codigoActual.current = codigo;
    try {
      await revalidar();
      // `revalidar` deja el problema en estado; si no hubo, el cupón entró.
      setCuponAplicado(codigoActual.current);
      if (codigoActual.current) setCupon('');
    } catch {
      codigoActual.current = cuponAplicado;
      setErrorGeneral('No pudimos verificar el cupón. Probá de nuevo.');
    } finally {
      setValidandoCupon(false);
    }
  }

  async function quitarCupon(): Promise<void> {
    codigoActual.current = null;
    setCuponAplicado(null);
    setProblemaDeCupon(null);
    await revalidar().catch(() => undefined);
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
      if (!enVuelo.current && !escribiendo.current) revalidar().catch(() => undefined);
    });
  }, []);

  /*
   * El foco acompaña al paso: al avanzar va al título del siguiente, y con un
   * error, al primer campo marcado. Sin esto, quien navega con teclado o lector
   * de pantalla se queda en un botón que acaba de desaparecer.
   */
  const pasoDibujado = useRef<IndiceDePaso>(0);
  useEffect(() => {
    if (pasoDibujado.current === paso) return;
    pasoDibujado.current = paso;
    document.getElementById(`paso-${paso + 1}`)?.focus();
  }, [paso]);

  const enfocarElError = useRef(false);
  useEffect(() => {
    if (!enfocarElError.current) return;
    enfocarElError.current = false;
    formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errores]);

  /** Lo escrito, con la forma que espera el validador y el endpoint. */
  function leerEntrada() {
    const datos = Object.fromEntries(new FormData(formulario.current!).entries()) as Record<
      string,
      string | undefined
    >;
    return {
      customer: {
        name: datos.name,
        email: datos.email,
        phone: datos.phone,
        taxId: datos.taxId,
        taxName: datos.taxName,
      },
      address: {
        street: datos.street,
        city: datos.city,
        zone: datos.zone,
        reference: datos.reference,
      },
      paymentMethod: metodo,
      notes: datos.notes,
    };
  }

  /**
   * Los errores de un paso: los del validador compartido que caen en sus
   * campos. El departamento lo exige además el endpoint contra la tabla de la
   * tienda; acá alcanza con que se haya elegido uno.
   */
  function erroresDelPaso(i: IndiceDePaso): Record<string, string> {
    const entrada = leerEntrada();
    const { errores: todos } = validarDatosDeCheckout(entrada);
    const propios: Record<string, string> = Object.fromEntries(
      Object.entries(todos).filter(([campo]) => CAMPOS_DEL_PASO[i]!.includes(campo)),
    );
    if (i === 1 && zonas.length > 0 && !entrada.address.zone?.trim()) {
      propios.zone = 'Elegí el departamento de entrega.';
    }
    return propios;
  }

  /** La línea con que queda resumido un paso terminado. */
  function resumenDelPaso(i: IndiceDePaso): string {
    const { customer: c, address: a } = leerEntrada();
    const t = (s?: string) => (s ?? '').trim();
    if (i === 0) {
      const doc = t(c.taxId);
      return [t(c.name), t(c.email), t(c.phone), `${esRuc(doc) ? 'RUC' : 'CI'} ${doc}`].join(' · ');
    }
    return `${t(a.street)}, ${t(a.city)}${t(a.zone) ? ` · ${t(a.zone)}` : ''}`;
  }

  function avanzar(i: IndiceDePaso): void {
    const propios = erroresDelPaso(i);
    setErrorGeneral(null);
    if (Object.keys(propios).length > 0) {
      enfocarElError.current = true;
      setErrores(propios);
      return;
    }
    setErrores({});
    setResumenes((r) => r.map((s, j) => (j === i ? resumenDelPaso(i) : s)));
    setPaso((i + 1) as IndiceDePaso);
  }

  async function enviar(evento: Event): Promise<void> {
    evento.preventDefault();
    /*
     * Enter en un campo envía el formulario. Antes del último paso eso no puede
     * crear el pedido: equivale a «Continuar».
     */
    if (paso < 2) {
      avanzar(paso);
      return;
    }
    // Doble defensa contra el doble submit: el botón deshabilitado y esta
    // guarda, que cubre el doble click antes de que el estado se pinte.
    if (enVuelo.current) return;

    const entrada = leerEntrada();
    const validado = validarDatosDeCheckout(entrada);
    if (!validado.datos) {
      // Puede fallar un paso anterior —un dato que se borró después de
      // continuar—: se vuelve a ése, con su error a la vista.
      const volver = pasoDeLosErrores(validado.errores);
      if (volver !== null) setPaso(volver);
      enfocarElError.current = true;
      setErrores(validado.errores as Record<string, string>);
      setErrorGeneral(null);
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
          // Va el **código**, nunca el monto: `create_order` lo resuelve contra
          // la base dentro de su transacción.
          ...(cuponAplicado ? { couponCode: cuponAplicado } : {}),
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
        // El servidor manda: si un dato de un paso anterior no le sirvió —el
        // departamento, por ejemplo—, se vuelve a ese paso con el error puesto.
        const volver = pasoDeLosErrores(cuerpo.errores);
        if (volver !== null) setPaso(volver);
        enfocarElError.current = true;
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
        <div class="h-4 w-32 animate-pulse rounded-sm bg-surface-sunken" />
        <div class="h-16 animate-pulse rounded-sm bg-surface-sunken" />
        <div class="h-16 animate-pulse rounded-sm bg-surface-sunken" />
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
  const props = (id: string) => ({
    error: errores[id],
    defaultValue: precargado(id),
  });

  /*
   * El envío depende de la zona cuando la tienda cobra por zona: hasta que se
   * elige una, decir un número sería decir el de la tarifa general, que puede no
   * ser el que se cobre. Como en el handoff, «Se calcula en la entrega».
   */
  const envioConocido = zonas.length === 0 || zona !== '';
  const deProductos =
    subtotal !== null
      ? { amount: subtotal.amount - (descuento?.amount ?? 0), currency: subtotal.currency }
      : null;
  const totalMostrado = envioConocido ? total : (deProductos ?? total);

  return (
    <form
      ref={formulario}
      onSubmit={enviar}
      noValidate
      class={cn('grid items-start gap-8 md:grid-cols-[1fr_20rem]', className)}
    >
      <div class="flex min-w-0 flex-col">
        {aviso ? (
          <p role="status" class="mb-4 rounded-md bg-surface-sunken px-4 py-3 text-sm">
            {aviso}
          </p>
        ) : null}
        <p aria-live="polite" class={cn('text-sm text-danger', errorGeneral && 'mb-4')}>
          {errorGeneral}
        </p>

        <Paso
          numero={1}
          titulo="Tus datos"
          activo={paso === 0}
          hecho={paso > 0}
          resumen={resumenes[0]}
          onCambiar={() => setPaso(0)}
        >
          <fieldset class="grid gap-4 sm:grid-cols-2" disabled={enviando}>
            <legend class="sr-only">Tus datos</legend>
            <Campo
              id="email"
              label="Correo"
              tipo="email"
              autoComplete="email"
              placeholder="nombre@correo.com"
              className="sm:col-span-2"
              {...props('email')}
              /*
                `readOnly` y no `disabled`: un campo deshabilitado no viaja en el
                formulario, así que el correo de la sesión no llegaría y el pedido
                quedaría sin cliente. De sólo lectura se ve, se copia y se manda.
              */
              readOnly={Boolean(emailFijo)}
              ayuda={
                emailFijo ? 'El de tu cuenta. Para comprar con otro, salí de la cuenta.' : undefined
              }
            />
            <Campo
              id="name"
              label="Nombre y apellido"
              autoComplete="name"
              className="sm:col-span-2"
              {...props('name')}
            />
            <Campo
              id="phone"
              label="Celular"
              tipo="tel"
              autoComplete="tel"
              placeholder="0981 123 456"
              {...props('phone')}
            />
            <Campo
              id="taxId"
              label="CI o RUC para la factura"
              placeholder="4512873 o 80012345-6"
              {...props('taxId')}
              onInput={(valor) => setConRuc(esRuc(valor))}
            />
            {conRuc ? (
              <Campo
                id="taxName"
                label="Razón social"
                placeholder="Como figura en el RUC"
                className="sm:col-span-2"
                {...props('taxName')}
              />
            ) : null}
          </fieldset>
          <button
            type="button"
            onClick={() => avanzar(0)}
            disabled={enviando}
            class={cn(buttonVariants({ size: 'lg' }), 'w-full')}
          >
            Continuar a la entrega
          </button>
        </Paso>

        <Paso
          numero={2}
          titulo="Entrega"
          activo={paso === 1}
          hecho={paso > 1}
          resumen={resumenes[1]}
          onCambiar={() => setPaso(1)}
        >
          <fieldset class="grid gap-4 sm:grid-cols-2" disabled={enviando}>
            <legend class="sr-only">Entrega</legend>
            <Campo
              id="street"
              label="Calle y número"
              autoComplete="street-address"
              className="sm:col-span-2"
              {...props('street')}
            />
            <Campo id="city" label="Ciudad" autoComplete="address-level2" {...props('city')} />

            {zonas.length > 0 ? (
              <label class="flex flex-col gap-1.5">
                <span class="text-sm font-medium">Departamento de entrega</span>
                {/*
                  El importe del envío lo cotiza el servidor con la zona elegida:
                  cambiarla vuelve a validar, así el resumen muestra el número que
                  se va a cobrar y no una aproximación.
                */}
                <select
                  name="zone"
                  aria-invalid={errores.zone ? 'true' : undefined}
                  aria-describedby={errores.zone ? 'error-zone' : undefined}
                  defaultValue={zonaPrecargada}
                  onChange={(evento) => {
                    zonaActual.current = evento.currentTarget.value;
                    setZona(evento.currentTarget.value);
                    if (!enVuelo.current) revalidar().catch(() => undefined);
                  }}
                  class={cn(ENTRADA, 'cursor-pointer', errores.zone && 'border-danger')}
                >
                  <option value="">Elegí el departamento</option>
                  {zonas.map((z) => (
                    <option key={z.name} value={z.name}>
                      {z.label}
                    </option>
                  ))}
                </select>
                {errores.zone ? (
                  <span id="error-zone" class="text-xs text-danger">
                    {errores.zone}
                  </span>
                ) : null}
              </label>
            ) : null}

            <Campo
              id="reference"
              label="Referencia"
              opcional
              className="sm:col-span-2"
              {...props('reference')}
            />

            <label class="flex flex-col gap-1.5 sm:col-span-2">
              <span class="text-sm font-medium">
                Nota para el comercio <span class="font-normal text-fg-subtle">(opcional)</span>
              </span>
              <textarea
                name="notes"
                rows={2}
                class="rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-[15px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
            </label>
          </fieldset>
          <button
            type="button"
            onClick={() => avanzar(1)}
            disabled={enviando}
            class={cn(buttonVariants({ size: 'lg' }), 'w-full')}
          >
            Continuar al pago
          </button>
        </Paso>

        <Paso numero={3} titulo="Pago" activo={paso === 2} hecho={false}>
          <fieldset class="flex flex-col gap-2" disabled={enviando}>
            <legend class="sr-only">Forma de pago</legend>
            {metodos.map((m) => (
              <label
                key={m.id}
                class={cn(
                  'flex cursor-pointer items-center gap-3 rounded-[10px] border px-4 py-3.5 text-[15px]',
                  metodo === m.id ? 'border-fg bg-surface-sunken' : 'border-border',
                )}
              >
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

          <button
            type="submit"
            disabled={enviando || lineas.length === 0}
            aria-busy={enviando}
            class={cn(buttonVariants({ size: 'lg' }), 'w-full')}
          >
            {enviando ? 'Confirmando…' : 'Confirmar el pedido'}
          </button>
          <p class="text-xs text-fg-subtle">
            Con transferencia, el pedido queda pendiente de pago hasta que el comercio la confirme.
          </p>
        </Paso>
      </div>

      {/*
        El resumen: al costado en escritorio, y arriba y plegado en el teléfono,
        con el total a la vista, como el handoff. Plegado con una clase y no con
        un `<details>`: en escritorio tiene que estar siempre abierto.
      */}
      <aside class="order-first flex h-fit flex-col gap-4 rounded-md border border-border p-5 md:order-none">
        <button
          type="button"
          aria-expanded={verResumen}
          aria-controls="resumen-del-pedido"
          onClick={() => setVerResumen((v) => !v)}
          class="flex cursor-pointer items-center justify-between gap-3 text-sm md:hidden"
        >
          <span class="font-medium">{verResumen ? 'Ocultar el resumen' : 'Ver el resumen'}</span>
          {totalMostrado ? (
            <span class="font-medium tabular-nums">{formatMoney(totalMostrado, locale)}</span>
          ) : null}
        </button>

        <div
          id="resumen-del-pedido"
          class={cn(verResumen ? 'flex' : 'hidden', 'flex-col gap-4 md:flex')}
        >
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

          {estado === 'listo' ? (
            <div class="flex flex-col gap-2 border-t border-border pt-4">
              <label class="text-xs text-fg-muted" for="cupon">
                ¿Tenés un cupón?
              </label>
              {cuponAplicado ? (
                <div class="flex items-center justify-between gap-2 text-sm">
                  <span class="min-w-0 truncate font-medium">{cuponAplicado}</span>
                  <button
                    type="button"
                    onClick={quitarCupon}
                    class="shrink-0 cursor-pointer text-xs text-fg-muted underline underline-offset-2 hover:text-fg"
                  >
                    Quitar
                  </button>
                </div>
              ) : (
                <div class="flex gap-2">
                  <input
                    id="cupon"
                    name="cupon"
                    type="text"
                    autocomplete="off"
                    value={cupon}
                    disabled={validandoCupon}
                    onInput={(e) => setCupon((e.target as HTMLInputElement).value)}
                    onKeyDown={(e) => {
                      // Enter aplica el cupón en vez de enviar el pedido, que es
                      // lo que haría por estar dentro del formulario.
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void aplicarCupon();
                      }
                    }}
                    aria-invalid={problemaDeCupon ? 'true' : undefined}
                    aria-describedby={problemaDeCupon ? 'cupon-error' : undefined}
                    class="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm uppercase placeholder:normal-case focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
                    placeholder="Código"
                  />
                  <button
                    type="button"
                    onClick={aplicarCupon}
                    disabled={validandoCupon || cupon.trim() === ''}
                    class={cn(
                      buttonVariants({ variant: 'secondary' }),
                      'shrink-0 disabled:pointer-events-none disabled:opacity-60',
                    )}
                  >
                    {validandoCupon ? 'Verificando…' : 'Aplicar'}
                  </button>
                </div>
              )}
              {problemaDeCupon ? (
                <p id="cupon-error" class="text-xs text-danger" role="status">
                  {MOTIVO_DEL_CUPON[problemaDeCupon]}
                </p>
              ) : null}
            </div>
          ) : null}

          {totalMostrado ? (
            <div class="flex flex-col gap-2 border-t border-border pt-4 text-sm">
              {/* El desglose sólo aparece cuando hay algo que desglosar: con un
                  descuento en cero, tres renglones que dicen lo mismo confunden. */}
              {((descuento && descuento.amount > 0) || costoDeEnvio) && subtotal ? (
                <div class="flex justify-between text-fg-muted">
                  <span>Subtotal</span>
                  <span class="tabular-nums">{formatMoney(subtotal, locale)}</span>
                </div>
              ) : null}
              {deProductos ? (
                <ResumenDePromociones
                  dinero={{ appliedPromotions: promociones, ...regalos }}
                  totalDeProductos={deProductos}
                  locale={locale}
                  conLineaDeEnvio
                />
              ) : null}
              {/*
                El envío se muestra aunque sea cero, y por eso dice «Gratis» en vez
                de «0»: enterarse de que no se cobra es parte de lo que decide la
                compra, y una línea ausente se lee como que todavía falta calcularlo.
              */}
              {costoDeEnvio ? (
                <div class="flex justify-between text-fg-muted">
                  <span>Envío</span>
                  <span class="tabular-nums">
                    {!envioConocido
                      ? 'Se calcula en la entrega'
                      : costoDeEnvio.amount === 0
                        ? 'Gratis'
                        : formatMoney(costoDeEnvio, locale)}
                  </span>
                </div>
              ) : null}
              <div class="flex justify-between font-medium">
                <span>Total</span>
                <span class="tabular-nums">{formatMoney(totalMostrado, locale)}</span>
              </div>
            </div>
          ) : null}
        </div>
      </aside>
    </form>
  );
}

/**
 * Un paso del checkout: su número —o una tilde si ya se terminó—, su título y,
 * terminado, la línea que lo resume con «Cambiar».
 *
 * El contenido se esconde con una clase y no se desmonta: los campos guardan lo
 * escrito, y el formulario los manda todos juntos al final.
 */
function Paso({
  numero,
  titulo,
  activo,
  hecho,
  resumen,
  onCambiar,
  children,
}: {
  numero: number;
  titulo: string;
  activo: boolean;
  hecho: boolean;
  resumen?: string | undefined;
  onCambiar?: () => void;
  children: ComponentChildren;
}) {
  return (
    <section
      aria-labelledby={`paso-${numero}`}
      aria-current={activo ? 'step' : undefined}
      class="flex flex-col gap-4 border-t border-border py-5 first-of-type:border-t-0 first-of-type:pt-0"
    >
      <div class="flex items-center gap-3">
        <span
          aria-hidden="true"
          class={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
            activo || hecho ? 'bg-fg text-surface' : 'bg-surface-sunken text-fg-subtle',
          )}
        >
          {hecho ? '✓' : numero}
        </span>
        <h2
          id={`paso-${numero}`}
          tabIndex={-1}
          class={cn(
            'flex-1 text-[17px] font-semibold outline-none',
            !activo && !hecho && 'text-fg-subtle',
          )}
        >
          {titulo}
        </h2>
        {hecho && onCambiar ? (
          <button
            type="button"
            onClick={onCambiar}
            aria-label={`Cambiar ${titulo.toLowerCase()}`}
            class="cursor-pointer text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Cambiar
          </button>
        ) : null}
      </div>
      {hecho && resumen ? <p class="ml-9 text-sm text-fg-muted">{resumen}</p> : null}
      <div class={cn('flex-col gap-4', activo ? 'flex' : 'hidden')}>{children}</div>
    </section>
  );
}

/** Un campo de texto con su rótulo, su ayuda y su error, con las medidas del handoff. */
function Campo({
  id,
  label,
  tipo = 'text',
  autoComplete,
  placeholder,
  defaultValue,
  readOnly = false,
  opcional = false,
  ayuda,
  error,
  onInput,
  className,
}: {
  id: string;
  label: string;
  tipo?: string;
  autoComplete?: string;
  placeholder?: string;
  defaultValue?: string;
  readOnly?: boolean;
  opcional?: boolean;
  ayuda?: string | undefined;
  error?: string | undefined;
  onInput?: (valor: string) => void;
  className?: string;
}) {
  return (
    <label class={cn('flex flex-col gap-1.5', className)}>
      <span class="text-sm font-medium">
        {label}
        {opcional ? <span class="font-normal text-fg-subtle"> (opcional)</span> : null}
      </span>
      <input
        name={id}
        type={tipo}
        autocomplete={autoComplete}
        placeholder={placeholder}
        readOnly={readOnly}
        defaultValue={defaultValue}
        onInput={onInput ? (e) => onInput((e.target as HTMLInputElement).value) : undefined}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `error-${id}` : undefined}
        class={cn(
          ENTRADA,
          readOnly && 'cursor-not-allowed text-fg-muted',
          error && 'border-danger',
        )}
      />
      {ayuda ? <span class="text-xs text-fg-subtle">{ayuda}</span> : null}
      {error ? (
        <span id={`error-${id}`} class="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </label>
  );
}
