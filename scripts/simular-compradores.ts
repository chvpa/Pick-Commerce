import { existsSync } from 'node:fs';
import { clienteDeServidor } from '@pick/adapter-supabase';
import { claveDeDeduplicacion } from '@pick/commerce-core';
import { destinoDelPedido, prng, simular, type ProductoSim, type Visita } from './simulacion.ts';

/**
 * Llena una tienda de demostración con meses de compradores simulados (ADR-133).
 *
 *   pnpm simular:compradores --tienda simulada [--dias 170] [--compradores 600]
 *                            [--visitas 120] [--semilla 1] [--hasta <fecha>]
 *                            [--dry-run] [--limpiar]
 *
 * Qué hace `simulacion.ts` y qué hace esto: aquél decide quién compra qué y
 * cuándo, sin tocar nada; esto lo aplica **por los mismos caminos que el
 * storefront y el Admin**. Los pedidos entran por `create_order`, que calcula
 * precio, envío y descuento y descuenta el stock, y cambian de estado por
 * `admin_set_order_status`, que devuelve el stock de un cancelado. Lo único que
 * se hace por fuera es **correr las fechas hacia atrás** después, que es lo que
 * ningún camino real hace y lo que la historia necesita.
 *
 * Tres barandas, porque escribe pedidos:
 *
 * 1. **Sólo en modo demostración** (ADR-108): el pedido se crea y no le escribe
 *    a nadie. Treeshop no lo tiene ni lo va a tener.
 * 2. **Se niega si hay un solo pedido que no sea simulado**: un correo fuera de
 *    `@simulacion.invalid` es alguien de verdad.
 * 3. **Retomable**: la clave de idempotencia es la sesión simulada, así que
 *    volver a correrlo tras un corte devuelve los pedidos que ya existían, y los
 *    eventos y las frases se reemplazan en vez de sumarse. Con la misma semilla
 *    y el mismo `--dias`; otra semilla es otra tienda, y va después de
 *    `--limpiar`.
 *
 * Los eventos van directo a `store_events` con su fecha, marcados con
 * `data.simulado`. Las búsquedas se registran con `registrar_busqueda`, que es la
 * que arma la llave de la caché, y el número de resultados se mide contra el
 * catálogo real con `catalog_search`: una búsqueda sin resultados lo es de
 * verdad. `search_queries.last_seen` queda en la fecha de la corrida.
 *
 * `--limpiar` borra lo simulado —pedidos, clientes, eventos y frases— y devuelve
 * a la sucursal el stock de lo que se había vendido.
 */

if (existsSync('.env')) process.loadEnvFile('.env');

const args = process.argv.slice(2);
const opcion = (nombre: string): string | undefined => {
  const i = args.indexOf(`--${nombre}`);
  return i === -1 ? undefined : args[i + 1];
};

const DOMINIO = '@simulacion.invalid';
const DIA = 86_400_000;

type Db = ReturnType<typeof clienteDeServidor>;
type Tienda = { id: string; tenant_id: string; name: string };

const slug = opcion('tienda');
if (!slug) {
  console.error(
    'Uso: pnpm simular:compradores --tienda <org> [--dias 170] [--compradores 600] [--dry-run] [--limpiar]',
  );
  process.exitCode = 1;
} else {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    console.error('Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en el .env.');
    process.exitCode = 1;
  } else {
    process.exitCode = await main(clienteDeServidor({ url, secretKey }), slug);
  }
}

/** Corre `trabajo` sobre cada ítem, de a `n` a la vez. */
async function enParalelo<T>(
  items: readonly T[],
  n: number,
  trabajo: (item: T) => Promise<void>,
): Promise<void> {
  let siguiente = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (siguiente < items.length) await trabajo(items[siguiente++]!);
    }),
  );
}

async function traer<T>(
  consulta: (desde: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const salida: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta(desde);
    if (error) throw new Error(error.message);
    salida.push(...((data ?? []) as T[]));
    if (((data ?? []) as T[]).length < 1000) return salida;
  }
}

