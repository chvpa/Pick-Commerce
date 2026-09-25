import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { clienteDeServidor } from '@pick/adapter-supabase';

/**
 * Copia el catálogo de una tienda a otra, para simular sobre algo creíble (ADR-133).
 *
 *   pnpm simular:catalogo --desde treeshop --hacia simulada
 *
 * Seis productos no dan cohortes ni búsquedas que signifiquen algo, y el único
 * catálogo real —Treeshop— es de un comercio que va a operar: la simulación no
 * puede vivir ahí. Esto copia filas, no archivos: las fotos apuntan a las mismas
 * URLs del bucket y no se sube nada.
 *
 * Además deja la tienda de destino **en modo demostración** (ADR-108), que es la
 * condición que `simular:compradores` exige antes de escribir un pedido, y le
 * copia el envío para que los importes salgan como saldrían en la de origen.
 *
 * No copia los vectores de la búsqueda semántica: `pnpm embeddings --tienda
 * <destino>` los hace, por centavos. Ni las colecciones ni la portada, que no
 * entran en lo que se simula.
 *
 * Se niega si el destino ya tiene productos: para volver a copiar se borra la
 * organización, que se lleva todo en cascada.
 */

if (existsSync('.env')) process.loadEnvFile('.env');

const args = process.argv.slice(2);
const opcion = (nombre: string): string | undefined => {
  const i = args.indexOf(`--${nombre}`);
  return i === -1 ? undefined : args[i + 1];
};

const origen = opcion('desde');
const destino = opcion('hacia');
if (!origen || !destino || origen === destino) {
  console.error('Uso: pnpm simular:catalogo --desde <org> --hacia <org>');
  process.exitCode = 1;
} else {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    console.error('Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en el .env.');
    process.exitCode = 1;
  } else {
    process.exitCode = await copiar(clienteDeServidor({ url, secretKey }), origen, destino);
  }
}

type Db = ReturnType<typeof clienteDeServidor>;
type Fila = Record<string, unknown>;

/** Trae una tabla entera paginando: PostgREST corta en 1000 y no avisa (ADR-111). */
async function traer(db: Db, tabla: string, columna: string, valor: string): Promise<Fila[]> {
  const salida: Fila[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await db
      .from(tabla as never)
      .select('*')
      .eq(columna, valor)
      // Sin `order` dos páginas no son disjuntas.
      .order('id', { ascending: true })
      .range(desde, desde + 999);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    salida.push(...((data ?? []) as Fila[]));
    if ((data ?? []).length < 1000) return salida;
  }
}

async function insertar(db: Db, tabla: string, filas: Fila[]): Promise<void> {
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await db.from(tabla as never).insert(filas.slice(i, i + 500) as never);
    if (error) throw new Error(`${tabla}: ${error.message}`);
  }
  console.log(`  ${tabla}: ${filas.length}`);
}

async function tiendaDe(db: Db, slug: string) {
  const { data: org } = await db.from('organizations').select('id').eq('slug', slug).maybeSingle();
  if (!org) return null;
  const { data } = await db
    .from('stores')
    .select('id, tenant_id, name, currency, locale')
    .eq('tenant_id', org.id)
    .eq('slug', 'principal')
    .maybeSingle();
  return data;
}

