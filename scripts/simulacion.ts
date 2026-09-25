/**
 * Compradores simulados: qué pasa en la tienda, sin escribir nada (ADR-133).
 *
 * No hay clientes reales todavía, y cohortes, RFM, envejecimiento de inventario y
 * «entender la consulta» se calculan sobre historia. Esto la fabrica **declarada
 * como tal**: el script que la aplica (`simular-compradores.ts`) sólo corre sobre
 * una tienda en modo demostración, y cada comprador tiene un correo en
 * `.invalid`, que por RFC 2606 no puede existir.
 *
 * Todo lo de este módulo es puro y determinista: la misma semilla da la misma
 * tienda, que es lo que permite rehacerla idéntica después de limpiarla y
 * comparar una pantalla antes y después de un cambio.
 *
 * Lo que decide la forma de los datos, y por qué:
 *
 * - **La popularidad sigue una ley de Zipf.** Unos pocos productos se venden
 *   mucho y la mayoría nunca: sin esa cola, el envejecimiento de inventario no
 *   tendría nada que mostrar.
 * - **Cuatro arquetipos de comprador** con proporciones de tienda chica: la
 *   mayoría compra una vez. Sin recurrencia desigual, RFM y cohortes dan una
 *   tabla plana.
 * - **El tráfico crece** a lo largo del período y sube el fin de semana, para
 *   que las cohortes tardías sean más grandes que las tempranas.
 * - **Los importes no se inventan acá.** El pedido lleva variantes y
 *   cantidades; el precio, el envío y el descuento los calcula `create_order`.
 */

