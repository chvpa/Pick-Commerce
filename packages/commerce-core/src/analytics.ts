/**
 * Los eventos del storefront (PROJECT.md §22).
 *
 * El Admin ya responde «cuánto vendí» derivándolo de los pedidos (ADR-067). Esto
 * es la otra mitad: cuánta gente miró, qué buscó y dónde se cayó del embudo.
 *
 * **Lo que se registra acá nunca es la fuente del dinero.** Los eventos aportan
 * el denominador —sesiones, pasos del embudo, términos buscados— y `orders`
 * aporta el numerador. Por eso la conversión coincide con la facturación por
 * construcción, y por eso este log entero se puede tirar sin perder una venta,
 * que es lo que PROJECT.md §22 exige para poder migrarlo algún día.
 *
 * Todo lo de este módulo es puro: decide **qué** contar, no cómo guardarlo.
 */

/**
 * Los ocho que la Fase 10 pide.
 *
 * Dos de los diez de PROJECT.md §22 no están, y no por olvido:
 *
 * - `wishlist_add` no tiene feature que lo emita — la wishlist es v2.
 * - `remove_from_cart` es el único sin momento de servidor: quitar una línea del
 *   carrito no habla con nadie. Registrarlo costaría JavaScript en el navegador,
 *   que es justo lo que este diseño evita.
 */
export const TIPOS_DE_EVENTO = [
  'page_view',
  'product_view',
  'search',
  'search_no_results',
  'add_to_cart',
  'coupon_applied',
  'begin_checkout',
  'checkout_completed',
] as const;

export type TipoDeEvento = (typeof TIPOS_DE_EVENTO)[number];

/**
 * Un evento listo para guardar.
 *
 * `data` es `jsonb` del lado de la base y va sin tipar por tipo de evento a
 * propósito: agregar un campo no puede exigir una migración. Lo que cada tipo
 * pone está en `datosDe*` más abajo, que es donde se lee de una.
 */
export interface EventoDeTienda {
  readonly type: TipoDeEvento;
  /** La sesión anónima. Nunca una IP, nunca un cliente (PROJECT.md §23). */
  readonly sessionId: string;
  /** La ruta, sin query: el término va en `data` y el resto es ruido. */
  readonly path: string;
  readonly data?: Readonly<Record<string, unknown>>;
  /**
   * Con qué se descarta un duplicado. `undefined` cuando repetirse es el dato
   * —dos `page_view` son dos vistas— y con valor cuando no lo es.
   *
   * Ver `claveDeDeduplicacion`.
   */
  readonly dedupeKey?: string;
}

/**
 * El destino de los eventos.
 *
 * Se abstrae desde v1 con una sola implementación, que es una de las excepciones
 * declaradas a la regla anti-overengineering (CLAUDE.md, «Analytics destination»)
 * y lo que pide el último ítem de la Fase 10: «abstraer storage para migración
 * futura». Hoy escribe en Postgres; el día que el volumen no entre, cambia esta
 * implementación y no el storefront.
 *
 * `registrar` recibe un **lote**: un solo request produce varios eventos —una
 * búsqueda sin resultados es `page_view` + `search` + `search_no_results`— y
 * mandarlos de a uno serían tres viajes para una visita.
 */
export interface AnalyticsDestination {
  readonly id: string;
  registrar(storeId: string, eventos: readonly EventoDeTienda[]): Promise<void>;
  /**
   * Borra lo más viejo que `dias`. Devuelve cuántas filas se llevó.
   *
   * Vive en el puerto y no en un script porque no hay scheduler en el proyecto:
   * la purga viaja con el tráfico, igual que el drenaje de la cola de correos.
   * Un destino que retenga solo —Analytics Engine, por ejemplo— la implementa
   * como un no-op.
   */
  purgar(storeId: string, dias: number): Promise<number>;
}

/** Lo que el Admin lee. Separado del destino, como `payments.ts` separa el proveedor del repositorio. */
export interface RepositorioAnalytics {
  resumen(storeId: string, from: string, to: string): Promise<ResumenDeAnalytics>;
}

/** Un paso del embudo: cuántas sesiones llegaron y qué fracción del total son. */
export interface PasoDelEmbudo {
  readonly sesiones: number;
  /** Sobre el total de sesiones del período, en tanto por uno. `0` si no hubo ninguna. */
  readonly tasa: number;
}

export interface TerminoBuscado {
  readonly termino: string;
  readonly busquedas: number;
  /** Cuántas de esas no devolvieron nada. */
  readonly sinResultados: number;
}

export interface ResumenDeAnalytics {
  readonly sesiones: number;
  readonly vistas: number;
  readonly vistasDeProducto: number;
  /**
   * Desde cuándo hay medición dentro del período, o `null` si no hay nada.
   *
   * Existe porque `orders` tiene historia y `store_events` empieza el día que se
   * activa analytics: pedir «últimos 30 días» el primer día devolvía treinta días
   * de pedidos contra unas horas de sesiones, y una conversión del 600 %.
   *
   * La conversión se calcula desde acá, y la pantalla lo dice cuando es posterior
   * al borde del período. Cuando el período está medido entero —el estado
   * normal— coincide con `admin_dashboard` al pedido.
   */
  readonly medidoDesde: string | null;
  readonly agregaronAlCarrito: PasoDelEmbudo;
  readonly empezaronElCheckout: PasoDelEmbudo;
  /**
   * La conversión.
   *
   * El numerador **no** sale de los eventos: sale de `orders`, sin los
   * cancelados, igual que el resumen de ventas, y acotado al tramo que
   * `medidoDesde` declara.
   */
  readonly convirtieron: PasoDelEmbudo;
  /** Sesiones que empezaron el checkout y no terminaron. */
  readonly abandonaron: number;
  readonly terminos: readonly TerminoBuscado[];
}