async function main(db: Db, slugOrg: string): Promise<number> {
  const { data: org } = await db
    .from('organizations')
    .select('id')
    .eq('slug', slugOrg)
    .maybeSingle();
  const { data: tienda } = org
    ? await db
        .from('stores')
        .select('id, tenant_id, name')
        .eq('tenant_id', org.id)
        .eq('slug', 'principal')
        .maybeSingle()
    : { data: null };
  if (!tienda) {
    console.error(`No existe la tienda de «${slugOrg}».`);
    return 1;
  }

  // Baranda 1: modo demostración, comparado contra `true` como `create_order`.
  const { data: ajustes } = await db
    .from('store_settings')
    .select('settings')
    .eq('store_id', tienda.id)
    .maybeSingle();
  const settings = (ajustes?.settings ?? {}) as {
    demo?: unknown;
    shipping?: { mode?: string; zones?: { name: string }[] };
  };
  if (settings.demo !== true) {
    console.error(`«${tienda.name}» no está en modo demostración: acá no se simula.`);
    return 1;
  }

  // Baranda 2: ni un pedido de alguien de verdad.
  const { count: reales } = await db
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', tienda.id)
    .not('customer->>email', 'like', `%${DOMINIO}`);
  if (reales) {
    console.error(
      `«${tienda.name}» tiene ${reales} pedidos que no son simulados: acá no se simula.`,
    );
    return 1;
  }

  if (args.includes('--limpiar')) return limpiar(db, tienda);

  const productos = await catalogo(db, tienda.id, (await stockTomado(db, tienda)).tomado);
  const zonas =
    settings.shipping?.mode === 'zones' ? (settings.shipping.zones ?? []).map((z) => z.name) : [];
  // Retomar una corrida cortada pide su misma fecha: el fin de semana pesa
  // distinto según el día, y con otra fecha la semilla sortea otra tienda.
  const hasta = opcion('hasta') ? new Date(opcion('hasta')!) : new Date();
  if (Number.isNaN(hasta.getTime())) {
    console.error('--hasta no es una fecha: 2026-09-24T00:25:00Z, por ejemplo.');
    return 1;
  }
  const opciones = {
    semilla: Number(opcion('semilla') ?? 1),
    dias: Number(opcion('dias') ?? 170),
    compradores: Number(opcion('compradores') ?? 600),
    visitasPorDia: Number(opcion('visitas') ?? 120),
    hasta,
    productos,
    zonas,
  };
  const visitas = simular(opciones);
  const compras = visitas.filter((v) => v.pedido);
  const compradores = new Set(compras.map((v) => v.pedido!.comprador.email));

  console.log(
    `${tienda.name}: ${productos.length} productos, ${opciones.dias} días, semilla ${opciones.semilla}`,
  );
  console.log(`  visitas:     ${visitas.length}`);
  console.log(`  eventos:     ${visitas.reduce((s, v) => s + v.eventos.length, 0)}`);
  console.log(`  pedidos:     ${compras.length}, de ${compradores.size} compradores`);

  // Baranda 3: lo que ya está creado tiene que ser parte de este plan. Si no, es
  // otra semilla u otra fecha, y seguir sumaría una segunda tienda a la primera.
  const planeadas = new Set(compras.map((v) => v.sessionId));
  const creadas = await traer<{ idempotency_key: string }>((d) =>
    db
      .from('orders')
      .select('id, idempotency_key')
      .eq('store_id', tienda.id)
      .order('id')
      .range(d, d + 999),
  );
  const ajenas = creadas.filter((o) => !planeadas.has(o.idempotency_key)).length;
  console.log(`  ya creados:  ${creadas.length - ajenas} de este plan, ${ajenas} de otro`);
  if (ajenas) {
    console.error('\nHay pedidos de otra corrida: --hasta con su fecha, o --limpiar antes.');
    return 1;
  }
  if (args.includes('--dry-run')) {
    console.log('\n--dry-run: no se escribió nada.');
    return 0;
  }

  // 1. Pedidos, en orden: el número de pedido sigue a la fecha.
  const ids = new Map<string, string>();
  const destinos = new Map<string, ReturnType<typeof destinoDelPedido>>();
  const primera = new Map<string, Date>();
  const r = prng(opciones.semilla + 1);
  let hechos = 0;
  let rechazados = 0;
  for (const v of compras) {
    const p = v.pedido!;
    const { data, error } = await db.rpc('create_order', {
      p_store_id: tienda.id,
      p_idempotency_key: v.sessionId,
      p_input: {
        customer: { email: p.comprador.email, name: p.comprador.name, phone: p.comprador.phone },
        address: p.address,
        paymentMethod: 'bank_transfer',
        lines: p.lineas.map((l) => ({ ...l })),
      },
    });
    if (error) throw new Error(`create_order: ${error.message}`);
    const pedido = (data as { order?: { id: string } }).order;
    if (!pedido) {
      rechazados++;
      continue;
    }
    ids.set(v.sessionId, pedido.id);
    // Se sortea acá, en orden, y no en los trabajos en paralelo de abajo: ahí el
    // orden de llegada cambiaría entre corridas y la semilla dejaría de fijarlo.
    destinos.set(v.sessionId, destinoDelPedido((hasta.getTime() - v.at.getTime()) / DIA, r));
    if (!primera.has(p.comprador.email)) primera.set(p.comprador.email, v.at);
    if (++hechos % 100 === 0) console.log(`  pedidos: ${hechos}/${compras.length}`);
  }
  console.log(`  pedidos: ${hechos} creados, ${rechazados} rechazados por create_order`);

  // 2. Su estado y sus fechas. El estado primero: cambiarlo escribe un evento
  //    con fecha de hoy, que después se corre junto con los demás.
  await enParalelo(compras, 6, async (v) => {
    const id = ids.get(v.sessionId);
    if (!id) return;
    const edad = (hasta.getTime() - v.at.getTime()) / DIA;
    const { status, pagado } = destinos.get(v.sessionId)!;
    if (pagado) {
      const { error } = await db.rpc('admin_set_payment_status', {
        p_store_id: tienda.id,
        p_order_id: id,
        p_status: 'paid',
      });
      if (error) throw new Error(`admin_set_payment_status: ${error.message}`);
    }
    if (status !== 'received') {
      const { error } = await db.rpc('admin_set_order_status', {
        p_store_id: tienda.id,
        p_order_id: id,
        p_status: status,
      });
      if (error) throw new Error(`admin_set_order_status: ${error.message}`);
    }
    const creado = v.at.toISOString();
    const cerrado = new Date(
      Math.min(v.at.getTime() + Math.min(edad, 6) * DIA, hasta.getTime()),
    ).toISOString();
    await db.from('orders').update({ created_at: creado, updated_at: cerrado }).eq('id', id);
    await db
      .from('order_events')
      .update({ created_at: creado })
      .eq('order_id', id)
      .eq('type', 'created');
    await db
      .from('order_events')
      .update({ created_at: cerrado })
      .eq('order_id', id)
      .neq('type', 'created');
  });

  // El cliente nace con su primer pedido.
  await enParalelo([...primera], 6, async ([email, at]) => {
    await db
      .from('customers')
      .update({ created_at: at.toISOString() })
      .eq('store_id', tienda.id)
      .eq('email', email);
  });
  console.log(`  fechas corridas: ${ids.size} pedidos, ${primera.size} clientes`);

  // 3. Cuántos resultados da cada frase, contra el catálogo de verdad.
  const terminos = new Set<string>();
  for (const v of visitas)
    for (const e of v.eventos) if (e.type === 'search') terminos.add(e.data!.term as string);
  const resultados = new Map<string, number>();
  // De a una y con reintentos: cada búsqueda tarda 1 a 2,7 s sobre este
  // catálogo —el costo de `catalog_search` que está en el backlog, el mismo en
  // Treeshop— y de a tres ya se pisaban hasta pasar el statement timeout.
  for (const t of terminos) {
    for (let intento = 1; ; intento++) {
      const { data, error } = await db.rpc('catalog_search', {
        p_store_id: tienda.id,
        p_search: t,
        p_per_page: 1,
      });
      if (!error) {
        resultados.set(t, (data as { total: number }).total);
        break;
      }
      if (intento === 3) throw new Error(`catalog_search «${t}»: ${error.message}`);
      await new Promise((listo) => setTimeout(listo, 3000));
    }
    if (resultados.size % 200 === 0) console.log(`  frases: ${resultados.size}/${terminos.size}`);
  }
  const vacias = [...resultados.values()].filter((n) => n === 0).length;
  console.log(`  frases: ${terminos.size} distintas, ${vacias} sin resultados`);

  // 4. Los eventos, con su fecha. Una corrida anterior cortada ya dejó los
  //    suyos: se reemplazan, porque una vista no tiene clave que la deduplique.
  await db.from('store_events').delete().eq('store_id', tienda.id).eq('data->>simulado', 'true');
  await db.from('search_queries').delete().eq('store_id', tienda.id);
  const filas = visitas.flatMap((v) => eventosDe(v, tienda, ids, resultados));
  for (let i = 0; i < filas.length; i += 1000) {
    const { error } = await db.from('store_events').insert(filas.slice(i, i + 1000) as never);
    if (error && error.code !== '23505') throw new Error(`store_events: ${error.message}`);
  }
  console.log(`  eventos: ${filas.length}`);

  // 5. La caché de búsquedas, por la función que arma su llave.
  const busquedas = filas.filter((f) => f.type === 'search').map((f) => f.data.term as string);
  await enParalelo(busquedas, 6, async (t) => {
    const { error } = await db.rpc('registrar_busqueda', { p_store_id: tienda.id, p_termino: t });
    if (error) throw new Error(`registrar_busqueda: ${error.message}`);
  });
  console.log(`  búsquedas registradas: ${busquedas.length}`);

  console.log(`\nListo. Para rehacerla: --limpiar y la misma semilla.`);
  return 0;
}

