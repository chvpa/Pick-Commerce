import { existsSync } from 'node:fs';
import { clienteDeServidor } from '@pick/adapter-supabase';
import { proveedorOpenAI } from '@pick/adapter-openai';
import {
  MODELO_DE_EMBEDDINGS,
  TEXTOS_POR_PEDIDO,
  costoEstimado,
  descifrar,
  hashDelTexto,
  textoParaEmbeber,
  tokensEstimados,
  vectorATexto,
} from '@pick/commerce-core';

/**
 * Embebe el catálogo de una tienda para la búsqueda semántica (ADR-132).
 *
 *     pnpm embeddings --tienda treeshop [--dry-run] [--limite 500]
 *
 * Corre en Node y no en un Worker por el mismo motivo que el importador del ERP
 * (ADR-085): son miles de productos y varios minutos. Lo que el ROADMAP daba por
 * bloqueado —que un script no tiene camino a la clave del comercio— es falso en
 * la máquina de quien opera: `PICK_AI_MASTER_KEY` está en el `.env`
 * (INFRAESTRUCTURA §6) y `descifrar` se exporta del core.
 *
 * Hace dos trabajos con la misma clave:
 *
 * 1. **Los productos cuyo texto cambió.** El hash del texto embebido decide: una
 *    reimportación que reescribe 3753 filas con los mismos títulos no reembebe
 *    nada, que es la diferencia entre medio centavo y pagarlo cada vez que
 *    alguien corre una tarea de mantenimiento.
 * 2. **Las frases que alguien buscó y todavía no tienen vector**, las más
 *    pedidas primero. Ahí la búsqueda semántica se vuelve gratis: la segunda
 *    persona que escribe esa frase no dispara ninguna llamada.
 *
 * `--dry-run` dice cuántos y cuánto **antes** de gastar, y no escribe nada.
 */

if (existsSync('.env')) process.loadEnvFile('.env');

const args = process.argv.slice(2);
const opcion = (nombre: string): string | undefined => {
  const i = args.indexOf(`--${nombre}`);
  return i === -1 ? undefined : args[i + 1];
};

const slug = opcion('tienda');
const dryRun = args.includes('--dry-run');
const limite = Number(opcion('limite') ?? 0);

if (!slug) {
  console.error('Uso: pnpm embeddings --tienda <slug> [--dry-run] [--limite N]');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const claveMaestra = process.env.PICK_AI_MASTER_KEY;

for (const [nombre, valor] of [
  ['SUPABASE_URL', url],
  ['SUPABASE_SECRET_KEY', secretKey],
  ['PICK_AI_MASTER_KEY', claveMaestra],
] as const) {
  if (!valor) {
    console.error(`Falta ${nombre} en el .env.`);
    process.exit(1);
  }
}

const db = clienteDeServidor({ url: url!, secretKey: secretKey! });

/** Trae una tabla entera paginando: PostgREST corta en 1000 y no avisa (ADR-111). */
async function traer<T>(
  tabla: string,
  columnas: string,
  filtrar: (q: ReturnType<typeof consulta>) => ReturnType<typeof consulta>,
  // La clave por la que ordenar. No siempre es `id`: `product_embeddings` cuelga
  // del producto y no tiene una propia.
  clave = 'id',
): Promise<T[]> {
  const consulta = () => db.from(tabla).select(columnas);
  const salida: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await filtrar(consulta())
      // Sin `order` dos páginas no son disjuntas.
      .order(clave, { ascending: true })
      .range(desde, desde + 999);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    salida.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) return salida;
  }
}

interface ProductoCrudo {
  id: string;
  tenant_id: string;
  store_id: string;
  title: string;
  brand: string | null;
  description: string | null;
  category_id: string | null;
}

interface Pendiente {
  readonly tipo: 'producto' | 'frase';
  readonly id: string;
  readonly texto: string;
  readonly hash: string;
  readonly tenantId: string;
  readonly storeId: string;
}

