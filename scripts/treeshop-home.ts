import { existsSync } from 'node:fs';
import { clienteDeServidor } from '@pick/adapter-supabase';

/**
 * Arma la portada de Treeshop.
 *
 *   pnpm treeshop:home
 *
 * Siembra las **secciones** de la home y la colección que alimenta el carrusel.
 * No dibuja nada: a partir de acá la portada se administra desde el Admin, que
 * es lo que la Fase 9 hizo posible. Este script existe para el arranque, no para
 * mantenerla.
 *
 * **Dos secciones quedan sin imágenes a propósito**: el hero y los avisos de
 * marca esperan el arte del cliente. Se crean igual y publicadas, porque una
 * sección que existe y está vacía es una casilla que alguien puede llenar desde
 * el Admin; una que no existe hay que saber que hay que crearla. El storefront
 * no dibuja una sección sin piezas, así que mientras tanto no se ve nada roto.
 *
 * Idempotente: los ids se derivan de un prefijo fijo, así que repetirlo
 * actualiza en su lugar.
 */

if (existsSync('.env')) process.loadEnvFile('.env');

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY.');
  process.exit(1);
}

const db = clienteDeServidor({ url, secretKey });

/** Ids fijos, para que repetir el script actualice en vez de duplicar. */
const ID = {
  heroSeccion: '77ee5000-0000-4000-8000-000000000001',
  categoriasSeccion: '77ee5000-0000-4000-8000-000000000002',
  trendySeccion: '77ee5000-0000-4000-8000-000000000003',
  marcasSeccion: '77ee5000-0000-4000-8000-000000000004',
  trendyColeccion: '77ee5000-0000-4000-8000-000000000005',
} as const;

async function main(): Promise<number> {
  const { data: org } = await db
    .from('organizations')
    .select('id')
    .eq('slug', 'treeshop')
    .maybeSingle();
  if (!org) {
    console.error('No existe la organización «treeshop».');
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
    console.error('La organización «treeshop» no tiene tienda.');
    return 1;
  }
  const STORE = tienda.id;

  // -------------------------------------------------------------------------
  // La colección del carrusel
  // -------------------------------------------------------------------------

  /*
   * «En trendy» es una colección **dinámica** sin reglas —todo el catálogo—
   * ordenada por novedad: el carrusel muestra lo último que Camelot cargó, y se
   * mueve solo cada vez que entra mercadería. Antes era una lista a mano con los
   * doce primeros por orden de importación, que no eran los últimos de nada.
   * El comercio puede cambiarla desde el Admin, incluso volverla manual.
   */
  const { error: errorColeccion } = await db.from('collections').upsert({
    id: ID.trendyColeccion,
    tenant_id: TENANT,
    store_id: STORE,
    title: 'En trendy',
    handle: 'en-trendy',
    subtitle: 'Lo último que llegó',
    published: true,
    rules: {},
    sort: 'newest',
  });
  if (errorColeccion) throw new Error(`collections: ${errorColeccion.message}`);
  // La lista a mano de la versión anterior sobra en una colección dinámica.
  await db.from('collection_products').delete().eq('collection_id', ID.trendyColeccion);
  const elegidos: { id: string }[] = [];

  // -------------------------------------------------------------------------
  // Las categorías que van en la portada
  // -------------------------------------------------------------------------

  const { data: cats } = await db
    .from('categories')
    .select('id, slug')
    .eq('store_id', STORE);
  const porSlug = new Map((cats ?? []).map((c) => [c.slug, c.id]));

  /*
   * Tres, y en este orden. «Ropa interior» existe en el catálogo y no en la
   * portada: es una decisión del comercio, guardada, no un filtro del código.
   */
  const categoryIds = ['prendas', 'calzados', 'accesorios']
    .map((s) => porSlug.get(s))
    .filter((id): id is string => Boolean(id));

  // -------------------------------------------------------------------------
  // Las secciones
  // -------------------------------------------------------------------------

  const secciones = [
    {
      id: ID.heroSeccion,
      tenant_id: TENANT,
      store_id: STORE,
      type: 'hero',
      // Sin piezas todavía: el arte lo carga el comercio desde el Admin.
      layout: 'slider',
      settings: {},
      position: 0,
      published: true,
    },
    {
      id: ID.categoriasSeccion,
      tenant_id: TENANT,
      store_id: STORE,
      type: 'categories',
      title: 'Elegí por dónde empezar',
      layout: 'static',
      // Vacío significaría «todas», que serían cuatro. Acá van tres, ordenadas.
      settings: { categoryIds },
      position: 1,
      published: true,
    },
    {
      id: ID.trendySeccion,
      tenant_id: TENANT,
      store_id: STORE,
      type: 'products',
      title: 'En trendy',
      subtitle: 'Lo que se está llevando ahora',
      layout: 'slider',
      settings: {},
      collection_id: ID.trendyColeccion,
      position: 2,
      published: true,
    },
    {
      id: ID.marcasSeccion,
      tenant_id: TENANT,
      store_id: STORE,
      type: 'tiles',
      title: 'Las marcas',
      layout: 'slider',
      // Dos a la vista, deslizando. Tres avisos no entran cómodos en pantalla.
      settings: { columns: 2 },
      position: 3,
      published: true,
    },
  ];

  const { error: errorSecciones } = await db.from('home_sections').upsert(secciones);
  if (errorSecciones) throw new Error(`home_sections: ${errorSecciones.message}`);

  console.log('Portada de Treeshop');
  console.log(`  hero          slider, sin piezas (esperando el arte)`);
  console.log(`  categorías    ${categoryIds.length}: prendas, calzados, accesorios`);
  console.log(`  «En trendy»   dinámica, por novedad (${elegidos.length} a mano)`);
  console.log(`  marcas        slider de 2, sin piezas (esperando el arte)`);
  console.log('\nLas dos secciones vacías se llenan desde el Admin → Contenido.');
  return 0;
}

process.exitCode = await main();