function eventosDe(
  v: Visita,
  tienda: Tienda,
  ids: Map<string, string>,
  resultados: Map<string, number>,
) {
  const orderId = ids.get(v.sessionId);
  return v.eventos.flatMap((e) => {
    // Un pedido que create_order rechazó no terminó el checkout.
    if (e.type === 'checkout_completed' && !orderId) return [];
    const extra =
      e.type === 'checkout_completed'
        ? { orderId }
        : e.type === 'search'
          ? { results: resultados.get(e.data!.term as string) ?? 0 }
          : {};
    const data = { ...e.data, ...extra };
    const fila = (type: string, datos: Record<string, unknown>) => ({
      tenant_id: tienda.tenant_id,
      store_id: tienda.id,
      session_id: v.sessionId,
      device_id: v.deviceId,
      type,
      path: e.path,
      data: { ...datos, simulado: true },
      dedupe_key: claveDeDeduplicacion(type as never, v.sessionId, datos) ?? null,
      occurred_at: new Date(v.at.getTime() + e.segundo * 1000).toISOString(),
    });
    const salida = [fila(e.type, data)];
    if (e.type === 'search' && data.results === 0)
      salida.push(fila('search_no_results', { term: data.term }));
    return salida;
  });
}

/** Lo vendible de la tienda, con su stock y el nombre de su categoría. */
async function catalogo(
  db: Db,
  storeId: string,
  tomado: ReadonlyMap<string, { variant: string; cantidad: number }>,
): Promise<ProductoSim[]> {
  const categorias = new Map(
    (
      await traer<{ id: string; name: string }>((d) =>
        db
          .from('categories')
          .select('id, name')
          .eq('store_id', storeId)
          .order('id')
          .range(d, d + 999),
      )
    ).map((c) => [c.id, c.name]),
  );
  const productos = await traer<{
    id: string;
    handle: string;
    title: string;
    brand: string | null;
    category_id: string | null;
  }>((d) =>
    db
      .from('products')
      .select('id, handle, title, brand, category_id')
      .eq('store_id', storeId)
      .eq('status', 'active')
      .order('id')
      .range(d, d + 999),
  );
  const { data: t } = await db.from('stores').select('tenant_id').eq('id', storeId).single();
  const variantes = await traer<{ id: string; product_id: string; price: number }>((d) =>
    db
      .from('product_variants')
      .select('id, product_id, price')
      .eq('tenant_id', t!.tenant_id)
      .order('id')
      .range(d, d + 999),
  );
  const niveles = await traer<{ variant_id: string; available: number }>((d) =>
    db
      .from('inventory_levels')
      .select('id, variant_id, available')
      .eq('tenant_id', t!.tenant_id)
      .order('id')
      .range(d, d + 999),
  );
  const stock = new Map<string, number>();
  for (const n of niveles) stock.set(n.variant_id, (stock.get(n.variant_id) ?? 0) + n.available);
  // Una corrida retomada parte del stock que había antes de la primera: si no,
  // la semilla sortearía otros pedidos que los ya creados.
  for (const t of tomado.values()) stock.set(t.variant, (stock.get(t.variant) ?? 0) + t.cantidad);

  const porProducto = new Map<string, { id: string; available: number }[]>();
  for (const v of variantes) {
    // Sin precio no se vende: `create_order` lo cobraría a cero.
    const available = v.price > 0 ? (stock.get(v.id) ?? 0) : 0;
    porProducto.set(v.product_id, [
      ...(porProducto.get(v.product_id) ?? []),
      { id: v.id, available },
    ]);
  }
  return productos.map((p) => ({
    id: p.id,
    handle: p.handle,
    title: p.title,
    brand: p.brand,
    categoria: p.category_id ? (categorias.get(p.category_id) ?? null) : null,
    variantes: porProducto.get(p.id) ?? [],
  }));
}

