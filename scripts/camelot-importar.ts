import { existsSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { clienteDeServidor } from '@pick/adapter-supabase';
import { dimensionesWebp } from './dimensiones.ts';

/**
 * Trae el catálogo de Camelot al catálogo de Pick.
 *
 *   pnpm camelot:importar --tienda treeshop --dry-run
 *   pnpm camelot:importar --tienda treeshop
 *   pnpm camelot:importar --tienda treeshop --imagenes
 *
 * **Por qué no es un `ERPAdapter`.** Camelot no es un ERP: es un ecommerce
 * anterior, con un schema de Postgres limpio donde ya están los productos, las
 * variantes, las fotos, las marcas y las categorías. El puerto `ERPAdapter`
 * modela un feed de inventario y su `ERPItem` no tiene dónde llevar una imagen
 * ni una marca; pasarlo por ahí perdería la mitad de lo que se vino a buscar.
 * Un puerto se justifica con dos implementaciones reales del **mismo** contrato,
 * y ésta no lo es.
 *
 * **La conversión de precio es lo delicado de este script.** Camelot tiene dos
 * monedas en una columna que dice PYG: 424 productos en guaraníes y 3482 en
 * dólares. La moneda se decide **por producto**, mirando su precio, con un hueco
 * verificado entre medio; el costo sigue al precio. Si
 * algún día cae un precio en ese hueco la corrida **aborta** en vez de adivinar.
 * Ver `monedaDelProducto`.
 *
 * Idempotente: correrlo dos veces actualiza en su lugar y no duplica nada.
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
/** `0` es «todos». El default también, porque acá el catálogo entero es el objetivo. */
const limite = Number(opcion('limite') ?? 0);
const dryRun = args.includes('--dry-run');
const conImagenes = args.includes('--imagenes');

if (!slugTienda || !Number.isFinite(limite) || limite < 0) {
  console.error('Uso: pnpm camelot:importar --tienda <slug> [--limite N] [--dry-run] [--imagenes]');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const origenUrl = process.env.CAMELOT_SUPABASE_URL;
const origenKey = process.env.CAMELOT_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !secretKey) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY.');
  process.exit(1);
}
if (!origenUrl || !origenKey) {
  console.error('Faltan CAMELOT_SUPABASE_URL y CAMELOT_SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

/**
 * Cuántos guaraníes vale un dólar.
 *
 * Decidido con el cliente el 2026-09-02. Es el número que fija a cuánto se vende
 * la mayor parte del catálogo, así que vive acá con nombre y no incrustado en
 * una cuenta: cambiarlo es una línea, y queda a la vista de quien lea el script.
 */
const COTIZACION = 6100;

/**
 * Los dos extremos del hueco medido en los datos de Camelot.
 *
 * Al 2026-09-02, de 3906 productos activos: 3482 tienen precio ≤ 1000 —dólares,
 * con costos que dan el mismo margen de 1,5× que los otros— y 424 tienen precio
 * > 20 000, que son guaraníes de verdad. **Entre medio no hay ni uno**, y por eso
 * el umbral se puede decidir por el valor sin adivinar.
 *
 * Si aparece un precio en el hueco, el supuesto dejó de valer y la corrida para.
 */
const TECHO_EN_DOLARES = 1000;
const PISO_EN_GUARANIES = 20_000;

const db = clienteDeServidor({ url, secretKey });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Lee una tabla de Camelot por REST, paginando: PostgREST corta en 1000. */
async function traer<T>(tabla: string, select: string, filtro = ''): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const u = `${origenUrl}/rest/v1/${tabla}?select=${select}${filtro}&order=id&offset=${desde}&limit=1000`;
    const res = await fetch(u, {
      headers: { apikey: origenKey!, Authorization: `Bearer ${origenKey}` },
    });
    if (!res.ok) throw new Error(`Camelot rechazó ${tabla}: ${res.status} ${await res.text()}`);
    const lote = (await res.json()) as T[];
    filas.push(...lote);
    if (lote.length < 1000) return filas;
  }
}

