import { existsSync } from 'node:fs';
import { clienteDeServidor } from '@pick/adapter-supabase';
import { IDS } from './seed-data.ts';
import { dimensionesWebp } from './dimensiones.ts';

/**
 * Carga productos de prueba desde dummyjson.com.
 *
 * Sirve para lo que el catálogo de demostración no puede: con cinco productos no
 * se ve si la paginación anda, si la búsqueda encuentra, si la selección
 * múltiple escala o si una tabla de veinte filas se lee bien. Con doscientos, sí.
 *
 *   pnpm seed:dummy [cantidad]     # por defecto 60; por encima de 194 sintetiza
 *   pnpm seed:dummy --limpiar      # los borra todos y no carga nada
 *
 * Idempotente: los ids se derivan del id de dummyjson, así que repetirlo
 * actualiza en vez de duplicar. Todo lo que crea vive en su propio rango de
 * uuids —`dda0…` en adelante— y por eso `--limpiar` puede distinguirlo del
 * catálogo de la demo sin tocar nada más.
 *
 * Por encima de 194 —lo que tiene dummyjson— repite el catálogo con un sufijo.
 * Sirve para medir con un catálogo del tamaño de uno real sin depender de datos
 * de un cliente, que es lo que impide usar el del ERP para esto.
 *
 * **Los datos son inventados y las imágenes son de un tercero.** No es un
 * sustituto de un catálogo real: los precios salen de convertir dólares a una
 * cotización fija, y las fotos las sirve `cdn.dummyjson.com`, que puede dejar de
 * responder cuando quiera. Para desarrollo y demos alcanza; para un piloto, no.
 */

if (existsSync('.env')) process.loadEnvFile('.env');

const argumentos = process.argv.slice(2);
const limpiar = argumentos.includes('--limpiar');
const cantidad = Number(argumentos.find((a) => /^\d+$/.test(a)) ?? 60);

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY.');
  process.exit(1);
}

const db = clienteDeServidor({ url, secretKey });

/**
 * Un uuid estable a partir del id de dummyjson.
 *
 * Mismo esquema que `seed-data.ts` —un prefijo por tabla— pero con otra familia:
 * `dda0` los productos, `dda1` las variantes, y así. Tiene que ser otra familia y
 * no una continuación de la del seed: con `5eedd1` como prefijo, el rango de las
 * variantes de acá pisaba exactamente el de los **productos** de la demo, y
 * `--limpiar` los habría borrado.
 *
 * Reconocerlos por el uuid es lo que hace posible borrarlos sin tocar el resto.
 * Se filtra por **rango** y no con `like`: PostgREST no puede comparar un `uuid`
 * con un patrón —"operator does not exist: uuid ~~ unknown"— pero sí ordenarlo.
 */
