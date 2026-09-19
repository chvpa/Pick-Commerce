import { existsSync } from 'node:fs';
import { clienteDeServidor } from '@pick/adapter-supabase';
import { dimensionesWebp } from './dimensiones.ts';

/**
 * Trae las fotos de los productos importados del ERP.
 *
 *   pnpm erp:imagenes --tienda estilosport [--limite 100]
 *
 * **El ERP no tiene imágenes.** El payload del ORDS son once campos y ninguno
 * es una URL, así que las fotos salen del proyecto Supabase de la tienda actual
 * del cliente, que es donde se cargaron a mano.
 *
 * El cruce es por el código del ERP, que los dos proyectos guardan en la
 * variante: `product_variants.internal_code`. Es el `codigo` de Oracle.
 *
 * Las imágenes se **copian** al bucket propio en vez de referenciarse. Apuntar
 * al bucket ajeno dejaría el catálogo colgando de un proyecto que no
 * controlamos, y además no se optimizarían: `image.remotePatterns` autoriza
 * `product-media`, no `product-images` (ADR-082).
 *
 * Idempotente: la ruta de destino se deriva del código y la posición, así que
 * repetirlo sobrescribe en el mismo lugar en vez de acumular copias.
 */

if (existsSync('.env')) process.loadEnvFile('.env');

const args = process.argv.slice(2);
function opcion(nombre: string): string | undefined {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] : undefined;
}

const slugTienda = opcion('tienda');
const limite = Number(opcion('limite') ?? 0);

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const origenUrl = process.env.TEST_SUPABASE_URL;
const origenKey = process.env.TEST_SUPABASE_ANON_KEY;

if (!slugTienda) {
  console.error('Uso: pnpm erp:imagenes --tienda <slug> [--limite N]');
  process.exit(1);
}
if (!url || !secretKey) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY.');
  process.exit(1);
}
if (!origenUrl || !origenKey) {
  console.error('Faltan TEST_SUPABASE_URL y TEST_SUPABASE_ANON_KEY (el proyecto de origen).');
  process.exit(1);
}

const db = clienteDeServidor({ url, secretKey });
const BUCKET = 'product-media';

/** Lee del proyecto de origen con su clave pública. Sólo select. */
async function origen<T>(consulta: string): Promise<T[]> {
  const res = await fetch(`${origenUrl}/rest/v1/${consulta}`, {
    headers: { apikey: origenKey!, Authorization: `Bearer ${origenKey!}` },
  });
  if (!res.ok) throw new Error(`El proyecto de origen respondió ${res.status}`);
  return (await res.json()) as T[];
}

