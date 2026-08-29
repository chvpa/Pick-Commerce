import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { clienteDeServidor } from '@pick/adapter-supabase';
import { agruparEnProductos, discrimina, type ERPItem, type ERPProduct } from '@pick/commerce-core';
import { normalizarRespuesta, proveedorEstiloSport } from '@pick/adapter-erp-estilosport';

/**
 * Trae el catálogo de un ERP al catálogo de Pick.
 *
 *   pnpm erp:importar --tienda estilosport --limite 100 --dry-run
 *   pnpm erp:importar --tienda estilosport --limite 100
 *
 * Corre en Node y no en el Worker, y no es una comodidad: el proxy del ERP está
 * publicado en una IP cruda con un puerto no estándar, y el `fetch()` de un
 * Worker de Cloudflare descarta el puerto en producción además de bloquear las
 * IPs crudas. En local con Miniflare funcionaría, así que el fallo aparecería
 * recién al desplegar. Ver ADR-085.
 *
 * **Acotado a propósito.** Trae los primeros N productos del ERP, no el catálogo
 * entero, y **no** pone en cero lo que el ERP no mencionó. Esa regla existe en un
 * sync completo, donde el silencio del ERP significa «ya no lo vendo»; acá, con
 * un recorte, significaría poner en cero todo lo demás de la tienda.
 *
 * **Los tres códigos, cada uno en su nivel.** El producto se cruza por su código
 * de modelo (SKU); la variante, dentro de ese producto, por el código de barras
 * si de hecho distingue las tallas, si no por el del ERP, y al final por la
 * talla. Ni el del ERP ni el de la caja se pueden dar por únicos: hay ERPs que
 * los repiten en todo el modelo.
 *
 * Idempotente: correrlo dos veces actualiza en su lugar y no crea nada.
 */

if (existsSync('.env')) process.loadEnvFile('.env');

// ---------------------------------------------------------------------------
// Argumentos y entorno
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
function opcion(nombre: string): string | undefined {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] : undefined;
}

const slugTienda = opcion('tienda');
const limite = Number(opcion('limite') ?? 100);
const dryRun = args.includes('--dry-run');

if (!slugTienda || !Number.isFinite(limite) || limite < 1) {
  console.error(
    'Uso: pnpm erp:importar --tienda <slug> [--limite 100] [--dry-run] [--desde captura.json]',
  );
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const proxyUrl = process.env.LINODE_PROXY_URL;
const proxySecret = process.env.LINODE_PROXY_SECRET;

if (!url || !secretKey) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY.');
  process.exit(1);
}
if (!proxyUrl || !proxySecret) {
  console.error('Faltan LINODE_PROXY_URL y LINODE_PROXY_SECRET.');
  process.exit(1);
}

const db = clienteDeServidor({ url, secretKey });
const erp = proveedorEstiloSport({ url: proxyUrl, secret: proxySecret });

function slug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** PostgREST manda los filtros en la URL: un `in` de 300 valores no entra. */
async function enLotes<T, R>(
  valores: readonly T[],
  tamano: number,
  fn: (lote: readonly T[]) => Promise<R[]>,
): Promise<R[]> {
  const salida: R[] = [];
  for (let i = 0; i < valores.length; i += tamano) {
    salida.push(...(await fn(valores.slice(i, i + tamano))));
  }
  return salida;
}

/**
 * Todo lo que toca la base va acá adentro y el resultado sale por el código de
 * salida.
 *
 * No es estilo: `process.exit()` con el cliente de Supabase todavía abierto
 * dispara una aserción de libuv en Windows —la misma que en Fase 6 hizo que el
 * teardown del e2e devolviera error con todos los tests en verde— y el proceso
 * muere con un código que no significa nada. Terminando por retorno, Node cierra
 * lo que quede y el código de salida es el que se pidió.
 */
