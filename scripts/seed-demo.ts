import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { clienteDeServidor } from '@pick/adapter-supabase';
import {
  ATRIBUTOS,
  CATEGORIAS,
  COLECCIONES,
  SECCIONES,
  PIEZAS,
  COLECCION_PRODUCTOS,
  CONFIGURACION,
  IDS,
  INVENTARIO,
  MEDIA,
  ORGANIZACION,
  PRODUCTOS,
  SUCURSAL,
  TIENDA,
  VARIANTES,
} from './seed-data.ts';

/**
 * Siembra el catálogo de demostración.
 *
 * Idempotente: todo va por `upsert` con claves primarias fijas, así que correrlo
 * dos veces no duplica nada. **No borra**: un producto creado a mano en el
 * proyecto de desarrollo sobrevive, aunque puede alterar los conteos de los
 * tests locales. El entorno hermético del CI es el que manda.
 *
 * Usa la secret key porque siembra datos de varias organizaciones y no hay un
 * usuario detrás; es el mismo camino que usará el sync del ERP.
 */

if (existsSync('.env')) process.loadEnvFile('.env');

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !secretKey) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY.');
  console.error('En local salen de .env; en CI, del stack de Supabase del runner.');
  process.exit(1);
}

const db = clienteDeServidor({ url, secretKey });

async function upsert(tabla: string, filas: readonly unknown[], onConflict?: string) {
  if (filas.length === 0) return;
  const { error } = await db
    .from(tabla)
    // @ts-expect-error — el seed escribe filas genéricas; la forma la fija seed-data.
    .upsert(filas, onConflict ? { onConflict } : undefined);
  if (error) throw new Error(`No se pudo sembrar ${tabla}: ${error.message}`);
  console.log(`  ${tabla}: ${filas.length}`);
}

console.log(`Sembrando en ${url}`);

/**
 * Sube las imágenes de la demo al bucket propio y devuelve dónde quedaron.
 *
 * Viven en `apps/demo/public/products/`, y desde ahí **Astro nunca las
 * optimiza**: las de `public/` se sirven tal cual, así que el catálogo emitía un
 * `srcset` de ocho candidatos apuntando todos al mismo archivo (ADR-079). En el
 * bucket tienen un host que el storefront autoriza, y ahí sí se redimensionan.
 *
 * De paso arregla las miniaturas del Admin: una ruta relativa no resuelve desde
 * su dominio, una URL absoluta sí.
 *
 * Idempotente con `upsert`. Si el bucket no existe —un stack local sin la
 * migración— se avisa y se siguen usando las rutas relativas: el seed no es el
 * lugar donde romper por una imagen.
 */
const ORIGEN_IMAGENES = 'apps/demo/public/products';
const BUCKET = 'product-media';

const TIPOS: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

async function subirImagenes(): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (!existsSync(ORIGEN_IMAGENES)) return mapa;

  for (const nombre of readdirSync(ORIGEN_IMAGENES)) {
    const tipo = TIPOS[extname(nombre).toLowerCase()];
    if (!tipo) continue;

    const ruta = `${IDS.tenant}/seed/${nombre}`;
    const contenido = readFileSync(join(ORIGEN_IMAGENES, nombre));

    const { error } = await db.storage.from(BUCKET).upload(ruta, contenido, {
      contentType: tipo,
      upsert: true,
    });
    if (error) {
      console.warn(`  no se pudo subir ${nombre}: ${error.message}`);
      continue;
    }

    const { data } = db.storage.from(BUCKET).getPublicUrl(ruta);
    mapa.set(`/products/${nombre}`, data.publicUrl);
  }

  if (mapa.size > 0) console.log(`  imágenes subidas: ${mapa.size}`);
  return mapa;
}

const imagenes = await subirImagenes();

/** Cambia una ruta relativa por la del bucket, si se subió. */
function resolver(url: string): string {
  return imagenes.get(url) ?? url;
}

const CATEGORIAS_CON_URL = CATEGORIAS.map((c) => ({
  ...c,
  image: c.image ? { ...c.image, url: resolver(c.image.url) } : c.image,
}));

const MEDIA_CON_URL = MEDIA.map((m) => ({ ...m, url: resolver(m.url) }));

// El orden importa: cada tabla referencia a las anteriores.
await upsert('organizations', [ORGANIZACION]);
await upsert('stores', [TIENDA]);
await upsert('locations', [SUCURSAL]);
await upsert('store_settings', [CONFIGURACION], 'store_id');
await upsert('categories', CATEGORIAS_CON_URL);
await upsert('attribute_definitions', ATRIBUTOS);
await upsert('products', PRODUCTOS);
await upsert('product_variants', VARIANTES);
await upsert('product_media', MEDIA_CON_URL);
await upsert('inventory_levels', INVENTARIO);
await upsert('collections', COLECCIONES);
await upsert('collection_products', COLECCION_PRODUCTOS, 'collection_id,product_id');
// La portada: las secciones antes que sus piezas, que cuelgan de ellas.
await upsert('home_sections', SECCIONES);
await upsert('banners', PIEZAS);

console.log('Seed ok.');
