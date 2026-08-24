import type { ProductVariant } from '@pick/commerce-types';

/** Selección actual del usuario: nombre de atributo → valor elegido. */
export type VariantSelection = Readonly<Record<string, string>>;

export interface VariantOptionValue {
  readonly value: string;
  /**
   * `false` cuando, dada la selección actual del resto de atributos, ninguna
   * variante con este valor tiene stock. Permite atenuar la talla agotada en
   * vez de dejar que el usuario la elija y choque contra el error después.
   */
  readonly available: boolean;
}

export interface VariantOption {
  readonly name: string;
  readonly values: readonly VariantOptionValue[];
}

/**
 * Deriva las opciones seleccionables a partir de las variantes.
 *
 * El catálogo no declara opciones por separado: son una proyección de las
 * variantes reales. Así un ERP que sólo entrega variantes con atributos no
 * necesita un modelo extra, y nunca se ofrece una combinación que no existe.
 *
 * El orden de los atributos y de sus valores sigue el de aparición en
 * `variants`, para que el orden lo controle quien arma el catálogo.
 */
export function buildVariantOptions(
  variants: readonly ProductVariant[],
  selection: VariantSelection = {},
): VariantOption[] {
  const names: string[] = [];
  for (const variant of variants) {
    for (const name of Object.keys(variant.attributes)) {
      if (!names.includes(name)) names.push(name);
    }
  }

  return names.map((name) => {
    const values: VariantOptionValue[] = [];

    for (const variant of variants) {
      const value = variant.attributes[name];
      if (value === undefined) continue;

      // Disponibilidad condicionada al resto de la selección: una talla puede
      // existir en negro y estar agotada en blanco.
      const matchesOthers = Object.entries(selection).every(
        ([key, selected]) => key === name || variant.attributes[key] === selected,
      );
      const available = matchesOthers && variant.availableQuantity > 0;

      const existing = values.find((v) => v.value === value);
      if (existing) {
        if (available && !existing.available) {
          values[values.indexOf(existing)] = { value, available: true };
        }
      } else {
        values.push({ value, available });
      }
    }

    return { name, values };
  });
}

/** Variante que coincide exactamente con la selección, o `undefined`. */
export function findVariant(
  variants: readonly ProductVariant[],
  selection: VariantSelection,
): ProductVariant | undefined {
  const names = Object.keys(selection);
  if (names.length === 0) return undefined;

  return variants.find((variant) =>
    names.every((name) => variant.attributes[name] === selection[name]),
  );
}

/** Selección inicial: la primera variante con stock, o la primera que exista. */
export function defaultSelection(variants: readonly ProductVariant[]): VariantSelection {
  const preferred = variants.find((v) => v.availableQuantity > 0) ?? variants[0];
  return preferred ? { ...preferred.attributes } : {};
}