async function main(): Promise<number> {
  // ---------------------------------------------------------------------------
  // La tienda
  // ---------------------------------------------------------------------------

  const { data: org } = await db
    .from('organizations')
    .select('id')
    .eq('slug', slugTienda)
    .maybeSingle();

  if (!org) {
    console.error(`No existe la organización «${slugTienda}».`);
    console.error(`Crearla con: pnpm tienda:crear ${slugTienda} "<nombre>"`);
    return 1;
  }

  const { data: tienda } = await db
    .from('stores')
    .select('id, name')
    .eq('tenant_id', org.id)
    .order('created_at')
    .limit(1)
    .maybeSingle();

  if (!tienda) {
    console.error('La organización no tiene tienda. Correr `pnpm tienda:crear` primero.');
    return 1;
  }

  const { data: sucursal } = await db
    .from('locations')
    .select('id')
    .eq('store_id', tienda.id)
    .order('created_at')
    .limit(1)
    .maybeSingle();

  if (!sucursal) {
    console.error('La tienda no tiene sucursal, y sin sucursal el stock no se puede guardar.');
    return 1;
  }

  const TENANT = org.id;
  const STORE = tienda.id;
  const LOCATION = sucursal.id;

  // ---------------------------------------------------------------------------
  // El ERP
  // ---------------------------------------------------------------------------

  const comenzo = new Date().toISOString();
  console.log(`Tienda      ${tienda.name} (${slugTienda})`);
  console.log(`Adapter     ${erp.id}`);
  console.log(`Modo        ${dryRun ? 'DRY RUN — no escribe nada' : 'REAL'}`);

  if (!args.includes('--desde') && !(await erp.healthCheck())) {
    console.error('\nEl proxy del ERP no responde. Sin datos no se importa nada.');
    return 1;
  }

  /*
   * `--desde` reprocesa una captura del ERP en vez de volver a pedírsela.
   *
   * Existe por un incidente propio: reescribiendo el mapeo de códigos borré el
   * catálogo para reimportarlo y el ORDS se cayó justo entonces, así que la
   * tienda quedó vacía sin forma de restituirla. También sirve para lo de todos
   * los días —iterar sobre el mapeo sin golpear un ERP de producción por cada
   * prueba— pero **no es para operar**: los datos son de cuando se capturó.
   */
  const desde = opcion('desde');

  if (desde) {
    console.log(`\nReprocesando la captura ${desde} (los datos son de cuando se tomó)…`);
  } else {
    console.log('\nTrayendo el catálogo del ERP…');
  }

  const agregado = desde
    ? normalizarRespuesta(readFileSync(desde, 'utf8'))
    : await erp.fetchInventory();

  const items = agregado.items;
  // Lo que el ERP trae dos veces para la misma variante. Se reporta, no se suma.
  const duplicadosDelERP = agregado.duplicados;
  const todos = agruparEnProductos(items);
  const productos = todos.slice(0, limite);
  const itemsImportados = productos.flatMap((p) => p.items);

  console.log(`  ${items.length} variantes en ${todos.length} productos`);
  if (duplicadosDelERP.length > 0) {
    console.log(
      `  ${duplicadosDelERP.length} filas duplicadas en el ERP: misma variante, códigos distintos`,
    );
  }
  console.log(
    `  se importan los primeros ${productos.length}, con ${itemsImportados.length} variantes`,
  );

  // ---------------------------------------------------------------------------
  // Cruce contra el catálogo local
  // ---------------------------------------------------------------------------

  interface ProductoLocal {
    id: string;
    handle: string;
    sku: string | null;
  }
  interface VarianteLocal {
    id: string;
    product_id: string;
    barcode: string | null;
    internal_code: string | null;
    erp_size: string | null;
    price: number;
  }

  /*
   * El producto se busca por su código de **modelo**, que es lo único estable a
   * ese nivel. Antes se buscaba por el código del ERP, que según el ERP puede
   * ser propio de cada variante — y entonces cada talla habría sido un producto.
   */
  const productosLocales = await enLotes(
    productos.map((p) => p.sku),
    100,
    async (lote) => {
      const { data, error } = await db
        .from('products')
        .select('id, handle, sku')
        .eq('store_id', STORE)
        .in('sku', lote as string[]);
      if (error) throw new Error(`No se pudo leer el catálogo: ${error.message}`);
      return (data ?? []) as ProductoLocal[];
    },
  );

  const porModelo = new Map(productosLocales.map((p) => [p.sku ?? '', p]));

  /*
   * Las variantes se traen **por producto**, no por código de barras suelto.
   *
   * La versión anterior buscaba el código de barras en todo el tenant y daba por
   * hecho que identificaba una variante. No es así: hay modelos con un solo
   * código impreso para todas las tallas, y con esa consulta el stock de la 40
   * habría ido a parar a la variante de la 43.
   */
  const idsLocales = productosLocales.map((p) => p.id);
  const variantesLocales = await enLotes(idsLocales, 50, async (lote) => {
    const { data, error } = await db
      .from('product_variants')
      .select('id, product_id, barcode, internal_code, erp_size, price')
      .in('product_id', lote as string[]);
    if (error) throw new Error(`No se pudieron leer las variantes: ${error.message}`);
    return (data ?? []) as VarianteLocal[];
  });

  const variantesDe = new Map<string, VarianteLocal[]>();
  for (const v of variantesLocales) {
    const grupo = variantesDe.get(v.product_id) ?? [];
    grupo.push(v);
    variantesDe.set(v.product_id, grupo);
  }

  // ---------------------------------------------------------------------------
  // Categorías: las familias del ERP
  // ---------------------------------------------------------------------------
  //
  // `familia` es la única pista de categoría que sirve: `rubro` y `linea` valen
  // 'GENERICO' en las 9032 filas del catálogo.
  //
  // Las existentes se reusan por slug en vez de hacer upsert. `categories` es
  // única por (store_id, slug), y un upsert con un id nuevo intentaría cambiarle
  // la clave primaria a una categoría que los productos ya referencian.

  const familias = [...new Set(productos.map((p) => p.family).filter(Boolean))] as string[];

  const categoriasLocales = await enLotes(familias.map(slug), 100, async (lote) => {
    const { data, error } = await db
      .from('categories')
      .select('id, slug')
      .eq('store_id', STORE)
      .in('slug', lote as string[]);
    if (error) throw new Error(`No se pudieron leer las categorías: ${error.message}`);
    return (data ?? []) as { id: string; slug: string }[];
  });

  const idPorSlug = new Map(categoriasLocales.map((c) => [c.slug, c.id]));
  const idDeFamilia = new Map<string, string>();
  const categoriasNuevas: Record<string, unknown>[] = [];

  for (const [i, familia] of familias.entries()) {
    const s = slug(familia);
    const existente = idPorSlug.get(s);
    const id = existente ?? randomUUID();
    idDeFamilia.set(familia, id);
    if (!existente) {
      categoriasNuevas.push({
        id,
        tenant_id: TENANT,
        store_id: STORE,
        name: familia,
        slug: s,
        position: i,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Qué se va a escribir
  // ---------------------------------------------------------------------------

  const filasProductos: Record<string, unknown>[] = [];
  const filasVariantes: Record<string, unknown>[] = [];
  const filasInventario: Record<string, unknown>[] = [];
  const problemas: { codigo: string; motivo: string }[] = [];

  let productosNuevos = 0;
  let productosExistentes = 0;
  // Los contadores de la corrida son de **variantes**, que es la unidad que el
  // ERP entrega y sobre la que se reconcilia.
  let variantesCreadas = 0;
  let variantesActualizadas = 0;
  let variantesSinCambio = 0;
  let cruzadasPorBarcode = 0;
  let cruzadasPorCodigoErp = 0;
  let cruzadasPorTalla = 0;

  /**
   * El handle lleva el código de modelo: dos modelos pueden llamarse igual.
   *
   * El `slug` se aplica al conjunto, no sólo al título. Los códigos de modelo
   * vienen en mayúsculas —`EVWG7K9P01`— y pegarlos crudos dejaba una URL
   * sensible a mayúsculas: `…-dv9315010` daría 404 mientras `…-DV9315010`
   * funciona. Pasó en 68 de los primeros 100 productos.
   */
  function handleDe(p: ERPProduct): string {
    return slug(`${p.title} ${p.sku}`).slice(0, 120);
  }

  /**
   * A qué variante local corresponde una del ERP, dentro de su producto.
   *
   * El orden de preferencia lo decide el **catálogo, no una suposición**: se usa
   * el código de barras si de hecho distingue las variantes de ese modelo, si no
   * el del ERP, y al final la talla, que es lo que define la variante. Dar por
   * único un código que el ERP repite en todo el modelo mandaría el stock de una
   * talla a la variante de otra, y eso no se ve hasta que falta mercadería.
   */
  function cruzar(item: ERPItem, hermanas: readonly ERPItem[], locales: VarianteLocal[]) {
    const buscar = (
      campo: 'barcode' | 'internal_code' | 'erp_size',
      valor: string,
    ): VarianteLocal | undefined => (valor ? locales.find((v) => v[campo] === valor) : undefined);

    if (discrimina(hermanas, 'barcode')) {
      const v = buscar('barcode', item.barcode);
      if (v) {
        cruzadasPorBarcode++;
        return v;
      }
    }
    if (discrimina(hermanas, 'internalCode')) {
      const v = buscar('internal_code', item.internalCode);
      if (v) {
        cruzadasPorCodigoErp++;
        return v;
      }
    }
    const v = buscar('erp_size', item.erpSize);
    if (v) {
      cruzadasPorTalla++;
      return v;
    }
    return undefined;
  }

  for (const producto of productos) {
    const local = porModelo.get(producto.sku);
    const productId = local?.id ?? randomUUID();
    if (local) productosExistentes++;
    else productosNuevos++;

    filasProductos.push({
      id: productId,
      tenant_id: TENANT,
      store_id: STORE,
      // El handle de un producto ya publicado no se toca: cambiarlo rompería su
      // URL y todo enlace que apunte a ella.
      handle: local?.handle ?? handleDe(producto),
      title: producto.title,
      brand: producto.brand ?? null,
      category_id: producto.family ? (idDeFamilia.get(producto.family) ?? null) : null,
      status: 'active',
      sku: producto.sku,
      // Declarar el dueño es lo que bloquea la edición local (PROJECT.md §10).
      field_sources: { price: 'ERP', stock: 'ERP' },
    });

    const localesDelProducto = variantesDe.get(productId) ?? [];

    for (const [i, item] of producto.items.entries()) {
      const encontrada = cruzar(item, producto.items, localesDelProducto);
      const variantId = encontrada?.id ?? randomUUID();

      if (encontrada) {
        if (encontrada.price === item.price.amount) variantesSinCambio++;
        else variantesActualizadas++;
      } else {
        variantesCreadas++;
      }

      filasVariantes.push({
        id: variantId,
        tenant_id: TENANT,
        product_id: productId,
        /*
         * El SKU de la variante se deriva del modelo más la talla. No es el
         * código de barras —ése es el de la caja y puede repetirse en todo el
         * modelo— ni el del ERP, que tampoco se puede dar por único. Acá hace
         * falta un identificador propio porque `product_variants.sku` es único
         * por tenant y lo usan el checkout, los pedidos y la búsqueda.
         */
        sku: `${producto.sku}-${item.erpSize || i}`,
        barcode: item.barcode || null,
        internal_code: item.internalCode || null,
        title: item.size,
        position: i,
        price: item.price.amount,
        currency: item.price.currency,
        attributes: { talla: item.size },
        erp_size: item.erpSize,
      });

      filasInventario.push({
        tenant_id: TENANT,
        variant_id: variantId,
        location_id: LOCATION,
        // Sin recortar: `inventory_levels.available` admite negativos a propósito,
        // porque un negativo es un descuadre real y esconderlo no lo arregla.
        available: item.available,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Reporte — en dry run, esto es todo
  // ---------------------------------------------------------------------------

  console.log('\nReconciliación');
  console.log(`  productos nuevos              ${productosNuevos}`);
  console.log(`  productos ya en la tienda     ${productosExistentes}`);
  console.log(`  variantes nuevas              ${variantesCreadas}`);
  console.log(`  variantes actualizadas        ${variantesActualizadas}`);
  console.log(`  variantes sin cambio          ${variantesSinCambio}`);
  console.log(`  cruzadas por código de barras ${cruzadasPorBarcode}`);
  console.log(`  cruzadas por código del ERP   ${cruzadasPorCodigoErp}`);
  console.log(`  cruzadas por talla            ${cruzadasPorTalla}`);
  console.log(`  categorías nuevas             ${categoriasNuevas.length} de ${familias.length}`);

  for (const d of duplicadosDelERP) {
    problemas.push({
      codigo: d.barcode || d.internalCode,
      motivo: `el ERP trae la variante ${d.sku} talla ${d.erpSize} dos veces con códigos distintos; se usó la primera`,
    });
  }

  if (problemas.length > 0) {
    console.log(`\n  ${problemas.length} variantes descartadas:`);
    for (const p of problemas.slice(0, 10)) console.log(`    ${p.codigo}: ${p.motivo}`);
    if (problemas.length > 10) console.log(`    … y ${problemas.length - 10} más`);
  }

  // ---------------------------------------------------------------------------
  // Escritura
  // ---------------------------------------------------------------------------

  async function upsert(
    tabla: string,
    filas: readonly Record<string, unknown>[],
    onConflict?: string,
  ): Promise<void> {
    if (filas.length === 0) return;
    for (let i = 0; i < filas.length; i += 200) {
      const { error } = await db
        .from(tabla)
        // @ts-expect-error — el importador escribe filas genéricas, como los seeds.
        .upsert(filas.slice(i, i + 200), onConflict ? { onConflict } : undefined);
      if (error) throw new Error(`No se pudo escribir ${tabla}: ${error.message}`);
    }
    console.log(`  ${tabla}: ${filas.length}`);
  }

  if (!dryRun) {
    console.log('\nEscribiendo');

    // El atributo tiene que existir para que la PLP arme la faceta de talla. Su
    // índice único es una expresión sobre `coalesce(category_id, …)`, que no es un
    // constraint y por lo tanto no sirve de `onConflict`: se comprueba a mano.
    const { data: atributo } = await db
      .from('attribute_definitions')
      .select('id')
      .eq('store_id', STORE)
      .eq('name', 'talla')
      .is('category_id', null)
      .maybeSingle();

    if (!atributo) {
      const { error } = await db.from('attribute_definitions').insert({
        tenant_id: TENANT,
        store_id: STORE,
        name: 'talla',
        label: 'Talla',
        position: 0,
        filterable: true,
        visible_pdp: true,
      });
      if (error) throw new Error(`No se pudo crear el atributo talla: ${error.message}`);
      console.log('  attribute_definitions: 1');
    }

    await upsert('categories', categoriasNuevas);
    await upsert('products', filasProductos);
    await upsert('product_variants', filasVariantes);
    await upsert('inventory_levels', filasInventario, 'variant_id,location_id');
  }

  const { error: errorCorrida } = await db.from('erp_sync_runs').insert({
    tenant_id: TENANT,
    store_id: STORE,
    adapter: erp.id,
    mode: dryRun ? 'dry_run' : 'real',
    items_received: items.length,
    products_seen: productos.length,
    created_count: variantesCreadas,
    updated_count: variantesActualizadas,
    unchanged_count: variantesSinCambio,
    unmatched_count: problemas.length,
    error_details: problemas,
    started_at: comenzo,
    finished_at: new Date().toISOString(),
  });

  if (errorCorrida) console.error(`\nNo se pudo registrar la corrida: ${errorCorrida.message}`);

  console.log(
    dryRun
      ? '\nDry run: no se escribió nada. Repetir sin --dry-run para aplicar.'
      : `\nListo: ${filasProductos.length} productos y ${filasVariantes.length} variantes.`,
  );

  return 0;
}

process.exitCode = await main();
