/**
 * Lo que conviene mirar de un modelo antes de que la tienda lo muestre (ADR-162):
 * un producto sin el valor que los distingue se ve sin él en la ficha, y dos con
 * el mismo no se distinguen.
 */
export function avisosDelModelo(
  items: readonly { readonly title: string; readonly value?: string }[],
  eje: string | null,
): string[] {
  if (items.length === 0) return [];
  if (!eje) return ['Elegí por qué se diferencian: es lo que se muestra en la ficha.'];

  const avisos: string[] = [];
  const sinValor = items.filter((p) => !p.value);
  if (sinValor.length === 1) {
    avisos.push(`«${sinValor[0]!.title}» no tiene ${eje}: en la ficha se ve sin él.`);
  } else if (sinValor.length > 1) {
    avisos.push(`${sinValor.length} productos no tienen ${eje}: en la ficha se ven sin él.`);
  }

  const cuantos = new Map<string, number>();
  for (const p of items) if (p.value) cuantos.set(p.value, (cuantos.get(p.value) ?? 0) + 1);
  const repetidos = [...cuantos].filter(([, n]) => n > 1).map(([v]) => v);
  if (repetidos.length > 0) {
    avisos.push(
      `Hay más de un producto con ${eje} ${repetidos.join(', ')}: en la ficha no se distinguen.`,
    );
  }
  return avisos;
}