/**
 * En qué moneda está escrito un producto, decidido por su **precio**.
 *
 * La moneda es del producto y no de cada campo: el costo sigue al precio. Se
 * comprobó — de los 424 con precio en guaraníes, 10 tienen un costo entre 1000 y
 * 20 000 (por ejemplo «Ropa Interior Lupo Blanco», precio 29 930 y costo 19 950),
 * y son guaraníes legítimos. Decidir campo por campo los habría tomado por
 * dólares y multiplicado por 6100.
 *
 * El precio sí se puede decidir solo, porque ahí el hueco está vacío.
 */
function monedaDelProducto(precio: number, quien: string): 'PYG' | 'USD' {
  if (!Number.isFinite(precio) || precio < 0) {
    throw new Error(`${quien}: precio inválido (${precio}).`);
  }
  if (precio > 0 && precio <= TECHO_EN_DOLARES) return 'USD';
  if (precio >= PISO_EN_GUARANIES) return 'PYG';
  // Cero cae acá y se trata como guaraníes: cero es cero en las dos.
  if (precio === 0) return 'PYG';

  throw new Error(
    `${quien}: el precio ${precio} cae entre ${TECHO_EN_DOLARES} y ${PISO_EN_GUARANIES}, ` +
      'y ahí no se puede saber si son dólares o guaraníes. Cuando se midió el ' +
      'catálogo no había ni un producto en ese rango. Revisar el dato en Camelot ' +
      'o ajustar los umbrales de este script a conciencia — no se adivina un precio.',
  );
}

/**
 * Un importe de Camelot, en guaraníes.
 *
 * PYG no tiene decimales, así que el importe en unidad mínima **es** el número
 * de guaraníes: no se multiplica por 100 como en una moneda con centavos.
 */
function aGuaranies(valor: number, moneda: 'PYG' | 'USD'): number {
  return moneda === 'USD' ? Math.round(valor * COTIZACION) : Math.round(valor);
}

/**
 * Lee una tabla **de la tienda**, paginando.
 *
 * PostgREST devuelve 1000 filas y no avisa que hay más. Sin esto, la segunda
 * corrida veía 1000 de los 3752 productos ya importados, tomaba los otros 2752
 * por nuevos y les generaba id y handle nuevos: el catálogo entero duplicado.
 * Lo frenó el índice único de `handle`, que abortó la primera tanda — o sea que
 * el daño lo evitó una restricción de la base, no el script.
 *
 * **El `order` no es cosmético.** Sin una clave de orden, Postgres no garantiza
 * que dos páginas consecutivas sean disjuntas: hay filas que salen dos veces y
 * filas que no salen nunca. Y no falla siempre — con las 10 241 variantes, un
 * dry run las trajo enteras y la corrida siguiente perdió unas cuantas, que
 * parecieron nuevas y chocaron contra el índice único de `sku`. Un fallo que
 * aparece una de cada dos veces es peor que uno que aparece siempre.
 */
async function traerLocal<T>(
  tabla: string,
  columnas: string,
  filtro: (q: ReturnType<typeof db.from>) => unknown,
): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    // @ts-expect-error — el importador lee tablas genéricas, como los seeds.
    const consulta = filtro(db.from(tabla).select(columnas).order('id')) as {
      range: (
        a: number,
        b: number,
      ) => Promise<{ data: T[] | null; error: { message: string } | null }>;
    };
    const { data, error } = await consulta.range(desde, desde + 999);
    if (error) throw new Error(`No se pudo leer ${tabla}: ${error.message}`);
    const lote = data ?? [];
    filas.push(...lote);
    if (lote.length < 1000) return filas;
  }
}