/** Borra lo simulado y devuelve a la sucursal lo que se había vendido. */
/**
 * Lo que tienen tomado los pedidos simulados no cancelados, por variante y
 * sucursal. Los cancelados ya lo devolvieron al cancelarse.
 */
async function stockTomado(
  db: Db,
  tienda: Tienda,
): Promise<{
  pedidos: { id: string; status: string }[];
  tomado: Map<string, { variant: string; location: string; cantidad: number }>;
}> {
  const pedidos = await traer<{ id: string; status: string }>((d) =>
    db
      .from('orders')
      .select('id, status')
      .eq('store_id', tienda.id)
      .like('customer->>email', `%${DOMINIO}`)
      .order('id')
      .range(d, d + 999),
  );
  const vigentes = new Set(pedidos.filter((p) => p.status !== 'cancelled').map((p) => p.id));

  const tomado = new Map<string, { variant: string; location: string; cantidad: number }>();
  const lista = [...vigentes];
  for (let i = 0; i < lista.length; i += 200) {
    const { data, error } = await db
      .from('order_items')
      .select('variant_id, stock_allocation')
      .in('order_id', lista.slice(i, i + 200));
    if (error) throw new Error(`order_items: ${error.message}`);
    for (const item of data ?? []) {
      for (const parte of (item.stock_allocation ?? []) as {
        locationId: string;
        quantity: number;
      }[]) {
        const clave = `${item.variant_id}:${parte.locationId}`;
        const previo = tomado.get(clave);
        tomado.set(clave, {
          variant: item.variant_id!,
          location: parte.locationId,
          cantidad: (previo?.cantidad ?? 0) + parte.quantity,
        });
      }
    }
  }
  return { pedidos, tomado };
}

