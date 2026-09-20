import { existsSync } from 'node:fs';
import { clienteDeServidor } from '@pick/adapter-supabase';

/**
 * Borra las vistas de página de rutas que el sitio nunca sirvió.
 *
 *     pnpm analytics:limpiar --tienda treeshop [--dry-run]
 *
 * Desde que `cuentaComoVista` mira el estado de la respuesta, esto no vuelve a
 * ensuciarse. Lo que queda es lo que ya está escrito, y no es poco: medido sobre
 * el piloto, **3823 de 6192 vistas eran de rutas inexistentes** y 1339 de 3278
 * sesiones no habían tocado una sola página real. `/wp-admin/install.php` sola
 * daba 584 sesiones, una por petición, porque un escáner no guarda cookies.
 *
 * Las sesiones no se borran porque no son una tabla: `admin_analytics` las
 * cuenta como `count(distinct session_id)` sobre los eventos, así que una que se
 * queda sin filas deja de contar sola.
 *
 * Se acota a `page_view`. Los otros nueve tipos de evento los anota una página
 * que ya se sirvió, así que no pueden tener este problema.
 */

if (existsSync('.env')) process.loadEnvFile('.env');

const args = process.argv.slice(2);
const opcion = (nombre: string): string | undefined => {
  const i = args.indexOf(`--${nombre}`);
  return i === -1 ? undefined : args[i + 1];
};

const slug = opcion('tienda');
const dryRun = args.includes('--dry-run');

if (!slug) {
  console.error('Uso: pnpm analytics:limpiar --tienda <slug> [--dry-run]');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en el .env.');
  process.exit(1);
}

const db = clienteDeServidor({ url, secretKey });

/**
 * Las rutas que el storefront sirve de verdad.
 *
 * Lista blanca y no negra, al revés que el filtro de bots, y por el motivo
 * contrario: allá un bot que se escapa es barato y perder un navegador nuevo es
 * caro; acá lo que se está por hacer es **borrar**, así que dejar de más es el
 * error barato. Una ruta nueva que no esté en esta lista sobrevive a la purga;
 * si estuviera invertida, desaparecería sin que nadie se entere.
 */
const RUTAS_REALES = [
  /^\/$/,
  /^\/catalogo\/?$/,
  /^\/carrito\/?$/,
  /^\/checkout(\/|$)/,
  /^\/productos\//,
  /^\/cuenta(\/|$)/,
  /^\/politicas\/?$/,
  /^\/preguntas-frecuentes\/?$/,
  /^\/colecciones\//,
  /^\/404\/?$/,
];

const esReal = (ruta: string): boolean => RUTAS_REALES.some((r) => r.test(ruta));

async function main(): Promise<number> {
  const { data: org } = await db.from('organizations').select('id').eq('slug', slug).maybeSingle();
  if (!org) {
    console.error(`No existe la organización «${slug}».`);
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
    console.error(`La organización «${slug}» no tiene ninguna tienda.`);
    return 1;
  }

  console.log(`Tienda: ${tienda.name}\n`);

  // Paginado: PostgREST corta en 1000 y no avisa (ADR-111).
  const vistas: { id: number; path: string; session_id: string }[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await db
      .from('store_events')
      .select('id, path, session_id')
      .eq('store_id', tienda.id)
      .eq('type', 'page_view')
      .order('id', { ascending: true })
      .range(desde, desde + 999);
    if (error) throw new Error(`store_events: ${error.message}`);
    vistas.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }

  const basura = vistas.filter((v) => !esReal(v.path ?? ''));

  const porRuta = new Map<string, number>();
  for (const v of basura) porRuta.set(v.path, (porRuta.get(v.path) ?? 0) + 1);

  console.log(`Vistas de página: ${vistas.length}`);
  console.log(`  de rutas reales:      ${vistas.length - basura.length}`);
  console.log(`  de rutas que no existen: ${basura.length}\n`);

  if (basura.length === 0) {
    console.log('No hay nada que borrar.');
    return 0;
  }

  console.log('Lo que se borraría, por ruta:');
  for (const [ruta, n] of [...porRuta].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`  ${String(n).padStart(5)}  ${ruta}`);
  }
  if (porRuta.size > 20) console.log(`  … y ${porRuta.size - 20} rutas más`);

  /*
   * Cuántas sesiones se van con esto: las que **sólo** tenían basura. Es el
   * número que mueve el denominador de la conversión, así que es el que hay que
   * ver antes de decidir.
   */
  const conAlgoReal = new Set(vistas.filter((v) => esReal(v.path ?? '')).map((v) => v.session_id));
  const sesionesQueSeVan = new Set(
    basura.map((v) => v.session_id).filter((s) => !conAlgoReal.has(s)),
  );
  console.log(`\nSesiones que dejan de existir: ${sesionesQueSeVan.size}`);

  if (dryRun) {
    console.log('\nDry run: no se borró nada.');
    return 0;
  }

  // De a mil, que es el tope de un `in` que entra en la URL de PostgREST.
  let borradas = 0;
  for (let i = 0; i < basura.length; i += 500) {
    const ids = basura.slice(i, i + 500).map((v) => v.id);
    const { error } = await db.from('store_events').delete().in('id', ids);
    if (error) throw new Error(`no se pudieron borrar: ${error.message}`);
    borradas += ids.length;
    console.log(`  ${borradas} de ${basura.length}`);
  }

  console.log(`\nListo: ${borradas} vistas borradas.`);
  return 0;
}

// `process.exitCode` y no `process.exit()`: con un cliente de Supabase abierto,
// salir a la fuerza dispara una aserción de libuv en Windows.
process.exitCode = await main();
