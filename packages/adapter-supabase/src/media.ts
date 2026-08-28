import type { PickSupabaseClient } from './client.ts';

/**
 * Imágenes de producto en almacenamiento propio.
 *
 * El bucket `product-media` es público —el catálogo se ve sin credenciales, y
 * firmar cada URL obligaría a renovarlas en cada render— pero **escribir** exige
 * `catalog.write` sobre el tenant, y eso lo impone una política de Storage, no
 * este código.
 *
 * La convención del path es la política: `{tenant_id}/{lo que sea}`. El primer
 * directorio *es* el tenant, y la política lo castea a uuid antes de comprobar
 * el permiso. Un path que no la respete no falla la comprobación: falla el
 * casteo, que es un rechazo más difícil de eludir.
 *
 * Tener un host propio y estable es además lo que hace optimizables las
 * imágenes: `image.remotePatterns` del storefront autoriza hosts, y una URL
 * pegada a mano nunca va a estar en esa lista (ADR-079).
 */

const BUCKET = 'product-media';

/** Extensión a partir del tipo, no del nombre: el nombre lo elige quien sube. */
const EXTENSION: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

export async function subirImagenDeProducto(
  db: PickSupabaseClient,
  tenantId: string,
  archivo: File,
): Promise<{ url: string }> {
  const extension = EXTENSION[archivo.type];
  if (!extension) {
    throw new Error(`Ese tipo de archivo no se admite: ${archivo.type || 'desconocido'}`);
  }

  const ruta = `${tenantId}/${crypto.randomUUID()}.${extension}`;

  const { error } = await db.storage.from(BUCKET).upload(ruta, archivo, {
    contentType: archivo.type,
    // Sin sobrescribir: el nombre es un uuid nuevo, así que un choque sería un
    // síntoma de otra cosa y es mejor que se note.
    upsert: false,
  });

  if (error) throw new Error(`No se pudo subir la imagen: ${error.message}`);

  const { data } = db.storage.from(BUCKET).getPublicUrl(ruta);
  return { url: data.publicUrl };
}