async function copiar(db: Db, slugOrigen: string, slugDestino: string): Promise<number> {
  const de = await tiendaDe(db, slugOrigen);
  const a = await tiendaDe(db, slugDestino);
  if (!de || !a) {
    console.error(`No existe la tienda de «${!de ? slugOrigen : slugDestino}».`);
    if (!a) console.error(`Crearla: pnpm tienda:crear ${slugDestino} '<nombre>'`);
    return 1;
  }

  const { count } = await db
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', a.id);
  if (count) {
    console.error(
      `«${a.name}» ya tiene ${count} productos. Para volver a copiar, borrar la organización.`,
    );
    return 1;
  }

  const { data: sucursal } = await db
    .from('locations')
    .select('id')
    .eq('store_id', a.id)
    .limit(1)
    .maybeSingle();
  if (!sucursal) {
    console.error(`«${a.name}» no tiene sucursal: se crea con pnpm tienda:crear.`);
    return 1;
  }

  console.log(`${de.name} → ${a.name}`);
  const base = { tenant_id: a.tenant_id };
  const nuevo = new Map<string, string>();
  const remapear = (id: unknown): string | null =>
    typeof id === 'string' ? (nuevo.get(id) ?? null) : null;
  const id = (viejo: unknown): string => {
    const n = randomUUID();
    nuevo.set(viejo as string, n);
    return n;
  };

  // Categorías: primero los padres, para que la clave foránea exista al insertar.
  const categorias = await traer(db, 'categories', 'store_id', de.id);
  const pendientes = [...categorias];
  const ordenadas: Fila[] = [];
  while (pendientes.length) {
    const listas = pendientes.filter(
      (c) => !c.parent_id || ordenadas.some((o) => o.id === c.parent_id),
    );
    if (listas.length === 0) throw new Error('categories: hay un ciclo de padres');
    for (const c of listas) {
      ordenadas.push(c);
      pendientes.splice(pendientes.indexOf(c), 1);
    }
  }
  const filasDeCategoria = ordenadas.map((c) => ({
    ...base,
    store_id: a.id,
    id: id(c.id),
    parent_id: remapear(c.parent_id),
    name: c.name,
    slug: c.slug,
    position: c.position,
    image: c.image,
  }));
  await insertar(db, 'categories', filasDeCategoria);

  const atributos = await traer(db, 'attribute_definitions', 'store_id', de.id);
  await insertar(
    db,
    'attribute_definitions',
    atributos.map(({ id: _id, created_at: _c, updated_at: _u, ...resto }) => ({
      ...resto,
      ...base,
      store_id: a.id,
      category_id: remapear(resto.category_id),
    })),
  );

  const grupos = await traer(db, 'product_groups', 'store_id', de.id);
  await insertar(
    db,
    'product_groups',
    grupos.map((g) => ({ ...base, store_id: a.id, id: id(g.id), name: g.name })),
  );

  const productos = await traer(db, 'products', 'store_id', de.id);
  await insertar(
    db,
    'products',
    productos.map(({ id: viejo, created_at: _c, updated_at: _u, search_doc: _s, ...resto }) => ({
      ...resto,
      ...base,
      store_id: a.id,
      id: id(viejo),
      category_id: remapear(resto.category_id),
      product_group_id: remapear(resto.product_group_id),
    })),
  );

  // Las variantes y los medios cuelgan del producto, no de la tienda: se traen
  // por organización y se quedan las de los productos copiados.
  const variantes = (await traer(db, 'product_variants', 'tenant_id', de.tenant_id)).filter((v) =>
    nuevo.has(v.product_id as string),
  );
  await insertar(
    db,
    'product_variants',
    variantes.map(({ id: viejo, created_at: _c, updated_at: _u, ...resto }) => ({
      ...resto,
      ...base,
      id: id(viejo),
      product_id: remapear(resto.product_id),
    })),
  );

  const medios = (await traer(db, 'product_media', 'tenant_id', de.tenant_id)).filter((m) =>
    nuevo.has(m.product_id as string),
  );
  await insertar(
    db,
    'product_media',
    medios.map(({ id: _id, created_at: _c, ...resto }) => ({
      ...resto,
      ...base,
      product_id: remapear(resto.product_id),
    })),
  );

  // El stock de todas las sucursales de origen, sumado en la única de destino.
  const stock = new Map<string, number>();
  for (const n of await traer(db, 'inventory_levels', 'tenant_id', de.tenant_id)) {
    const variante = remapear(n.variant_id);
    if (variante) stock.set(variante, (stock.get(variante) ?? 0) + (n.available as number));
  }
  await insertar(
    db,
    'inventory_levels',
    [...stock].map(([variant_id, available]) => ({
      ...base,
      variant_id,
      location_id: sucursal.id,
      available,
    })),
  );

  // Modo demostración, y el envío y la moneda de la tienda de origen.
  const { data: ajustesDe } = await db
    .from('store_settings')
    .select('settings')
    .eq('store_id', de.id)
    .maybeSingle();
  const { data: ajustesA } = await db
    .from('store_settings')
    .select('settings')
    .eq('store_id', a.id)
    .maybeSingle();
  const origenAjustes = (ajustesDe?.settings ?? {}) as Fila;
  const { error } = await db.from('store_settings').upsert(
    {
      store_id: a.id,
      tenant_id: a.tenant_id,
      settings: {
        ...((ajustesA?.settings ?? {}) as Fila),
        ...(origenAjustes.currency ? { currency: origenAjustes.currency } : {}),
        ...(origenAjustes.shipping ? { shipping: origenAjustes.shipping } : {}),
        demo: true,
      } as never,
    },
    { onConflict: 'store_id' },
  );
  if (error) throw new Error(`store_settings: ${error.message}`);
  await db.from('stores').update({ currency: de.currency, locale: de.locale }).eq('id', a.id);

  console.log(`\nListo. «${a.name}» quedó en modo demostración.`);
  console.log(`Siguiente: pnpm simular:compradores --tienda ${slugDestino} --dry-run`);
  return 0;
}