/**
 * Un término de búsqueda, comparable consigo mismo.
 *
 * «Campera», «campera» y «campera  » son la misma intención y tres filas
 * distintas si no se normalizan: el panel de búsquedas quedaría lleno de
 * variantes de lo mismo y ningún término llegaría arriba.
 *
 * El tope de largo no es cosmético: el término entra en la clave de
 * deduplicación, y una clave sin límite la escribe cualquiera desde la barra de
 * direcciones.
 */
const LARGO_MAXIMO_DEL_TERMINO = 120;

export function normalizarTermino(texto: string): string {
  return texto.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, LARGO_MAXIMO_DEL_TERMINO);
}

/**
 * Con qué se descarta un duplicado, o `undefined` si repetirse es el dato.
 *
 * Tres eventos se repiten sin que nadie repita nada:
 *
 * - `checkout_completed`: reintentar el checkout con la misma clave de
 *   idempotencia devuelve el pedido que ya existe y responde 201 igual. Dos
 *   eventos, un pedido.
 * - `coupon_applied`: el checkout revalida el carrito en cada cambio y reenvía el
 *   cupón, que resuelve bien todas las veces.
 * - `search`: la PLP reenvía `q` en un campo oculto al cambiar de faceta, así que
 *   buscar una vez y tocar cinco filtros son cinco búsquedas.
 *
 * Se deduplica **al escribir** y no al leer: así el log crudo queda honesto, que
 * es lo que va a mirar quien dude del número.
 */
export function claveDeDeduplicacion(
  tipo: TipoDeEvento,
  sessionId: string,
  data: Readonly<Record<string, unknown>> | undefined,
): string | undefined {
  if (tipo === 'checkout_completed') {
    const orderId = data?.orderId;
    return typeof orderId === 'string' ? orderId : undefined;
  }

  if (tipo === 'coupon_applied') {
    const codigo = data?.code;
    return typeof codigo === 'string' ? `${sessionId}:${codigo.toLowerCase()}` : undefined;
  }

  if (tipo === 'search' || tipo === 'search_no_results') {
    const termino = data?.term;
    return typeof termino === 'string' ? `${sessionId}:${termino}` : undefined;
  }

  // `page_view`, `product_view`, `add_to_cart` y `begin_checkout`: repetirse es
  // el dato. Dos vistas son dos vistas, y agregar dos veces son dos altas.
  return undefined;
}

/**
 * Si esto lo navegó una persona.
 *
 * No es una precaución teórica. El sitio **invita** a los crawlers de IA a
 * propósito (ADR-046) y el sitemap publica el catálogo entero, así que un bot
 * recorriendo quinientos productos es el caso normal, no el raro. Y como no
 * acepta cookies, cada petición suya sería una sesión nueva: una conversión real
 * del 2 % se leería como 0,05 %.
 *
 * Lo peor es que el Definition of Done de la fase **no lo detecta**. Pide que las
 * métricas coincidan con `orders`, y coinciden: el numerador sale de ahí. Lo que
 * se pudre es el denominador, en silencio. Por eso esto vive en el core con
 * tests y no como un `if` en el middleware.
 *
 * Se acepta por lista negra y no por lista blanca: un navegador que no
 * reconozcamos tiene que contar, y un bot que se nos escape es un error más
 * barato que perder a todos los usuarios de un navegador nuevo.
 */
const BOT =
  /bot|crawler|spider|crawling|headless|preview|slurp|scrape|monitor|facebookexternalhit|feedfetcher|python-requests|curl\/|wget|axios|node-fetch|okhttp|java\/|go-http/i;

export function esNavegacionDePersona(userAgent: string | null | undefined): boolean {
  // Sin user-agent no hay navegador: los que no lo mandan son scripts.
  if (!userAgent || userAgent.trim() === '') return false;
  return !BOT.test(userAgent);
}

/**
 * Si esta petición es una precarga y no una visita.
 *
 * El `ClientRouter` de la PLP precarga **todos** los enlaces al pasar el mouse
 * por encima 80 ms, y cada precarga es un GET real al Worker. Con doce tarjetas,
 * tres a ocho vistas de producto que nadie miró es comportamiento normal de
 * mouse.
 *
 * No infla la conversión —la precarga viaja con la misma cookie, así que no crea
 * sesiones ni pasos del embudo, que se cuentan por sesión distinta— pero sí las
 * vistas, que son justo el número que se lee crudo.
 *
 * Chrome manda `Sec-Purpose: prefetch` y Firefox `X-moz: prefetch`. Safari usa un
 * `fetch()` sin ninguna cabecera que lo distinga, y ese residuo queda declarado
 * en la pantalla en vez de fingir que no existe.
 */
export function esPrecarga(cabeceras: {
  secPurpose?: string | null;
  xMoz?: string | null;
}): boolean {
  return (
    (cabeceras.secPurpose ?? '').includes('prefetch') ||
    (cabeceras.xMoz ?? '').toLowerCase() === 'prefetch'
  );
}
