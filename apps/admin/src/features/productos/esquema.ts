import { z } from 'zod';
import { money, slugify } from '@pick/commerce-core';

/**
 * Validación del formulario de producto.
 *
 * Zod y no chequeos sueltos porque el mismo esquema valida cada fila del import
 * de CSV: si las reglas viven en dos lados, el CSV acepta lo que el formulario
 * rechaza y el catálogo termina con datos que nadie revisó.
 *
 * El precio se escribe en unidades mayores —lo que el operador ve— y se guarda
 * en unidades mínimas, como manda el tipo `Money`.
 */

/** Un atributo por línea, `color: Azul`. Es lo que un operador puede escribir sin UI extra. */
export function parsearAtributos(texto: string): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const linea of texto.split('\n')) {
    const corte = linea.indexOf(':');
    if (corte === -1) continue;
    const clave = linea.slice(0, corte).trim();
    const valor = linea.slice(corte + 1).trim();
    if (clave !== '' && valor !== '') salida[clave] = valor;
  }
  return salida;
}

export function formatearAtributos(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

const numeroOpcional = z
  .string()
  .trim()
  .transform((v) => (v === '' ? undefined : Number(v)))
  .refine((v) => v === undefined || (Number.isFinite(v) && v >= 0), 'Tiene que ser un número');

export const varianteSchema = z.object({
  id: z.string().optional(),
  sku: z.string().trim().min(1, 'El SKU es obligatorio'),
  title: z.string().trim().min(1, 'La variante necesita un nombre'),
  barcode: z.string().trim().optional(),
  precio: z
    .string()
    .trim()
    .min(1, 'El precio es obligatorio')
    .transform((v) => Number(v))
    .refine((v) => Number.isFinite(v) && v >= 0, 'Tiene que ser un número'),
  precioAnterior: numeroOpcional,
  costo: numeroOpcional,
  stock: z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : Number(v)))
    // Sin mínimo: el stock es un espejo del ERP y puede venir negativo (ADR-056).
    .refine((v) => v === undefined || Number.isInteger(v), 'Tiene que ser un número entero'),
  atributos: z.string(),
});

export const productoSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1, 'El título es obligatorio'),
  handle: z
    .string()
    .trim()
    .min(1, 'El handle es obligatorio')
    .refine((v) => v === slugify(v), 'Sólo minúsculas, números y guiones'),
  description: z.string().trim().optional(),
  brand: z.string().trim().optional(),
  categoryId: z.string().optional(),
  status: z.enum(['draft', 'active', 'inactive', 'archived']),
  variantes: z.array(varianteSchema).min(1, 'Un producto necesita al menos una variante'),
  media: z.array(
    z.object({
      url: z.string().trim().min(1, 'La URL es obligatoria'),
      alt: z.string(),
      // Obligatorias contra CLS: sin ellas el layout salta al cargar (ADR-034).
      width: z.coerce.number().int().positive('Ancho inválido'),
      height: z.coerce.number().int().positive('Alto inválido'),
    }),
  ),
});

export type FormularioProducto = z.input<typeof productoSchema>;
export type ProductoValidado = z.output<typeof productoSchema>;

/**
 * De los valores validados a lo que espera el repositorio.
 *
 * Está acá y no en el formulario porque **dos pantallas guardan productos**: la
 * ficha completa y el alta con la cámara (ADR-131). La conversión a unidades
 * mínimas es el paso que no puede vivir en dos lados: un precio convertido dos
 * veces, o ninguna, es una tienda vendiendo a cien veces su precio.
 */
export function productoParaGuardar(
  valores: ProductoValidado,
  moneda: Parameters<typeof money>[1],
  /**
   * La sucursal a la que va el stock. Con ella el stock viaja como
   * `stockPorSucursal` y la base lo escribe donde se le dice; sin ella viaja como
   * número suelto, que sólo vale en una tienda con una sola sucursal. Las tres
   * pantallas del Admin la pasan siempre, incluso cuando hay una: así el camino
   * del número suelto no se usa nunca desde acá.
   */
  sucursalId?: string,
) {
  return {
    ...(valores.id ? { id: valores.id } : {}),
    handle: valores.handle,
    title: valores.title,
    ...(valores.description ? { description: valores.description } : {}),
    ...(valores.brand ? { brand: valores.brand } : {}),
    ...(valores.categoryId ? { categoryId: valores.categoryId } : {}),
    status: valores.status,
    variants: valores.variantes.map((v) => ({
      ...(v.id ? { id: v.id } : {}),
      sku: v.sku,
      title: v.title,
      ...(v.barcode ? { barcode: v.barcode } : {}),
      // El operador escribe en unidades mayores; el catálogo guarda mínimas.
      price: money(v.precio, moneda).amount,
      currency: moneda,
      ...(v.precioAnterior === undefined
        ? {}
        : { compareAtPrice: money(v.precioAnterior, moneda).amount }),
      ...(v.costo === undefined ? {} : { cost: money(v.costo, moneda).amount }),
      attributes: parsearAtributos(v.atributos),
      ...(v.stock === undefined
        ? {}
        : sucursalId
          ? { stockPorSucursal: { [sucursalId]: v.stock } }
          : { stock: v.stock }),
    })),
    media: valores.media,
  };
}
