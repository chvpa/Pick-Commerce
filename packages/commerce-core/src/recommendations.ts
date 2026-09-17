/**
 * Cuánto pesa cada señal en una recomendación.
 *
 * **Contar, no entrenar** (ADR-127). Con el volumen de un comercio chico no hay
 * forma de evaluar un modelo y sí de explicar un peso: si mañana el dueño
 * pregunta por qué aparece algo, la respuesta es una frase —«doce personas lo
 * miraron en la misma visita que ése, y dos lo compraron juntos»— y no «lo dice
 * el modelo».
 *
 * Los mismos dos números son los defaults de `recompute_affinity`, que es donde
 * se aplican de verdad; pasarlos desde acá es lo que evita que se separen, y un
 * test de la suite de aislamiento comprueba que coinciden.
 */
export const PESOS_DE_AFINIDAD = {
  /** Mirar dos productos en la misma visita. */
  coVista: 1,
  /**
   * Comprarlos en el mismo pedido. Vale cinco veces más que mirarlos: mirar es
   * curiosidad y pagar es una decisión, y las compras son mucho más escasas —sin
   * esta diferencia, una co-compra no movería nunca el orden.
   */
  coCompra: 5,
} as const;

/** El puntaje de un par, que es lo único que decide el orden de una tira. */
export function puntajeDeAfinidad(coVistas: number, coCompras: number): number {
  return coVistas * PESOS_DE_AFINIDAD.coVista + coCompras * PESOS_DE_AFINIDAD.coCompra;
}