/** El código del ERP como texto, venga como venga. Ver `VarianteCamelot`. */
function codigo(valor: number | string | null | undefined): string | null {
  return valor === null || valor === undefined || valor === '' ? null : String(valor);
}

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
}

// ---------------------------------------------------------------------------
// Tipos del origen
// ---------------------------------------------------------------------------

interface ProductoCamelot {
  id: string;
  sku: string;
  name: string;
  brand_id: string | null;
  category_id: string | null;
  silhouette_id: string | null;
  price: number;
  cost: number | null;
  description: string | null;
  gender: string | null;
  created_at: string;
}
interface VarianteCamelot {
  id: string;
  product_id: string;
  /**
   * **Entero en Camelot, texto en Pick.** PostgREST lo devuelve como número, y
   * buscar `9662` en un mapa con claves `'9662'` no encuentra nada: la primera
   * versión de este script daba las 10 241 variantes por nuevas en cada corrida.
   * Se normaliza con `codigo()` en los dos lados del cruce.
   */
  internal_code: number | string | null;
  barcode: string | null;
  size: string;
  color: string;
  stock: number;
}
interface ImagenCamelot {
  product_id: string;
  url: string;
  alt_text: string | null;
  position: number;
}
interface Nombrado {
  id: string;
  name: string;
}

