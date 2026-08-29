import { z } from 'zod';

/**
 * Validación del formulario de promoción.
 *
 * El operador escribe en las unidades que entiende —«15» por ciento, «50000»
 * guaraníes— y acá se convierte a lo que guarda la base: puntos básicos para el
 * porcentaje y unidad mínima para el monto fijo. Es la misma división que hace
 * el formulario de producto con el precio.
 *
 * Lo que **no** vive acá es la semántica de aplicación: eso es
 * `commerce-core/promotions.ts`, y este esquema sólo se ocupa de que lo que se
 * manda tenga forma.
 */

/*
 * Los números que escribe una persona.
 *
 * `Number('abc')` da `NaN` y `Number('')` da `0`, así que validar **después** de
 * convertir confunde dos errores distintos —«no es un número» y «es cero»— y
 * termina diciendo «tiene que ser mayor a cero» sobre un texto. Se valida el
 * texto tal como se escribió y recién después se convierte.
 *
 * Los mensajes hablan de puntos y comas y no de enteros ni decimales: quien
 * carga una promoción no tiene por qué saber qué es un entero.
 */
const SOLO_DIGITOS = /^\d+$/;
const NUMERO_CON_DECIMALES = /^\d+([.,]\d+)?$/;

/** Cantidad entera y positiva. Vacío = ausente, no cero. */
const enteroOpcional = z
  .string()
  .trim()
  .refine((v) => v === '' || SOLO_DIGITOS.test(v), 'Sólo números enteros, sin puntos ni comas')
  .refine((v) => v === '' || Number(v) > 0, 'Tiene que ser mayor que cero')
  .transform((v) => (v === '' ? undefined : Number(v)));

const fechaOpcional = z
  .string()
  .trim()
  .transform((v) => (v === '' ? undefined : v));

export const promocionSchema = z
  .object({
    title: z.string().trim().min(1, 'La promoción necesita un nombre'),
    status: z.enum(['draft', 'active', 'archived']),
    priority: z
      .string()
      .trim()
      .refine((v) => v === '' || SOLO_DIGITOS.test(v), 'Sólo números enteros')
      .transform((v) => (v === '' ? 0 : Number(v))),
    stackable: z.boolean(),

    discountType: z.enum(['percentage', 'fixed']),
    /** Porcentaje o monto, según el tipo. Se convierte en `aDatos`. */
    discountValue: z
      .string()
      .trim()
      .min(1, 'Falta el descuento')
      // El porcentaje admite decimales —«12,5 %» es un caso real— y el monto no:
      // se guarda en la unidad mínima de la moneda. La distinción la hace el
      // refine de abajo, que ya conoce el tipo.
      .refine((v) => NUMERO_CON_DECIMALES.test(v), 'Sólo números. Para decimales, usá una coma')
      .transform((v) => Number(v.replace(',', '.')))
      .refine((v) => v > 0, 'Tiene que ser mayor que cero'),

    targetKind: z.enum(['all', 'category', 'collection', 'product']),
    targetIds: z.array(z.string()),

    code: z
      .string()
      .trim()
      .transform((v) => (v === '' ? undefined : v.toUpperCase())),
    startsAt: fechaOpcional,
    endsAt: fechaOpcional,
    usageLimit: enteroOpcional,
    minSubtotal: enteroOpcional,
    minQuantity: enteroOpcional,
  })
  .refine((v) => v.discountType !== 'percentage' || v.discountValue <= 100, {
    message: 'Un porcentaje no puede pasar de 100',
    path: ['discountValue'],
  })
  // Un monto fijo se guarda en la unidad mínima de la moneda, así que «50000,5»
  // no significa nada. El porcentaje sí admite decimales.
  .refine((v) => v.discountType !== 'fixed' || Number.isInteger(v.discountValue), {
    message: 'Un monto no lleva decimales',
    path: ['discountValue'],
  })
  .refine((v) => v.targetKind === 'all' || v.targetIds.length > 0, {
    message: 'Elegí al menos uno',
    path: ['targetIds'],
  })
  .refine(
    (v) => !v.startsAt || !v.endsAt || new Date(v.startsAt) < new Date(v.endsAt),
    // El error va en el fin y no en el inicio: es el campo que el operador
    // acaba de tocar cuando se equivoca.
    { message: 'El fin tiene que ser posterior al inicio', path: ['endsAt'] },
  );

export type PromocionValidada = z.output<typeof promocionSchema>;
export type FormularioPromocion = z.input<typeof promocionSchema>;

/**
 * De lo que el operador escribió a lo que la base guarda.
 *
 * Los puntos básicos son la conversión que importa: «12,5 %» entra como 1250 y
 * nunca pasa por un float, igual que todo el dinero del sistema.
 */
export function aDatos(v: PromocionValidada) {
  return {
    title: v.title,
    status: v.status,
    priority: v.priority,
    stackable: v.stackable,
    discountType: v.discountType,
    discountValue:
      v.discountType === 'percentage' ? Math.round(v.discountValue * 100) : v.discountValue,
    target:
      v.targetKind === 'all'
        ? ({ kind: 'all' } as const)
        : ({ kind: v.targetKind, ids: v.targetIds } as const),
    ...(v.code ? { code: v.code } : {}),
    ...(v.startsAt ? { startsAt: new Date(v.startsAt).toISOString() } : {}),
    ...(v.endsAt ? { endsAt: new Date(v.endsAt).toISOString() } : {}),
    ...(v.usageLimit !== undefined ? { usageLimit: v.usageLimit } : {}),
    ...(v.minSubtotal !== undefined ? { minSubtotal: v.minSubtotal } : {}),
    ...(v.minQuantity !== undefined ? { minQuantity: v.minQuantity } : {}),
  };
}

/** Un ISO a lo que `<input type="datetime-local">` entiende, en hora local. */
export function aCampoDeFecha(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const dosDigitos = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}` +
    `T${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`
  );
}
