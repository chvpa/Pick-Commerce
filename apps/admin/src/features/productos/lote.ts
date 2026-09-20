/**
 * Una tanda de trabajo con IA, orquestada desde el navegador (ADR-130).
 *
 * Salió de la limpieza de fondos y ahora la comparte con las descripciones, que
 * es cuando se supo que la forma era general y no de las fotos: un tope por
 * tanda, dos a la vez, progreso después de cada ítem y **seguir después de un
 * error**. Que uno falle no puede tirar abajo los noventa y nueve restantes:
 * habría que empezar de nuevo y pagarle dos veces al comercio.
 *
 * El trabajo entra por parámetro para poder probar esto sin red.
 */

/** Cuántos por tanda. El comercio paga cada uno con su clave. */
export const TOPE_POR_TANDA = 100;

/**
 * Cuántos a la vez. Dos y no diez: cada uno es una llamada en la cuenta del
 * comercio, y OpenAI limita por minuto. Con dos, cien entran en una sesión sin
 * arriesgar un 429 a mitad de camino.
 */
export const EN_PARALELO = 2;

export interface ResultadoDelLote {
  readonly hechas: number;
  /** Una línea por ítem que falló, con el título para poder ubicarlo. */
  readonly errores: readonly { readonly title: string; readonly motivo: string }[];
}

/**
 * Corre `hacer` sobre cada ítem, de a `EN_PARALELO`, hasta el tope de la tanda.
 *
 * `onProgreso` se llama después de cada uno, terminado bien o mal: sin eso, una
 * tanda de cien es una pantalla quieta durante veinte minutos. Y cuenta también
 * los que fallaron, porque si no se quedaría clavada en «97 de 100» para
 * siempre.
 */
export async function enLote<T>(
  items: readonly T[],
  hacer: (item: T) => Promise<void>,
  titulo: (item: T) => string,
  onProgreso?: (hechas: number, total: number) => void,
): Promise<ResultadoDelLote> {
  const tanda = items.slice(0, TOPE_POR_TANDA);
  const errores: { title: string; motivo: string }[] = [];
  let hechas = 0;
  let siguiente = 0;

  async function trabajar(): Promise<void> {
    while (siguiente < tanda.length) {
      const item = tanda[siguiente++]!;
      try {
        await hacer(item);
      } catch (causa) {
        errores.push({ title: titulo(item), motivo: (causa as Error).message });
      } finally {
        hechas++;
        onProgreso?.(hechas, tanda.length);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(EN_PARALELO, tanda.length) }, trabajar));

  return { hechas: hechas - errores.length, errores };
}