async function main(): Promise<number> {
  // -------------------------------------------------------------------------
  // A qué tienda
  // -------------------------------------------------------------------------

  const { data: org } = await db
    .from('organizations')
    .select('id')
    .eq('slug', slugTienda!)
    .maybeSingle();
  if (!org) {
    console.error(`No existe la organización «${slugTienda}».`);
    console.error(`  pnpm tienda:crear ${slugTienda} "<Nombre>" <dominio>`);
    return 1;
  }
  const TENANT = org.id;

  const { data: tienda } = await db
    .from('stores')
    .select('id')
    .eq('tenant_id', TENANT)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (!tienda) {
    console.error(`La organización «${slugTienda}» no tiene ninguna tienda.`);
    return 1;
  }
  const STORE = tienda.id;

  const { data: sucursal } = await db
    .from('locations')
    .select('id')
    .eq('store_id', STORE)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (!sucursal) {
    console.error('La tienda no tiene ninguna sucursal: sin ella no se puede guardar stock.');
    return 1;
  }
  const LOCATION = sucursal.id;

  // -------------------------------------------------------------------------
  // Traer Camelot
  // -------------------------------------------------------------------------

  console.log(`Leyendo el catálogo de Camelot…`);

  const [marcas, categorias, siluetas, productosCrudos, variantesCrudas] = await Promise.all([
    traer<Nombrado>('brands', 'id,name'),
    traer<Nombrado>('categories', 'id,name', '&is_active=eq.true'),
    traer<Nombrado>('silhouettes', 'id,name'),
    traer<ProductoCamelot>(
      'products',
      'id,sku,name,brand_id,category_id,silhouette_id,price,cost,description,gender,created_at',
      '&is_active=eq.true',
    ),
    traer<VarianteCamelot>(
      'product_variants',
      'id,product_id,internal_code,barcode,size,color,stock',
      '&is_active=eq.true',
    ),
  ]);

  const nombreDeMarca = new Map(marcas.map((m) => [m.id, m.name]));
  const nombreDeSilueta = new Map(siluetas.map((s) => [s.id, s.name]));

  console.log(
    `  ${productosCrudos.length} productos · ${variantesCrudas.length} variantes · ` +
      `${marcas.length} marcas · ${categorias.length} categorías`,
  );

  // -------------------------------------------------------------------------
  // Agrupar variantes, sumando las que son la misma cosa
  // -------------------------------------------------------------------------

  /*
   * Camelot tiene 118 combinaciones (producto, talla, color) repetidas con
   * códigos distintos. En Pick la variante se elige por sus atributos, así que
   * dos con la misma talla y color dejarían a la segunda inalcanzable y su stock
   * invisible. Se **suma** el stock en la primera, que es la misma regla que
   * `agregarPorVariante` aplica a los lotes de un ERP, y se reporta.
   */
  const porProducto = new Map<string, VarianteCamelot[]>();
  const fusionadas: string[] = [];

  for (const v of variantesCrudas) {
    const lista = porProducto.get(v.product_id) ?? [];
    const gemela = lista.find((x) => x.size === v.size && x.color === v.color);
    if (gemela) {
      gemela.stock += v.stock;
      fusionadas.push(`${codigo(v.internal_code) ?? v.id} (${v.size}/${v.color})`);
    } else {
      lista.push({ ...v });
    }
    porProducto.set(v.product_id, lista);
  }

  // Un producto sin variantes no se puede vender: no tiene qué agregar al carrito.
  const vendibles = productosCrudos.filter((p) => (porProducto.get(p.id)?.length ?? 0) > 0);
  // El descarte se cuenta **antes** de recortar por `--limite`, o el recorte se
  // reportaría como si fueran productos rotos.
  const sinVariantes = productosCrudos.length - vendibles.length;
  const productos = limite > 0 ? vendibles.slice(0, limite) : vendibles;

  // -------------------------------------------------------------------------
  // Lo que ya está en la tienda
  // -------------------------------------------------------------------------

  const localesProductos = await traerLocal<{
    id: string;
    sku: string | null;
    handle: string;
    title: string;
    description: string | null;
    brand: string | null;
    category_id: string | null;
    status: string;
    field_sources: Record<string, string> | null;
  }>(
    'products',
    'id, sku, handle, title, description, brand, category_id, status, field_sources',
    (q) => (q as { eq: (c: string, v: string) => unknown }).eq('store_id', STORE),
  );
  const porSku = new Map(localesProductos.map((p) => [p.sku ?? '', p]));

  const localesVariantes = await traerLocal<{
    id: string;
    sku: string;
    internal_code: string | null;
  }>('product_variants', 'id, sku, product_id, internal_code', (q) =>
    (q as { eq: (c: string, v: string) => unknown }).eq('tenant_id', TENANT),
  );
  const variantePorCodigo = new Map(
    localesVariantes.filter((v) => v.internal_code).map((v) => [v.internal_code!, v]),
  );
  /*
   * El respaldo para la única variante de Camelot que no trae `internal_code`.
   * Sin esto se le generaría un id nuevo en cada corrida, y como
   * `product_variants.sku` es único por tenant, la segunda corrida fallaría.
   */
  const variantePorSku = new Map(localesVariantes.map((v) => [v.sku, v]));

  const localesCategorias = await traerLocal<{ id: string; slug: string }>(
    'categories',
    'id, slug',
    (q) => (q as { eq: (c: string, v: string) => unknown }).eq('store_id', STORE),
  );
  const categoriaPorSlug = new Map(localesCategorias.map((c) => [c.slug, c]));

  // -------------------------------------------------------------------------
  // Armar lo que se va a escribir
  // -------------------------------------------------------------------------

  const filasCategorias: Record<string, unknown>[] = [];
  const idDeCategoria = new Map<string, string>();

  for (const [i, c] of categorias.entries()) {
    const s = slug(c.name);
    const existente = categoriaPorSlug.get(s);
    const id = existente?.id ?? randomUUID();
    idDeCategoria.set(c.id, id);
    // Las existentes se reusan por slug: cambiarles la PK rompería los productos
    // que ya las referencian.
    if (!existente) {
      filasCategorias.push({
        id,
        tenant_id: TENANT,
        store_id: STORE,
        name: c.name,
        slug: s,
        position: i,
      });
    }
  }

  const filasProductos: Record<string, unknown>[] = [];
  const filasVariantes: Record<string, unknown>[] = [];
  const filasInventario: Record<string, unknown>[] = [];
  const idLocalDeProductoCamelot = new Map<string, string>();

  /*
   * Handles únicos, y estables entre corridas.
   *
   * `products.handle` es único por tienda y es la URL del producto. El slug del
   * sku no alcanza para separarlos: Camelot tiene 12 pares con el **mismo
   * nombre** y skus que sólo se diferencian en un carácter que el slug colapsa
   * —`1620023/10123` y `1620023-10123`—, y son productos distintos.
   *
   * Al que choca se le agrega un sufijo derivado de su propio sku, no de su
   * posición: así no depende del orden en que vinieron las filas y una corrida
   * futura le da el mismo handle. Los que no chocan quedan limpios, que son
   * casi todos.
   *
   * Un producto ya publicado nunca cambia de handle: eso rompería su URL.
   */
  const handlesUsados = new Set(localesProductos.map((p) => p.handle));

  function handleDe(p: ProductoCamelot): string {
    const base = slug(`${p.name} ${p.sku}`).slice(0, 120);
    if (!handlesUsados.has(base)) {
      handlesUsados.add(base);
      return base;
    }
    const sufijo = createHash('sha1').update(p.sku).digest('hex').slice(0, 6);
    const conSufijo = `${base.slice(0, 113)}-${sufijo}`;
    handlesUsados.add(conSufijo);
    return conSufijo;
  }

  let convertidosDeDolar = 0;
  let yaEnGuaranies = 0;
  let productosNuevos = 0;
  let productosExistentes = 0;
  let variantesNuevas = 0;
  let variantesExistentes = 0;

  for (const p of productos) {
    const local = porSku.get(p.sku);
    const productId = local?.id ?? randomUUID();
    idLocalDeProductoCamelot.set(p.id, productId);
    if (local) productosExistentes++;
    else productosNuevos++;

    const quien = `«${p.name}» (sku ${p.sku})`;
    const moneda = monedaDelProducto(p.price, quien);
    const precio = aGuaranies(p.price, moneda);
    const costo = p.cost === null ? null : aGuaranies(p.cost, moneda);
    if (moneda === 'USD') convertidosDeDolar++;
    else yaEnGuaranies++;

    const marca = p.brand_id ? (nombreDeMarca.get(p.brand_id) ?? null) : null;
    const silueta = p.silhouette_id ? nombreDeSilueta.get(p.silhouette_id) : undefined;

    /*
     * Lo que el origen manda, y lo que no vuelve a pisar. ADR-117.
     *
     * `field_sources` declara el dueño de cada campo (PROJECT.md §10), y hasta
     * acá el importador lo declaraba y lo desobedecía: reescribía `title`,
     * `description`, `brand`, `category_id` y `status` en **cada** corrida,
     * aunque el dueño de esos cinco sea local. El enriquecimiento de la Fase 11
     * escribe exactamente esos campos (ADR-104) y una sesión de fotos cambia el
     * resto, así que la siguiente corrida lo revertía en silencio: sin fallar,
     * sin aparecer en el typecheck, y sin que nadie se enterara hasta ver
     * títulos de origen en la vitrina.
     *
     * Un producto nuevo se escribe entero, que es la única forma de crearlo.
     * Uno que ya existe conserva lo suyo y sólo acepta del origen los campos
     * que su propia declaración le cede: para que los títulos vuelvan a seguir
     * a Camelot, se agrega `title: 'ERP'` a su `field_sources` y este
     * importador los reescribe.
     */
    const deOrigen = {
      title: p.name,
      description: p.description,
      brand: marca,
      category_id: p.category_id ? (idDeCategoria.get(p.category_id) ?? null) : null,
      status: 'active',
    };
    const campos = local
      ? {
          title: local.field_sources?.title === 'ERP' ? deOrigen.title : local.title,
          description:
            local.field_sources?.description === 'ERP' ? deOrigen.description : local.description,
          brand: local.field_sources?.brand === 'ERP' ? deOrigen.brand : local.brand,
          category_id:
            local.field_sources?.category_id === 'ERP' ? deOrigen.category_id : local.category_id,
          status: local.field_sources?.status === 'ERP' ? deOrigen.status : local.status,
        }
      : deOrigen;

    filasProductos.push({
      id: productId,
      tenant_id: TENANT,
      store_id: STORE,
      // El handle de un producto ya publicado no se toca: cambiarlo rompe su URL.
      handle: local?.handle ?? handleDe(p),
      ...campos,
      sku: p.sku,
      /*
       * La fecha de alta es la de Camelot, no la de esta corrida. Sin esto los
       * 3752 entraban con la misma fecha, «Novedades» no ordenaba nada y el
       * orden por defecto de la tienda era el del uuid: azar. Con la de origen,
       * lo que Camelot cargó ayer aparece primero acá, y una corrida futura no
       * la pisa: el upsert la vuelve a escribir con el mismo valor.
       */
      created_at: p.created_at,
      /*
       * Declarar el dueño es lo que bloquea la edición local (PROJECT.md §10) y
       * lo que decide, arriba, qué reescribe este importador. La declaración de
       * un producto que ya existe no se pisa: si la tienda le cedió un campo
       * más al origen, esa decisión es suya.
       */
      field_sources: local?.field_sources ?? { price: 'ERP', stock: 'ERP' },
    });

    for (const [i, v] of (porProducto.get(p.id) ?? []).entries()) {
      const ic = codigo(v.internal_code);
      const skuVariante = ic ?? `${p.sku}-${i}`;
      const localV =
        (ic ? variantePorCodigo.get(ic) : undefined) ?? variantePorSku.get(skuVariante);
      const variantId = localV?.id ?? randomUUID();
      if (localV) variantesExistentes++;
      else variantesNuevas++;

      /*
       * `tipo` sale de la silueta —remera, jogger, zapatenis— y va en la variante
       * porque las facetas del catálogo se arman con los atributos de variante.
       * No es adorno: con 3906 productos repartidos en **cuatro** categorías, sin
       * este filtro la vitrina son mil productos por categoría y no se navega.
       */
      filasVariantes.push({
        id: variantId,
        tenant_id: TENANT,
        product_id: productId,
        // `product_variants.sku` es único por tenant y lo usan el checkout y los
        // pedidos. El `internal_code` de Camelot es único en las 11 116 filas,
        // así que sirve; el índice es el respaldo para la única que no lo trae.
        sku: skuVariante,
        barcode: v.barcode || null,
        internal_code: ic,
        title: `${v.size} · ${v.color}`,
        position: i,
        price: precio,
        cost: costo,
        currency: 'PYG',
        attributes: {
          talla: v.size,
          color: v.color,
          ...(silueta ? { tipo: silueta } : {}),
        },
      });

      filasInventario.push({
        tenant_id: TENANT,
        variant_id: variantId,
        location_id: LOCATION,
        // Sin recortar: un negativo es un descuadre real y esconderlo no lo arregla.
        available: v.stock,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Reporte — en dry run, esto es todo
  // -------------------------------------------------------------------------

  console.log('\nReconciliación');
  console.log(`  productos nuevos              ${productosNuevos}`);
  console.log(`  productos ya en la tienda     ${productosExistentes}`);
  console.log(`  variantes nuevas              ${variantesNuevas}`);
  console.log(`  variantes ya en la tienda     ${variantesExistentes}`);
  console.log(`  categorías nuevas             ${filasCategorias.length} de ${categorias.length}`);
  console.log('\nPrecios');
  console.log(`  convertidos a ${COTIZACION} Gs/USD  ${convertidosDeDolar}`);
  console.log(`  ya estaban en guaraníes       ${yaEnGuaranies}`);

  const muestra = filasVariantes.slice(0, 3) as { sku: string; price: number }[];
  for (const m of muestra) console.log(`    ej. ${m.sku}: ${m.price.toLocaleString('es-PY')} Gs`);

  if (sinVariantes > 0) {
    console.log(`\n  ${sinVariantes} productos descartados por no tener variantes activas.`);
  }
  if (fusionadas.length > 0) {
    console.log(`  ${fusionadas.length} variantes fusionadas por repetir talla y color:`);
    for (const f of fusionadas.slice(0, 5)) console.log(`    ${f}`);
    if (fusionadas.length > 5) console.log(`    … y ${fusionadas.length - 5} más`);
  }

  if (dryRun) {
    console.log('\nDry run: no se escribió nada.');
    return 0;
  }

  // -------------------------------------------------------------------------
  // Escritura
  // -------------------------------------------------------------------------

  console.log('\nEscribiendo…');

  /*
   * Los atributos que el catálogo va a poder filtrar. Sin la definición, el valor
   * viaja en la variante pero no aparece como faceta en la PLP.
   *
   * Su índice único es una expresión sobre `coalesce(category_id, …)`, que no
   * sirve de `onConflict`, así que se comprueba a mano.
   */
  for (const [i, nombre] of ['talla', 'color', 'tipo'].entries()) {
    const { data: existe } = await db
      .from('attribute_definitions')
      .select('id')
      .eq('store_id', STORE)
      .eq('name', nombre)
      .is('category_id', null)
      .maybeSingle();
    if (existe) continue;
    const { error } = await db.from('attribute_definitions').insert({
      tenant_id: TENANT,
      store_id: STORE,
      name: nombre,
      label: nombre[0]!.toUpperCase() + nombre.slice(1),
      position: i,
      filterable: true,
      visible_pdp: true,
    });
    if (error) throw new Error(`No se pudo crear el atributo ${nombre}: ${error.message}`);
  }

  await upsert('categories', filasCategorias);
  console.log(`  categories        ${filasCategorias.length}`);
  await upsert('products', filasProductos);
  console.log(`  products          ${filasProductos.length}`);
  await upsert('product_variants', filasVariantes);
  console.log(`  product_variants  ${filasVariantes.length}`);
  await upsert('inventory_levels', filasInventario, 'variant_id,location_id');
  console.log(`  inventory_levels  ${filasInventario.length}`);

  // -------------------------------------------------------------------------
  // Las fotos, si se piden
  // -------------------------------------------------------------------------

  if (conImagenes) {
    console.log('\nFotos');
    const imagenes = await traer<ImagenCamelot>(
      'product_images',
      'product_id,url,alt_text,position',
    );
    const porProductoImg = new Map<string, ImagenCamelot[]>();
    for (const img of imagenes) {
      if (!idLocalDeProductoCamelot.has(img.product_id)) continue;
      const lista = porProductoImg.get(img.product_id) ?? [];
      lista.push(img);
      porProductoImg.set(img.product_id, lista);
    }

    /*
     * Se guarda de a tandas de productos, no todo al final.
     *
     * Son unas 4500 descargas y unos 170 MB: juntarlas en memoria para escribir
     * al cierre significa que un corte a los catorce minutos tira los catorce
     * minutos. Cada tanda se cierra sola —borra las fotos de esos productos y
     * escribe las nuevas—, así que lo hecho queda hecho y volver a correr el
     * script retoma sin duplicar: la ruta del bucket se deriva del producto.
     */
    const TANDA = 100;
    let filasMedia: Record<string, unknown>[] = [];
    let tocados: string[] = [];
    let subidas = 0;
    let fallidas = 0;
    let productosVistos = 0;

    async function guardarTanda(): Promise<void> {
      if (tocados.length === 0) return;
      /*
       * Reemplazo y no upsert: si el origen ahora trae menos fotos, un upsert
       * dejaría las viejas colgando. Pero el reemplazo se acota a **las fotos
       * de este importador**, que viven todas bajo `<tenant>/camelot/` en el
       * bucket: un `delete` por `product_id` también borraba las que subió la
       * tienda, y nada las traía de vuelta. ADR-117.
       */
      const { error } = await db
        .from('product_media')
        .delete()
        .in('product_id', tocados)
        .like('url', '%/camelot/%');
      if (error) throw new Error(`No se pudieron limpiar las fotos: ${error.message}`);
      await upsert('product_media', filasMedia);
      filasMedia = [];
      tocados = [];
    }

    /*
     * Una foto: bajarla del origen y subirla al bucket propio.
     *
     * No se referencia la URL de Camelot: colgaría el catálogo de un proyecto
     * que no controlamos, y `image.remotePatterns` sólo autoriza el bucket
     * `product-media` (ADR-082).
     */
    async function traerFoto(
      productId: string,
      titulo: string,
      img: ImagenCamelot,
      i: number,
    ): Promise<void> {
      try {
        const res = await fetch(img.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const dims = dimensionesWebp(buf);
        // Sin dimensiones no se guarda: inventarlas produce el salto de layout
        // que la columna existe para evitar (ADR-034).
        if (!dims) throw new Error('no se pudieron leer las dimensiones');

        // Ruta derivada y no aleatoria: repetir la corrida sobrescribe en el
        // mismo lugar en vez de acumular copias.
        const ruta = `${TENANT}/camelot/${productId}-${i}.webp`;
        const { error } = await db.storage
          .from('product-media')
          .upload(ruta, buf, { contentType: 'image/webp', upsert: true });
        if (error) throw new Error(error.message);

        const { data: publica } = db.storage.from('product-media').getPublicUrl(ruta);
        filasMedia.push({
          tenant_id: TENANT,
          product_id: productId,
          url: publica.publicUrl,
          alt: img.alt_text || titulo,
          width: dims.width,
          height: dims.height,
          position: i,
        });
        subidas++;
      } catch (e) {
        fallidas++;
        if (fallidas <= 5) console.log(`  falló ${img.url}: ${(e as Error).message}`);
      }
    }

    /*
     * De a ocho a la vez.
     *
     * Cada foto son dos viajes de red —bajar del origen, subir al bucket— y de
     * a una tardaba dos horas para las ~5800. Ocho es un número prudente: sube
     * a la misma cuenta de Supabase que sirve la tienda, y saturarla para
     * apurar una importación sería apagar la vitrina para llenar el depósito.
     */
    const EN_PARALELO = 8;
    const pendientes: (() => Promise<void>)[] = [];

    async function drenar(): Promise<void> {
      while (pendientes.length > 0) {
        const tanda = pendientes.splice(0, EN_PARALELO);
        await Promise.all(tanda.map((t) => t()));
      }
    }

    for (const [camelotId, lista] of porProductoImg) {
      const productId = idLocalDeProductoCamelot.get(camelotId)!;
      const titulo = productos.find((p) => p.id === camelotId)?.name ?? '';
      tocados.push(productId);

      lista.sort((a, b) => a.position - b.position);
      for (const [i, img] of lista.entries()) {
        pendientes.push(() => traerFoto(productId, titulo, img, i));
      }

      productosVistos++;
      if (productosVistos % TANDA === 0) {
        await drenar();
        await guardarTanda();
        console.log(
          `  ${productosVistos}/${porProductoImg.size} productos · ${subidas} fotos guardadas`,
        );
      }
    }

    await drenar();

    await guardarTanda();
    console.log(`  subidas ${subidas} · fallidas ${fallidas}`);
    if (fallidas > 0) return 1;
  } else {
    console.log('\nSin fotos. Para traerlas: agregá --imagenes (son ~4500 descargas).');
  }

  console.log('\nListo.');
  return 0;
}

// `process.exitCode` y no `process.exit()`: con el cliente de Supabase abierto,
// salir de golpe dispara una aserción de libuv en Windows.
process.exitCode = await main();