async function limpiar(db: Db, tienda: Tienda): Promise<number> {
  const { pedidos, tomado: devolver } = await stockTomado(db, tienda);
  await enParalelo([...devolver.values()], 6, async ({ variant, location, cantidad }) => {
    const { data } = await db
      .from('inventory_levels')
      .select('available')
      .eq('variant_id', variant)
      .eq('location_id', location)
      .single();
    if (data)
      await db
        .from('inventory_levels')
        .update({ available: data.available + cantidad })
        .eq('variant_id', variant)
        .eq('location_id', location);
  });

  for (let i = 0; i < pedidos.length; i += 200) {
    await db
      .from('orders')
      .delete()
      .in(
        'id',
        pedidos.slice(i, i + 200).map((p) => p.id),
      );
  }
  await db.from('customers').delete().eq('store_id', tienda.id).like('email', `%${DOMINIO}`);
  const { count: eventos } = await db
    .from('store_events')
    .delete({ count: 'exact' })
    .eq('store_id', tienda.id)
    .eq('data->>simulado', 'true');
  const { count: frases } = await db
    .from('search_queries')
    .delete({ count: 'exact' })
    .eq('store_id', tienda.id);

  console.log(
    `${tienda.name}: ${pedidos.length} pedidos, ${eventos ?? 0} eventos y ${frases ?? 0} frases borrados`,
  );
  console.log(`  stock devuelto a ${devolver.size} variantes`);
  return 0;
}