/** mulberry32: 32 bits de estado, suficiente para una simulación y reproducible. */
export function prng(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface VarianteSim {
  readonly id: string;
  readonly available: number;
}

export interface ProductoSim {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly brand: string | null;
  readonly categoria: string | null;
  readonly variantes: readonly VarianteSim[];
}

export type Arquetipo = 'unica' | 'ocasional' | 'fiel' | 'vip';

/** Proporción, compras y días entre una y otra de cada arquetipo. */
export const ARQUETIPOS: Readonly<
  Record<Arquetipo, { peso: number; compras: [number, number]; espera: [number, number] }>
> = {
  unica: { peso: 0.65, compras: [1, 1], espera: [0, 0] },
  ocasional: { peso: 0.25, compras: [2, 3], espera: [30, 70] },
  fiel: { peso: 0.08, compras: [4, 7], espera: [15, 30] },
  vip: { peso: 0.02, compras: [6, 12], espera: [7, 20] },
};

export interface Comprador {
  readonly email: string;
  readonly name: string;
  readonly phone: string;
  readonly arquetipo: Arquetipo;
  readonly deviceId: string;
}

export interface EventoSim {
  readonly type:
    | 'page_view'
    | 'product_view'
    | 'search'
    | 'add_to_cart'
    | 'begin_checkout'
    | 'checkout_completed';
  readonly path: string;
  readonly data?: Readonly<Record<string, unknown>>;
  /** Segundos desde el comienzo de la visita. */
  readonly segundo: number;
}

export interface PedidoSim {
  readonly comprador: Comprador;
  readonly lineas: readonly { variantId: string; quantity: number }[];
  readonly address: { street: string; city: string; zone?: string };
}

export interface Visita {
  readonly at: Date;
  readonly sessionId: string;
  readonly deviceId: string;
  readonly eventos: readonly EventoSim[];
  /** Sólo en las visitas que terminan en compra. */
  readonly pedido?: PedidoSim;
}

export interface OpcionesDeSimulacion {
  readonly semilla: number;
  readonly dias: number;
  readonly compradores: number;
  /** Visitas anónimas por día al comienzo del período; al final son el doble. */
  readonly visitasPorDia: number;
  readonly hasta: Date;
  readonly productos: readonly ProductoSim[];
  /** Los nombres de las zonas de envío de la tienda, si cobra por zona. */
  readonly zonas?: readonly string[];
}

const DIA = 24 * 60 * 60 * 1000;

const NOMBRES = [
  'Ana',
  'Lucía',
  'Sofía',
  'Valentina',
  'Camila',
  'María',
  'Paula',
  'Julieta',
  'Carla',
  'Laura',
  'Diego',
  'Juan',
  'Mateo',
  'Lucas',
  'Santiago',
  'Martín',
  'Pablo',
  'Nicolás',
  'Andrés',
  'Tomás',
];
const APELLIDOS = [
  'Benítez',
  'González',
  'Martínez',
  'Giménez',
  'Ramírez',
  'Duarte',
  'Villalba',
  'Acosta',
  'Ortiz',
  'Rojas',
  'Cáceres',
  'Franco',
  'Báez',
  'Núñez',
  'Ayala',
  'Florentín',
];
const CALLES = ['Mcal. López', 'España', 'Artigas', 'Brasilia', 'Sacramento', 'Perú', 'Colón'];
const CIUDADES = ['Asunción', 'San Lorenzo', 'Luque', 'Lambaré', 'Fernando de la Mora'];

/**
 * Lo que alguien escribe y la tienda puede no tener. El número de resultados no
 * se decide acá: lo mide el script contra el catálogo real.
 */
const PEDIDOS_SUELTOS = ['regalo', 'oferta', 'mochila', 'reloj', 'perfume', 'gorra', 'bicicleta'];

/** Elige de una lista con pesos que no hace falta normalizar. */
function elegir<T>(r: () => number, items: readonly T[], pesos: readonly number[]): T {
  let total = 0;
  for (const p of pesos) total += p;
  let x = r() * total;
  for (let i = 0; i < items.length; i++) {
    x -= pesos[i]!;
    if (x <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

const entre = (r: () => number, [min, max]: readonly [number, number]): number =>
  min + Math.floor(r() * (max - min + 1));

/** Un uuid v4 salido del generador, para que la semilla también fije los ids. */
function uuid(r: () => number): string {
  const h = Array.from({ length: 32 }, () => Math.floor(r() * 16).toString(16));
  h[12] = '4';
  h[16] = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  const s = h.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

function sinAcentos(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * Las frases que se buscan: marcas, categorías y palabras de los títulos, más
 * algún error de tipeo y lo que la tienda quizá no vende.
 */
export function vocabulario(productos: readonly ProductoSim[]): string[] {
  const frases = new Set<string>();
  for (const p of productos) {
    if (p.brand) frases.add(p.brand.toLowerCase());
    if (p.categoria) frases.add(p.categoria.toLowerCase());
    for (const palabra of p.title.toLowerCase().split(/[^\p{L}]+/u)) {
      if (palabra.length >= 5) frases.add(palabra);
    }
  }
  return [...frases].sort();
}

/** Una letra de menos: el error más común, y el que el buscador tiene que absorber. */
function conErrorDeTipeo(r: () => number, frase: string): string {
  if (frase.length < 5) return frase;
  const i = 1 + Math.floor(r() * (frase.length - 2));
  return frase.slice(0, i) + frase.slice(i + 1);
}

/** Pesos de Zipf sobre un orden al azar: el rango lo decide la semilla, no el alta. */
function zipf<T>(
  r: () => number,
  items: readonly T[],
  exponente: number,
): { items: T[]; pesos: number[] } {
  const barajados = [...items];
  for (let i = barajados.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [barajados[i], barajados[j]] = [barajados[j]!, barajados[i]!];
  }
  return { items: barajados, pesos: barajados.map((_, i) => 1 / (i + 1) ** exponente) };
}

/** En qué quedó un pedido según su edad. Los cancelados vuelven el stock. */
export function destinoDelPedido(
  edadEnDias: number,
  r: () => number,
): { status: 'received' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'; pagado: boolean } {
  if (edadEnDias > 1 && r() < 0.06) return { status: 'cancelled', pagado: false };
  if (edadEnDias > 7) return { status: 'delivered', pagado: true };
  if (edadEnDias > 3) return { status: 'shipped', pagado: true };
  if (edadEnDias > 1) return { status: 'confirmed', pagado: true };
  return { status: 'received', pagado: false };
}

export function simular(o: OpcionesDeSimulacion): Visita[] {
  const r = prng(o.semilla);
  const desde = o.hasta.getTime() - o.dias * DIA;

  const populares = zipf(r, o.productos, 1.1);
  const conStock = o.productos.filter((p) => p.variantes.some((v) => v.available > 0));
  const vendibles = zipf(r, conStock, 1.1);
  const frases = zipf(r, [...vocabulario(o.productos), ...PEDIDOS_SUELTOS], 1);

  // El stock se descuenta a medida que se compra, igual que en la base: un
  // pedido que `create_order` rechazaría por falta de stock no se genera.
  const stock = new Map<string, number>();
  for (const p of conStock) for (const v of p.variantes) stock.set(v.id, v.available);

  // El tráfico: crece a lo largo del período y sube el fin de semana.
  const pesoDelDia = (d: number): number => {
    const dia = new Date(desde + d * DIA).getUTCDay();
    return (1 + d / o.dias) * (dia === 0 || dia === 6 ? 1.25 : 1);
  };
  const dias = Array.from({ length: o.dias }, (_, d) => d);
  const pesosDeDias = dias.map(pesoDelDia);

  const momento = (d: number): Date =>
    // Entre las 8 y las 21 de UTC-3: el día simulado no se pasa al siguiente,
    // y el último no cae después de `hasta`.
    new Date(desde + d * DIA + (11 + r() * 13) * 60 * 60 * 1000);

  const visitas: Visita[] = [];

  /** Una navegación: mira, a veces busca, a veces agrega. */
  function navegar(eventos: EventoSim[], reloj: { s: number }, vistas: number): void {
    const paso = (e: Omit<EventoSim, 'segundo'>) => {
      reloj.s += 5 + Math.floor(r() * 90);
      eventos.push({ ...e, segundo: reloj.s });
    };
    if (r() < 0.7) paso({ type: 'page_view', path: '/' });
    if (r() < 0.3) {
      let frase = elegir(r, frases.items, frases.pesos);
      if (r() < 0.1) frase = conErrorDeTipeo(r, frase);
      paso({ type: 'page_view', path: '/catalogo' });
      paso({ type: 'search', path: '/catalogo', data: { term: sinAcentos(frase) } });
    }
    for (let i = 0; i < vistas; i++) {
      const p = elegir(r, populares.items, populares.pesos);
      const path = `/productos/${p.handle}`;
      paso({ type: 'page_view', path });
      paso({ type: 'product_view', path, data: { handle: p.handle, productId: p.id } });
    }
  }

  // 1. Las visitas que no compran: el denominador.
  for (const d of dias) {
    const cuantas = Math.round(o.visitasPorDia * pesoDelDia(d) * (0.8 + r() * 0.4));
    for (let i = 0; i < cuantas; i++) {
      const eventos: EventoSim[] = [];
      const reloj = { s: 0 };
      navegar(eventos, reloj, 1 + Math.floor(-Math.log(1 - r()) * 1.5));
      const producto = r() < 0.09 ? elegir(r, vendibles.items, vendibles.pesos) : undefined;
      if (producto) {
        const variante = producto.variantes.find((v) => (stock.get(v.id) ?? 0) > 0);
        if (variante) {
          reloj.s += 20;
          eventos.push({
            type: 'add_to_cart',
            path: '/api/cart/validate',
            data: { variantId: variante.id, quantity: 1 },
            segundo: reloj.s,
          });
          if (r() < 0.35) {
            reloj.s += 30;
            eventos.push({ type: 'page_view', path: '/checkout', segundo: reloj.s });
            eventos.push({ type: 'begin_checkout', path: '/checkout', segundo: reloj.s });
          }
        }
      }
      visitas.push({ at: momento(d), sessionId: uuid(r), deviceId: uuid(r), eventos });
    }
  }

  // 2. Los compradores, cada uno con su historia.
  const categorias = new Map<string | null, ProductoSim[]>();
  const porCategoria = (c: string | null): ProductoSim[] => {
    if (!categorias.has(c))
      categorias.set(
        c,
        vendibles.items.filter((p) => p.categoria === c),
      );
    return categorias.get(c)!;
  };
  const arquetipos = Object.keys(ARQUETIPOS) as Arquetipo[];
  const pesosDeArquetipo = arquetipos.map((a) => ARQUETIPOS[a].peso);

  for (let n = 0; n < o.compradores; n++) {
    const arquetipo = elegir(r, arquetipos, pesosDeArquetipo);
    const nombre = elegir(
      r,
      NOMBRES,
      NOMBRES.map(() => 1),
    );
    const apellido = elegir(
      r,
      APELLIDOS,
      APELLIDOS.map(() => 1),
    );
    const comprador: Comprador = {
      email: `${sinAcentos(nombre)}.${sinAcentos(apellido)}.${n}@simulacion.invalid`,
      name: `${nombre} ${apellido}`,
      phone: `+5959${String(Math.floor(r() * 1e8)).padStart(8, '0')}`,
      arquetipo,
      deviceId: uuid(r),
    };
    const address = {
      street: `${elegir(
        r,
        CALLES,
        CALLES.map(() => 1),
      )} ${100 + Math.floor(r() * 3000)}`,
      city: elegir(
        r,
        CIUDADES,
        CIUDADES.map(() => 1),
      ),
      ...(o.zonas?.length
        ? {
            zone: elegir(
              r,
              o.zonas,
              o.zonas.map(() => 1),
            ),
          }
        : {}),
    };
    // Lo que le gusta: la mayoría de lo que compra sale de una categoría.
    const gusto = elegir(r, vendibles.items, vendibles.pesos).categoria;

    const { compras, espera } = ARQUETIPOS[arquetipo];
    let d = elegir(r, dias, pesosDeDias);
    for (let k = entre(r, compras); k > 0 && d < o.dias; k--) {
      const lineas: { variantId: string; quantity: number }[] = [];
      const cuantas = arquetipo === 'vip' ? entre(r, [2, 4]) : entre(r, [1, 2]);
      for (let intento = 0; lineas.length < cuantas && intento < 20; intento++) {
        const deSuGusto = porCategoria(gusto);
        const p =
          r() < 0.6 && deSuGusto.length > 0
            ? elegir(
                r,
                deSuGusto,
                deSuGusto.map((_, i) => 1 / (i + 1)),
              )
            : elegir(r, vendibles.items, vendibles.pesos);
        const v = p.variantes.find(
          (x) => (stock.get(x.id) ?? 0) > 0 && !lineas.some((l) => l.variantId === x.id),
        );
        if (!v) continue;
        stock.set(v.id, stock.get(v.id)! - 1);
        lineas.push({ variantId: v.id, quantity: 1 });
      }

      if (lineas.length > 0) {
        const eventos: EventoSim[] = [];
        const reloj = { s: 0 };
        navegar(eventos, reloj, entre(r, [1, 4]));
        for (const l of lineas) {
          reloj.s += 20;
          eventos.push({
            type: 'add_to_cart',
            path: '/api/cart/validate',
            data: { ...l },
            segundo: reloj.s,
          });
        }
        reloj.s += 30;
        eventos.push({ type: 'page_view', path: '/checkout', segundo: reloj.s });
        eventos.push({ type: 'begin_checkout', path: '/checkout', segundo: reloj.s });
        reloj.s += 120;
        // El `orderId` lo pone el script cuando `create_order` responde.
        eventos.push({ type: 'checkout_completed', path: '/api/checkout', segundo: reloj.s });

        visitas.push({
          at: momento(d),
          sessionId: uuid(r),
          // El mismo navegador casi siempre; a veces compra desde otro.
          deviceId: r() < 0.8 ? comprador.deviceId : uuid(r),
          eventos,
          pedido: { comprador, lineas, address },
        });
      }
      d += entre(r, espera);
    }
  }

  return visitas.sort((a, b) => a.at.getTime() - b.at.getTime());
}
