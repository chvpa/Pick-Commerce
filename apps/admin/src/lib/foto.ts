/**
 * Una foto del teléfono, lista para subir (v2 Fase 5).
 *
 * Una foto de teléfono pesa entre 3 y 8 MB y el bucket acepta 5 (ADR-082), y un
 * iPhone la saca en HEIC, que el bucket no acepta. Achicarla y recomprimirla en
 * el navegador resuelve las dos cosas antes de subir nada, y de paso la vitrina
 * no descarga 8 MB por tarjeta.
 *
 * **Es recorte de tamaño, no de contenido**: no se toca el encuadre ni el color.
 * Lo único que cambia son los píxeles de más.
 */

/** El lado más largo, en píxeles. Alcanza para la vitrina y para un zoom en el PDP. */
export const LADO_MAXIMO = 2048;

/** El tope del bucket `product-media`. */
export const PESO_MAXIMO = 5 * 1024 * 1024;

/** Las calidades que se prueban, de mejor a peor, hasta entrar en el tope. */
const CALIDADES = [0.85, 0.72, 0.6] as const;

/**
 * Las medidas a las que se achica, conservando la proporción.
 *
 * Una foto más chica que el tope no se agranda: agrandar no agrega detalle,
 * sólo peso.
 */
export function medidasObjetivo(
  ancho: number,
  alto: number,
  maximo = LADO_MAXIMO,
): { readonly ancho: number; readonly alto: number } {
  const escala = Math.min(1, maximo / Math.max(ancho, alto));
  return { ancho: Math.round(ancho * escala), alto: Math.round(alto * escala) };
}

/**
 * Codifica en WebP y, si el navegador no sabe, en JPEG.
 *
 * Safari históricamente devolvía PNG cuando se le pedía WebP a `toBlob` —un PNG
 * de una foto pesa varias veces más—, así que se mira el tipo que volvió en vez
 * de confiar en el que se pidió.
 */
async function codificar(canvas: HTMLCanvasElement, calidad: number): Promise<Blob> {
  const intentar = (tipo: string) =>
    new Promise<Blob | null>((resolver) => canvas.toBlob(resolver, tipo, calidad));

  const webp = await intentar('image/webp');
  if (webp && webp.type === 'image/webp') return webp;

  const jpeg = await intentar('image/jpeg');
  if (!jpeg) throw new Error('El navegador no pudo codificar la foto.');
  return jpeg;
}

export interface FotoNormalizada {
  readonly archivo: File;
  readonly width: number;
  readonly height: number;
}

/**
 * Achica y recomprime una foto hasta que entre en el bucket.
 *
 * `imageOrientation: 'from-image'` es lo que respeta la rotación que el teléfono
 * guarda en el EXIF: sin eso, una foto sacada en vertical sube acostada.
 */
export async function normalizarFoto(original: File): Promise<FotoNormalizada> {
  const bitmap = await createImageBitmap(original, { imageOrientation: 'from-image' });
  try {
    const { ancho, alto } = medidasObjetivo(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = alto;
    const contexto = canvas.getContext('2d');
    if (!contexto) throw new Error('El navegador no pudo procesar la foto.');
    contexto.drawImage(bitmap, 0, 0, ancho, alto);

    for (const calidad of CALIDADES) {
      const blob = await codificar(canvas, calidad);
      if (blob.size <= PESO_MAXIMO) {
        const extension = blob.type === 'image/webp' ? 'webp' : 'jpg';
        return {
          archivo: new File([blob], `foto.${extension}`, { type: blob.type }),
          width: ancho,
          height: alto,
        };
      }
    }

    throw new Error('La foto sigue pesando más de 5 MB. Probá sacarla de nuevo.');
  } finally {
    bitmap.close();
  }
}
