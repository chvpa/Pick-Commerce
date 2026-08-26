import { existsSync } from 'node:fs';
import { clienteDeServidor } from '@pick/adapter-supabase';
import {
  ATRIBUTOS,
  CATEGORIAS,
  COLECCIONES,
  COLECCION_PRODUCTOS,
  CONFIGURACION,
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
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? 'no-usada';

if (!url || !secretKey) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY.');
  console.error('En local salen de .env; en CI, del stack de Supabase del runner.');
  process.exit(1);
}

const db = clienteDeServidor({ url, secretKey, publishableKey });

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

// El orden importa: cada tabla referencia a las anteriores.
await upsert('organizations', [ORGANIZACION]);
await upsert('stores', [TIENDA]);
await upsert('locations', [SUCURSAL]);
await upsert('store_settings', [CONFIGURACION], 'store_id');
await upsert('categories', CATEGORIAS);
await upsert('attribute_definitions', ATRIBUTOS);
await upsert('products', PRODUCTOS);
await upsert('product_variants', VARIANTES);
await upsert('product_media', MEDIA);
await upsert('inventory_levels', INVENTARIO);
await upsert('collections', COLECCIONES);
await upsert('collection_products', COLECCION_PRODUCTOS, 'collection_id,product_id');

console.log('Seed ok.');
