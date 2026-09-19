/**
 * El lote de limpieza de fondos, orquestado desde el navegador (ADR-130).
 *
 * Una imagen por pedido al Worker del Admin, que es el único con la clave
 * maestra: no hace falta un script de Node, que no tendría cómo descifrarla. Y
 * como cada imagen puede tardar hasta dos minutos, el lote informa su progreso y
 * **sigue después de un error**: que una foto falle no puede tirar abajo las
 * noventa y nueve restantes.
 *
 * Las operaciones entran por parámetro para poder probar esto sin red.
 */

/** Cuántas imágenes por tanda. El comercio paga cada una con su clave. */
export const TOPE_POR_TANDA = 100;

/**
 * Cuántas a la vez. Dos y no diez: cada una es una edición de imagen en la
 * cuenta del comercio, y OpenAI limita por minuto. Con dos, cien fotos entran
 * en una sesión sin arriesgar un 429 a mitad de camino.
 */
export const EN_PARALELO = 2;

export interface FotoPendiente {
  readonly productId: string;
  readonly title: string;
  readonly url: string;
}

export interface OperacionesDeLimpieza {
  /** Pide la foto limpia a la IA. */
  limpiar(url: string): Promise<File>;
  /** Sube el resultado a la carpeta de la IA y devuelve su URL. */
  subir(archivo: File): Promise<string>;
  /** Deja la propuesta pendiente de revisión. */
  proponer(productId: string, urls: { original: string; propuesta: string }): Promise<void>;
}

export interface ResultadoDeLimpieza {
  readonly hechas: number;
  /** Una línea por foto que falló, con el título para poder ubicarla. */
  readonly errores: readonly { readonly title: string; readonly motivo: string }[];
}

/**
 * Limpia el fondo de cada foto y deja una propuesta por producto.
 *
 * `onProgreso` se llama después de cada una, terminada bien o mal: sin eso, una
 * tanda de cien es una pantalla quieta durante veinte minutos.
 */
export async function limpiarFondosEnLote(
  fotos: readonly FotoPendiente[],
  operaciones: OperacionesDeLimpieza,
  onProgreso?: (hechas: number, total: number) => void,
): Promise<ResultadoDeLimpieza> {
  const tanda = fotos.slice(0, TOPE_POR_TANDA);
  const errores: { title: string; motivo: string }[] = [];
  let hechas = 0;
  let siguiente = 0;

  async function trabajar(): Promise<void> {
    while (siguiente < tanda.length) {
      const foto = tanda[siguiente++]!;
      try {
        const limpia = await operaciones.limpiar(foto.url);
        const propuesta = await operaciones.subir(limpia);
        await operaciones.proponer(foto.productId, { original: foto.url, propuesta });
      } catch (causa) {
        errores.push({ title: foto.title, motivo: (causa as Error).message });
      } finally {
        hechas++;
        onProgreso?.(hechas, tanda.length);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(EN_PARALELO, tanda.length) }, trabajar));

  return { hechas: hechas - errores.length, errores };
}
