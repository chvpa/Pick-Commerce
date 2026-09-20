import { skuSugerido } from '@pick/commerce-core';

/**
 * De lo que se revisó en pantalla a las variantes que se guardan (ADR-131).
 *
 * Vive aparte del componente porque es la parte que maneja plata y códigos: un
 * talle de más es una variante que nadie puede vender, y un código de barras
 * repetido en tres talles es un problema que aparece meses después, en la
 * pistola del depósito.
 */

export interface DatosDeVariantes {
  /** El SKU base: el que trae la etiqueta o el que se propuso del handle. */
  readonly sku: string;
  /** Vacío cuando el producto no tiene talles: queda una sola variante. */
  readonly talles: readonly string[];
  /** En unidades mayores, que es como se escribe en el formulario. */
  readonly precio: number;
  readonly costo?: number;
  readonly stock?: number;
  readonly barcode?: string;
}

export interface VarianteDelAlta {
  readonly sku: string;
  readonly title: string;
  readonly barcode?: string;
  readonly precio: number;
  readonly costo?: number;
  readonly stock?: number;
  readonly atributos: Readonly<Record<string, string>>;
}

/** El nombre de la variante cuando el producto no tiene talles. */
export const VARIANTE_UNICA = 'Única';

/**
 * Una variante por talle, o una sola si no hay talles.
 *
 * El código de barras **sólo se aplica cuando hay una única variante**. Un GTIN
 * identifica un artículo concreto: el que se leyó es el del talle que se
 * fotografió, y copiarlo a los otros dos sería inventarlo, que es justo lo que
 * ADR-131 no habilita.
 */
export function variantesDelAlta(datos: DatosDeVariantes): VarianteDelAlta[] {
  const comun = {
    precio: datos.precio,
    ...(datos.costo === undefined ? {} : { costo: datos.costo }),
    ...(datos.stock === undefined ? {} : { stock: datos.stock }),
  };

  const talles = [...new Set(datos.talles.map((t) => t.trim()).filter((t) => t !== ''))];

  if (talles.length === 0) {
    return [
      {
        sku: datos.sku,
        title: VARIANTE_UNICA,
        ...(datos.barcode ? { barcode: datos.barcode } : {}),
        ...comun,
        atributos: {},
      },
    ];
  }

  if (talles.length === 1) {
    return [
      {
        sku: skuSugerido(datos.sku, talles[0]),
        title: talles[0]!,
        ...(datos.barcode ? { barcode: datos.barcode } : {}),
        ...comun,
        atributos: { Talle: talles[0]! },
      },
    ];
  }

  return talles.map((talle) => ({
    sku: skuSugerido(datos.sku, talle),
    title: talle,
    ...comun,
    atributos: { Talle: talle },
  }));
}