function uuid(tabla: number, n: number): string {
  return `dda${tabla}0000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

/** El rango de uuids de una tabla, para borrar sólo lo que este script creó. */
function rango(tabla: number): { desde: string; hasta: string } {
  return {
    desde: `dda${tabla}0000-0000-0000-0000-000000000000`,
    hasta: `dda${tabla + 1}0000-0000-0000-0000-000000000000`,
  };
}

// ---------------------------------------------------------------------------
// Limpieza
// ---------------------------------------------------------------------------

async function borrarTodo(): Promise<void> {
  // Los hijos se van en cascada con el producto; las categorías no cuelgan de
  // él, así que van aparte. El orden importa: una categoría con productos
  // todavía apuntándola no se puede borrar.
  const productos = rango(0);
  const { data, error } = await db
    .from('products')
    .delete()
    .gte('id', productos.desde)
    .lt('id', productos.hasta)
    .select('id');
  if (error) throw new Error(`No se pudieron borrar los productos: ${error.message}`);

  const cats = rango(4);
  const { error: errorCat } = await db
    .from('categories')
    .delete()
    .gte('id', cats.desde)
    .lt('id', cats.hasta);
  if (errorCat) throw new Error(`No se pudieron borrar las categorías: ${errorCat.message}`);

  console.log(`Borrados ${data?.length ?? 0} productos de prueba y sus categorías.`);
}

if (limpiar) {
  await borrarTodo();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Traer los datos
// ---------------------------------------------------------------------------

interface ProductoDummy {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly price: number;
  readonly discountPercentage: number;
  readonly stock: number;
  readonly brand?: string;
  readonly sku: string;
  readonly images: readonly string[];
  readonly thumbnail: string;
}

console.log(`Trayendo hasta ${cantidad} productos de dummyjson.com`);

const respuesta = await fetch(`https://dummyjson.com/products?limit=${Math.min(cantidad, 194)}`);
if (!respuesta.ok) {
  console.error(`dummyjson respondió ${respuesta.status}`);
  process.exit(1);
}
const { products: base } = (await respuesta.json()) as { products: ProductoDummy[] };

/**
 * Por encima de los 194 que tiene dummyjson, se sintetiza repitiendo el
 * catálogo con un sufijo.
 *
 * Es para lo que 194 productos no alcanzan: medir la PLP, las facetas, el
 * sitemap y las tablas del Admin con un catálogo del tamaño de uno real. El ERP
 * del piloto tiene 9032 filas, pero depende de credenciales de un cliente y de
 * un proxy, y este repositorio es público: un catálogo sintético es
 * reproducible, no depende de nadie y no publica datos de nadie.
 *
 * Los ids derivados quedan dentro de la misma familia de uuids, así que
 * `--limpiar` los borra igual. El SKU y el handle llevan el sufijo porque son
 * únicos por tienda: sin él, la segunda copia choca contra la primera.
 */
const products: ProductoDummy[] =
  cantidad <= base.length
    ? base
    : Array.from({ length: cantidad }, (_, i) => {
        const original = base[i % base.length]!;
        const copia = Math.floor(i / base.length);
        if (copia === 0) return original;
        return {
          ...original,
          // Deja lugar para 999 copias de 194: 193.806 productos, muy por encima
          // de cualquier catálogo que este sistema tenga que aguantar.
          id: original.id + copia * 1000,
          title: `${original.title} ${copia + 1}`,
          sku: `${original.sku}-${copia + 1}`,
        };
      });

if (products.length !== base.length) {
  console.log(`Sintetizando ${products.length} a partir de ${base.length} originales`);
}

// ---------------------------------------------------------------------------
// Traducción al modelo del catálogo
// ---------------------------------------------------------------------------

/**
 * Dólares a guaraníes, redondeado a la centena.
 *
 * La cotización está fija a propósito: es dato de prueba, y una tasa real
 * traería una dependencia de red más para que los precios queden igual de
 * inventados. El redondeo es para que se lean como precios y no como
 * conversiones — «Gs. 73.000», no «Gs. 72.927».
 */
const COTIZACION = 7300;
function aGuaranies(usd: number): number {
  return Math.round((usd * COTIZACION) / 100) * 100;
}

/** Lo que la URL de un producto va a mostrar. Sin acentos ni símbolos. */
function slug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const CACHE_DIMENSIONES = new Map<string, { width: number; height: number }>();

async function medir(urlImagen: string): Promise<{ width: number; height: number }> {
  const guardado = CACHE_DIMENSIONES.get(urlImagen);
  if (guardado) return guardado;

  try {
    const res = await fetch(urlImagen);
    const buf = Buffer.from(await res.arrayBuffer());
    const dims = dimensionesWebp(buf) ?? { width: 1000, height: 1000 };
    CACHE_DIMENSIONES.set(urlImagen, dims);
    return dims;
  } catch {
    // Una imagen que no se puede medir igual se guarda: el cuadrado por defecto
    // es lo que sirve dummyjson, y perder el producto entero por eso sería peor.
    return { width: 1000, height: 1000 };
  }
}

// Las categorías salen de los productos que se trajeron, no de la lista
// completa: sembrar veinticuatro categorías vacías llenaría la navegación de
// callejones sin salida.
const categorias = [...new Set(products.map((p) => p.category))].sort();
const idDeCategoria = new Map(categorias.map((c, i) => [c, uuid(4, i)]));

/** «mens-shirts» → «Mens shirts». No hay nombre lindo en el origen. */
function nombreDeCategoria(slugCategoria: string): string {
  const texto = slugCategoria.replace(/-/g, ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const filasCategorias = categorias.map((c, i) => ({
  id: uuid(4, i),
  tenant_id: IDS.tenant,
  store_id: IDS.store,
  name: nombreDeCategoria(c),
  slug: `dummy-${c}`,
  position: 100 + i,
  image: null,
}));

console.log(`Midiendo ${products.length} imágenes`);

const filasProductos = [];
const filasVariantes = [];
const filasMedia = [];
const filasInventario = [];

for (const [i, p] of products.entries()) {
  const precio = aGuaranies(p.price);
  // `discountPercentage` es el descuento ya aplicado, así que el precio de lista
  // es el actual inflado por ese porcentaje. Sin descuento no hay precio anterior:
  // un «antes» igual al «ahora» es publicidad engañosa, no un dato.
  const anterior =
    p.discountPercentage > 0
      ? Math.round(precio / (1 - p.discountPercentage / 100) / 100) * 100
      : null;

  filasProductos.push({
    id: uuid(0, p.id),
    tenant_id: IDS.tenant,
    store_id: IDS.store,
    handle: `${slug(p.title)}-${p.id}`,
    title: p.title,
    description: p.description,
    brand: p.brand ?? null,
    category_id: idDeCategoria.get(p.category) ?? null,
    status: 'active',
    created_at: new Date(Date.UTC(2026, 1, 1) + i * 60_000).toISOString(),
  });

  // Una variante por producto: dummyjson no trae variantes, y fabricar talles
  // que el origen no tiene sería inventar datos. Va sin atributos, que es el
  // caso que la Fase 5 dejó funcionando —antes un producto así era invendible—
  // y que el catálogo de demostración no ejercita porque todos los suyos tienen.
  filasVariantes.push({
    id: uuid(1, p.id),
    tenant_id: IDS.tenant,
    product_id: uuid(0, p.id),
    sku: p.sku,
    barcode: null,
    title: 'Única',
    position: 0,
    price: precio,
    currency: 'PYG',
    compare_at_price: anterior,
    cost: null,
    attributes: {},
  });

  filasInventario.push({
    id: uuid(2, p.id),
    tenant_id: IDS.tenant,
    variant_id: uuid(1, p.id),
    location_id: IDS.location,
    available: p.stock,
  });

  const imagenes = p.images.length > 0 ? p.images : [p.thumbnail];
  for (const [j, urlImagen] of imagenes.entries()) {
    const { width, height } = await medir(urlImagen);
    filasMedia.push({
      id: uuid(3, p.id * 10 + j),
      tenant_id: IDS.tenant,
      product_id: uuid(0, p.id),
      url: urlImagen,
      alt: p.title,
      width,
      height,
      position: j,
    });
  }
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

async function upsert(tabla: string, filas: readonly unknown[]): Promise<void> {
  if (filas.length === 0) return;
  // De a lotes: un upsert de mil filas de media en una sola petición se corta.
  for (let i = 0; i < filas.length; i += 200) {
    const { error } = await db
      .from(tabla)
      // @ts-expect-error — el seed escribe filas genéricas, como `seed-demo.ts`.
      .upsert(filas.slice(i, i + 200));
    if (error) throw new Error(`No se pudo sembrar ${tabla}: ${error.message}`);
  }
  console.log(`  ${tabla}: ${filas.length}`);
}

// Los medios y el inventario del producto se reemplazan enteros: si dummyjson
// devuelve menos imágenes que la vez anterior, un upsert dejaría las viejas.
const medios = rango(3);
await db.from('product_media').delete().gte('id', medios.desde).lt('id', medios.hasta);

await upsert('categories', filasCategorias);
await upsert('products', filasProductos);
await upsert('product_variants', filasVariantes);
await upsert('product_media', filasMedia);
await upsert('inventory_levels', filasInventario);

console.log(`\nListo: ${filasProductos.length} productos en ${filasCategorias.length} categorías.`);
console.log('Para quitarlos: pnpm seed:dummy --limpiar');