async function main(): Promise<number> {
  const { data: org } = await db
    .from('organizations')
    .select('id')
    .eq('slug', slugTienda!)
    .maybeSingle();
  if (!org) {
    console.error(`No existe la organización «${slugTienda}».`);
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
    console.error('La organización no tiene tienda.');
    return 1;
  }

  const consulta = db
    .from('products')
    .select('id, title, product_variants(internal_code)')
    .eq('store_id', tienda.id)
    .order('sku');

  const { data: productos, error } = await (limite > 0 ? consulta.limit(limite) : consulta);
  if (error || !productos) {
    console.error(`No se pudo leer el catálogo: ${error?.message}`);
    return 1;
  }

  console.log(`Tienda    ${tienda.name}`);
  console.log(`Productos ${productos.length} en el catálogo\n`);

  // ---------------------------------------------------------------------------
  // Cruce contra el proyecto de origen
  // ---------------------------------------------------------------------------

  // El código del ERP vive en las variantes; todas las de un modelo lo
  // comparten en este ERP, así que la primera alcanza.
  const codigoDeProducto = new Map<string, string>();
  for (const p of productos) {
    const codigo = (p.product_variants ?? []).map((v) => v.internal_code).find(Boolean);
    if (codigo) codigoDeProducto.set(p.id, codigo);
  }
  const codigos = [...new Set(codigoDeProducto.values())];
  const idAjenoPorCodigo = new Map<string, string>();

  for (let i = 0; i < codigos.length; i += 50) {
    const lote = codigos.slice(i, i + 50);
    const variantes = await origen<{ internal_code: string; product_id: string }>(
      `product_variants?select=internal_code,product_id&internal_code=in.(${lote.join(',')})`,
    );
    // Todas las tallas de un producto comparten el código, así que la primera
    // alcanza: la imagen es del producto, no de la variante.
    for (const v of variantes) {
      if (!idAjenoPorCodigo.has(v.internal_code)) {
        idAjenoPorCodigo.set(v.internal_code, v.product_id);
      }
    }
  }

  const idsAjenos = [...new Set(idAjenoPorCodigo.values())];
  const imagenesPorIdAjeno = new Map<string, { url: string; position: number }[]>();

  for (let i = 0; i < idsAjenos.length; i += 40) {
    const lote = idsAjenos.slice(i, i + 40);
    const imgs = await origen<{ product_id: string; url: string; position: number }>(
      `product_images?select=product_id,url,position&product_id=in.(${lote.join(',')})&order=position`,
    );
    for (const im of imgs) {
      const grupo = imagenesPorIdAjeno.get(im.product_id) ?? [];
      grupo.push({ url: im.url, position: im.position });
      imagenesPorIdAjeno.set(im.product_id, grupo);
    }
  }

  console.log(`Cruzan por internal_code: ${idAjenoPorCodigo.size} de ${productos.length}`);
  console.log(`Con al menos una foto   : ${imagenesPorIdAjeno.size}\n`);

  // ---------------------------------------------------------------------------
  // Copiar
  // ---------------------------------------------------------------------------

  const filasMedia: Record<string, unknown>[] = [];
  let copiadas = 0;
  let sinFoto = 0;
  const fallos: string[] = [];

  for (const producto of productos) {
    const idAjeno = idAjenoPorCodigo.get(codigoDeProducto.get(producto.id) ?? '');
    const fotos = idAjeno ? (imagenesPorIdAjeno.get(idAjeno) ?? []) : [];
    if (fotos.length === 0) {
      sinFoto++;
      continue;
    }

    for (const [i, foto] of fotos.entries()) {
      try {
        const res = await fetch(foto.url);
        if (!res.ok) throw new Error(`descarga HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());

        // Las dimensiones se leen del archivo. Inventarlas produce el salto de
        // layout que la columna existe para evitar (ADR-034).
        const dims = dimensionesWebp(buf);
        if (!dims) throw new Error('no se pudieron leer las dimensiones');

        // Ruta derivada, no aleatoria: repetir la corrida sobrescribe en el
        // mismo lugar en vez de dejar copias huérfanas en el bucket.
        const ruta = `${org.id}/erp/${producto.id}-${i}.webp`;
        const { error: errorSubida } = await db.storage
          .from(BUCKET)
          .upload(ruta, buf, { contentType: 'image/webp', upsert: true });
        if (errorSubida) throw new Error(errorSubida.message);

        const { data: publica } = db.storage.from(BUCKET).getPublicUrl(ruta);

        filasMedia.push({
          tenant_id: org.id,
          product_id: producto.id,
          url: publica.publicUrl,
          alt: producto.title,
          width: dims.width,
          height: dims.height,
          position: i,
        });
        copiadas++;
      } catch (e) {
        fallos.push(`${producto.title} #${i}: ${(e as Error).message}`);
      }
    }
  }

  console.log(`Imágenes copiadas al bucket propio: ${copiadas}`);
  console.log(`Productos sin foto en el origen   : ${sinFoto}`);
  if (fallos.length > 0) {
    console.log(`\nFallos (${fallos.length}):`);
    for (const f of fallos.slice(0, 10)) console.log(`  ${f}`);
  }

  if (filasMedia.length === 0) return fallos.length > 0 ? 1 : 0;

  /*
   * Se reemplazan las fotos **que trajo este importador** y nada más: si el
   * origen tiene menos fotos que la vez anterior, un upsert dejaría las viejas.
   *
   * Hasta la v2 Fase 5 borraba **todas** las filas de cada producto, incluidas
   * las que subió el comercio desde el Admin. Con la captura desde el teléfono
   * eso dejó de ser una hipótesis: una reimportación se habría llevado las
   * fotos que alguien sacó a mano. Es la regla de ADR-117, que Camelot ya
   * cumplía por ruta, y la misma convención de ADR-082: lo del ERP vive bajo
   * `/erp/`.
   *
   * Y el error del `delete` se revisa: antes se ignoraba, así que un fallo
   * dejaba las fotos viejas y las nuevas juntas sin avisar.
   */
  const tocados = [...new Set(filasMedia.map((f) => f.product_id as string))];
  for (let i = 0; i < tocados.length; i += 100) {
    const { error: errorBorrado } = await db
      .from('product_media')
      .delete()
      .in('product_id', tocados.slice(i, i + 100))
      .like('url', '%/erp/%');
    if (errorBorrado) {
      console.error(`No se pudieron reemplazar las fotos del ERP: ${errorBorrado.message}`);
      return 1;
    }
  }

  for (let i = 0; i < filasMedia.length; i += 200) {
    // @ts-expect-error — el script escribe filas genéricas, como los seeds.
    const { error: errorMedia } = await db
      .from('product_media')
      .insert(filasMedia.slice(i, i + 200));
    if (errorMedia) {
      console.error(`No se pudo escribir product_media: ${errorMedia.message}`);
      return 1;
    }
  }

  console.log(`\nListo: ${filasMedia.length} medios en ${tocados.length} productos.`);
  return fallos.length > 0 ? 1 : 0;
}

process.exitCode = await main();