async function main(): Promise<number> {
  /*
   * `--tienda` es el slug de la **organización**, como en `camelot:importar` y
   * `erp:importar`. No es un descuido de nombre: el slug de una tienda es único
   * por organización, no global —las tres que hay se llaman «principal»—, así
   * que buscar por ahí encontraría cualquiera de ellas.
   */
  const { data: org } = await db.from('organizations').select('id').eq('slug', slug).maybeSingle();
  if (!org) {
    console.error(`No existe la organización «${slug}».`);
    return 1;
  }

  const { data: tienda } = await db
    .from('stores')
    .select('id, tenant_id, name')
    .eq('tenant_id', org.id)
    .order('created_at')
    .limit(1)
    .maybeSingle();

  if (!tienda) {
    console.error(`La organización «${slug}» no tiene ninguna tienda.`);
    return 1;
  }

  console.log(`Tienda: ${tienda.name}`);
  console.log(`Modelo: ${MODELO_DE_EMBEDDINGS}`);

  // --- Qué habría que embeber -----------------------------------------------

  const productos = await traer<ProductoCrudo>(
    'products',
    'id, tenant_id, store_id, title, brand, description, category_id',
    (q) => q.eq('store_id', tienda.id).eq('status', 'active'),
  );

  const categorias = new Map<string, string>();
  const { data: cats, error: errorCats } = await db
    .from('categories')
    .select('id, name')
    .eq('store_id', tienda.id);
  if (errorCats) throw new Error(`categories: ${errorCats.message}`);
  for (const c of cats ?? []) categorias.set(c.id, c.name);

  /*
   * Los atributos, que es de donde sale que «invierno» encuentre una campera.
   *
   * Viven en `product_variants.attributes`, un jsonb por variante, y no en una
   * tabla propia: es la misma fuente que arma las facetas dentro de
   * `catalog_search`. La primera versión de esto consultaba una tabla que no
   * existe y **no fallaba**, porque el error de PostgREST venía en `error` y
   * nadie lo miraba: los atributos simplemente nunca entraban. Por eso ahora
   * cada consulta comprueba su error.
   */
  const atributos = new Map<string, Set<string>>();
  for (const v of await traer<{
    product_id: string;
    attributes: Record<string, string> | null;
  }>('product_variants', 'id, product_id, attributes', (q) =>
    q.eq('tenant_id', tienda.tenant_id),
  )) {
    for (const [clave, valor] of Object.entries(v.attributes ?? {})) {
      if (!valor) continue;
      const juego = atributos.get(v.product_id) ?? new Set<string>();
      juego.add(`${clave}: ${valor}`);
      atributos.set(v.product_id, juego);
    }
  }

  const yaEmbebidos = new Map<string, string>();
  for (const e of await traer<{ product_id: string; hash: string }>(
    'product_embeddings',
    'product_id, hash',
    (q) => q.eq('store_id', tienda.id),
    'product_id',
  )) {
    yaEmbebidos.set(e.product_id, e.hash);
  }

  const pendientes: Pendiente[] = [];

  for (const p of productos) {
    const texto = textoParaEmbeber({
      title: p.title,
      ...(p.brand ? { brand: p.brand } : {}),
      ...(p.category_id && categorias.has(p.category_id)
        ? { categoria: categorias.get(p.category_id)! }
        : {}),
      ...(atributos.has(p.id) ? { atributos: [...atributos.get(p.id)!] } : {}),
      ...(p.description ? { description: p.description } : {}),
    });
    const hash = await hashDelTexto(texto);
    // El corazón del control de costo: si el texto no cambió, no se paga.
    if (yaEmbebidos.get(p.id) === hash) continue;
    pendientes.push({
      tipo: 'producto',
      id: p.id,
      texto,
      hash,
      tenantId: p.tenant_id,
      storeId: p.store_id,
    });
  }

  const { data: frases } = await db
    .from('search_queries')
    .select('hash, termino, tenant_id, store_id')
    .eq('store_id', tienda.id)
    .is('embedded_at', null)
    .order('hits', { ascending: false })
    .limit(500);

  for (const f of frases ?? []) {
    pendientes.push({
      tipo: 'frase',
      id: f.hash,
      texto: f.termino,
      hash: f.hash,
      tenantId: f.tenant_id,
      storeId: f.store_id,
    });
  }

  const tanda = limite > 0 ? pendientes.slice(0, limite) : pendientes;
  const cuantosProductos = tanda.filter((p) => p.tipo === 'producto').length;
  const cuantasFrases = tanda.length - cuantosProductos;
  const tokens = tokensEstimados(tanda.map((p) => p.texto));

  console.log(`\nProductos activos: ${productos.length}`);
  console.log(`  ya embebidos y sin cambios: ${productos.length - cuantosProductos}`);
  console.log(`  para embeber ahora:         ${cuantosProductos}`);
  console.log(`Frases buscadas sin vector:   ${cuantasFrases}`);
  console.log(
    `\nEstimado: ${tokens.toLocaleString('es')} tokens ≈ USD ${costoEstimado(tokens).toFixed(4)}`,
  );
  console.log('(es una estimación: se cobra por los tokens que cuente OpenAI)');

  if (tanda.length === 0) {
    console.log('\nNo hay nada que embeber.');
    return 0;
  }

  if (dryRun) {
    console.log('\nDry run: no se gastó nada y no se escribió nada.');
    return 0;
  }

  // --- La credencial del comercio -------------------------------------------

  const { data: credencial } = await db
    .from('ai_credentials')
    .select('ciphertext')
    .eq('store_id', tienda.id)
    .maybeSingle();

  if (!credencial?.ciphertext) {
    console.error('\nEsta tienda no tiene una credencial de OpenAI configurada.');
    return 1;
  }

  let apiKey: string;
  try {
    apiKey = await descifrar(claveMaestra!, credencial.ciphertext);
  } catch (causa) {
    console.error(`\nNo se pudo descifrar la credencial: ${(causa as Error).message}`);
    console.error('Si se rotó PICK_AI_MASTER_KEY, hay que volver a cargar la clave del comercio.');
    return 1;
  }

  // --- Embeber y guardar ------------------------------------------------------

  const ia = proveedorOpenAI();
  let hechos = 0;
  let tokensCobrados = 0;

  for (let i = 0; i < tanda.length; i += TEXTOS_POR_PEDIDO) {
    const lote = tanda.slice(i, i + TEXTOS_POR_PEDIDO);

    let resultado;
    try {
      resultado = await ia.embeber({ apiKey, textos: lote.map((p) => p.texto) });
    } catch (causa) {
      // Se corta y se dice hasta dónde llegó: lo escrito queda, y volver a
      // correr retoma desde ahí porque el hash ya no coincide sólo con lo que
      // falta. Seguir tras un 429 sería pagar reintentos en cascada.
      console.error(`\nFalló en el lote ${i / TEXTOS_POR_PEDIDO + 1}: ${(causa as Error).message}`);
      console.error(`Embebidos hasta acá: ${hechos}. Volvé a correrlo para seguir.`);
      return 1;
    }

    tokensCobrados += resultado.tokens;

    const productosDelLote = lote
      .map((p, j) => ({ p, vector: resultado.vectores[j]! }))
      .filter(({ p }) => p.tipo === 'producto')
      .map(({ p, vector }) => ({
        product_id: p.id,
        tenant_id: p.tenantId,
        store_id: p.storeId,
        hash: p.hash,
        embedding: vectorATexto(vector),
        updated_at: new Date().toISOString(),
      }));

    if (productosDelLote.length > 0) {
      const { error } = await db
        .from('product_embeddings')
        .upsert(productosDelLote, { onConflict: 'product_id' });
      if (error) throw new Error(`product_embeddings: ${error.message}`);
    }

    for (const { p, vector } of lote
      .map((p, j) => ({ p, vector: resultado.vectores[j]! }))
      .filter(({ p }) => p.tipo === 'frase')) {
      const { error } = await db.rpc('registrar_busqueda', {
        p_store_id: p.storeId,
        p_termino: p.texto,
        p_vector: vectorATexto(vector),
      });
      if (error) throw new Error(`search_queries: ${error.message}`);
    }

    hechos += lote.length;
    console.log(`  ${hechos} de ${tanda.length}`);
  }

  console.log(`\nListo: ${hechos} embebidos.`);
  console.log(
    `Tokens cobrados: ${tokensCobrados.toLocaleString('es')} ≈ USD ${costoEstimado(tokensCobrados).toFixed(4)}`,
  );
  return 0;
}

/*
 * `process.exitCode` y no `process.exit()`: con un cliente de Supabase todavía
 * abierto, salir a la fuerza dispara una aserción de libuv en Windows y tumba el
 * proceso que lo invocó.
 */
process.exitCode = await main();
