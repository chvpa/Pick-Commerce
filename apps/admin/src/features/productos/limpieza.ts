import { enLote, type ResultadoDelLote } from './lote.ts';

/**
 * El lote de limpieza de fondos (ADR-130).
 *
 * Una imagen por pedido al Worker del Admin, que es el único con la clave
 * maestra: no hace falta un script de Node, que no tendría cómo descifrarla.
 *
 * El recorrido —tope, concurrencia, progreso, seguir tras un error— se mudó a
 * `lote.ts` cuando las descripciones necesitaron el mismo: era la forma de una
 * tanda con IA y no la de las fotos. Acá quedan las tres operaciones que hacen
 * que esta tanda sea la de los fondos.
 */

export { EN_PARALELO, TOPE_POR_TANDA } from './lote.ts';
export type { ResultadoDelLote as ResultadoDeLimpieza } from './lote.ts';

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

/** Limpia el fondo de cada foto y deja una propuesta por producto. */
export function limpiarFondosEnLote(
  fotos: readonly FotoPendiente[],
  operaciones: OperacionesDeLimpieza,
  onProgreso?: (hechas: number, total: number) => void,
): Promise<ResultadoDelLote> {
  return enLote(
    fotos,
    async (foto) => {
      const limpia = await operaciones.limpiar(foto.url);
      const propuesta = await operaciones.subir(limpia);
      await operaciones.proponer(foto.productId, { original: foto.url, propuesta });
    },
    (foto) => foto.title,
    onProgreso,
  );
}
