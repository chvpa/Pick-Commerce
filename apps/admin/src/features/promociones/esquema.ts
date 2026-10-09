import { z } from 'zod';
import {
  TIPOS_CON_CUPON,
  type DatosDePromocion,
  type Promotion,
  type PromotionKind,
  type PromotionRules,
} from '@pick/commerce-core';

/**
 * Validación del formulario de promoción.
 *
 * El operador escribe en las unidades que entiende —«15» por ciento, «50000»
 * guaraníes— y acá se convierte a lo que guarda la base: puntos básicos para el
 * porcentaje y unidad mínima para el monto. Es la misma división que hace el
 * formulario de producto con el precio.
 *
 * Lo que **no** vive acá es la semántica de aplicación: eso es
 * `commerce-core/promotions.ts`, y este esquema sólo se ocupa de que lo que se
 * manda tenga forma. Una promoción mal formada no regala nada (ADR-164), pero
 * tampoco hace lo que el comercio quería: por eso se frena acá.
 */

/** Los ocho tipos, en el orden y con los nombres del handoff. */
export const TIPOS: readonly {
  readonly kind: PromotionKind;
  readonly label: string;
  readonly ejemplo: string;
}[] = [
  { kind: 'discount', label: 'Descuento', ejemplo: '15 % o Gs. 30.000' },
  { kind: 'buy_x_pay_y', label: 'Llevá X, pagá Y', ejemplo: '2x1, 3x2, 4x3' },
  { kind: 'second_unit', label: '2da unidad', ejemplo: 'La segunda al 50 %' },
  { kind: 'quantity', label: 'Por cantidad', ejemplo: 'Más unidades, más descuento' },
  { kind: 'tiered', label: 'Por monto', ejemplo: 'Escalones según el total' },
  { kind: 'gift', label: 'Regalo', ejemplo: 'Comprando X, te llevás Y' },
  { kind: 'bundle', label: 'Bundle', ejemplo: 'Agregando X de una colección' },
  { kind: 'free_shipping', label: 'Envío gratis', ejemplo: 'Desde un monto, por zona' },
];

export const NOMBRE_DEL_TIPO = Object.fromEntries(TIPOS.map((t) => [t.kind, t.label])) as Record<
  PromotionKind,
  string
>;

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

const texto = z.string().trim();

const KINDS = TIPOS.map((t) => t.kind) as [PromotionKind, ...PromotionKind[]];

export const promocionSchema = z
  .object({
    title: z.string().trim().min(1, 'La promoción necesita un nombre'),
    kind: z.enum(KINDS),
    /** Automática o con código. Sólo el descuento y el envío gratis pueden ser cupón. */
    modo: z.enum(['auto', 'codigo']),
    status: z.enum(['draft', 'active', 'archived']),
    priority: z
      .string()
      .trim()
      .refine((v) => v === '' || SOLO_DIGITOS.test(v), 'Sólo números enteros')
      .transform((v) => (v === '' ? 0 : Number(v))),
    stackable: z.boolean(),

    // Descuento.
    discountType: z.enum(['percentage', 'fixed']),
    discountValue: texto,

    // Llevá X, pagá Y.
    lleva: texto,
    paga: texto,
    // 2da unidad.
    segunda: texto,
    // Por cantidad.
    escalonesDeCantidad: z.array(z.object({ desde: texto, porcentaje: texto })),
    mezclar: z.boolean(),
    // Por monto. El tope del último no se usa: es «más de».
    escalonesDeMonto: z.array(z.object({ hasta: texto, porcentaje: texto })),
    // Regalo, y bundle con regalo.
    compra: texto,
    regalo: texto,
    /** El nombre del regalo elegido. Sólo para mostrarlo: no se guarda. */
    nombreDelRegalo: z.string(),
    cantidadDeRegalo: texto,
    // Bundle.
    coleccion: texto,
    productosDelBundle: texto,
    beneficio: z.enum(['percent', 'fixed', 'free_shipping', 'gift']),
    valorDelBundle: texto,
    // Envío gratis. Sin zonas elegidas y con «todas», llega a todo el país.
    todasLasZonas: z.boolean(),
    zonas: z.array(z.string()),

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
  .superRefine((v, ctx) => {
    const error = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    const entero = (s: string) => SOLO_DIGITOS.test(s) && Number(s) > 0;
    /** Un porcentaje escrito: con coma decimal, entre algo más que cero y 100. */
    const porcentaje = (path: string, s: string) => {
      if (s === '') return error(path, 'Falta el porcentaje');
      if (!NUMERO_CON_DECIMALES.test(s))
        return error(path, 'Sólo números. Para decimales, usá una coma');
      const n = Number(s.replace(',', '.'));
      if (n <= 0) return error(path, 'Tiene que ser mayor que cero');
      if (n > 100) return error(path, 'Un porcentaje no puede pasar de 100');
    };

    if (v.modo === 'codigo') {
      if (!v.code) error('code', 'Falta el código');
      if (!TIPOS_CON_CUPON.includes(v.kind)) {
        error('kind', 'Con código sólo se puede hacer un descuento o un envío gratis');
      }
    }

    // El error va en el fin y no en el inicio: es el campo que el operador
    // acaba de tocar cuando se equivoca.
    if (v.startsAt && v.endsAt && new Date(v.startsAt) >= new Date(v.endsAt)) {
      error('endsAt', 'El fin tiene que ser posterior al inicio');
    }

    if (usaAlcance(v.kind) && v.targetKind !== 'all' && v.targetIds.length === 0) {
      error('targetIds', 'Elegí al menos uno');
    }

    switch (v.kind) {
      case 'discount': {
        if (v.discountValue === '') return error('discountValue', 'Falta el descuento');
        if (!NUMERO_CON_DECIMALES.test(v.discountValue)) {
          return error('discountValue', 'Sólo números. Para decimales, usá una coma');
        }
        const n = Number(v.discountValue.replace(',', '.'));
        if (n <= 0) return error('discountValue', 'Tiene que ser mayor que cero');
        if (v.discountType === 'percentage' && n > 100) {
          return error('discountValue', 'Un porcentaje no puede pasar de 100');
        }
        // Un monto se guarda en la unidad mínima de la moneda: «50000,5» no significa nada.
        if (v.discountType === 'fixed' && !Number.isInteger(n)) {
          return error('discountValue', 'Un monto no lleva decimales');
        }
        return;
      }

      case 'buy_x_pay_y':
        if (!entero(v.lleva)) error('lleva', 'Cuántas unidades lleva, en números');
        if (!entero(v.paga)) error('paga', 'Cuántas paga, en números');
        if (entero(v.lleva) && entero(v.paga) && Number(v.paga) >= Number(v.lleva)) {
          error('paga', 'Tiene que pagar menos unidades de las que lleva');
        }
        return;

      case 'second_unit':
        return porcentaje('segunda', v.segunda);

      case 'quantity':
        if (v.escalonesDeCantidad.length === 0)
          return error('escalonesDeCantidad', 'Agregá un escalón');
        v.escalonesDeCantidad.forEach((e, i) => {
          if (!entero(e.desde) || Number(e.desde) < 2) {
            error(`escalonesDeCantidad.${i}.desde`, 'Desde 2 unidades o más');
          } else if (i > 0 && Number(e.desde) <= Number(v.escalonesDeCantidad[i - 1]!.desde)) {
            error(
              `escalonesDeCantidad.${i}.desde`,
              'Cada escalón pide más unidades que el anterior',
            );
          }
          porcentaje(`escalonesDeCantidad.${i}.porcentaje`, e.porcentaje);
        });
        return;

      case 'tiered':
        if (v.escalonesDeMonto.length < 2)
          return error('escalonesDeMonto', 'Hacen falta dos escalones o más');
        v.escalonesDeMonto.forEach((e, i) => {
          const ultimo = i === v.escalonesDeMonto.length - 1;
          if (!ultimo) {
            const anterior = i > 0 ? Number(v.escalonesDeMonto[i - 1]!.hasta) : 0;
            if (!entero(e.hasta) || Number(e.hasta) <= anterior) {
              error(
                `escalonesDeMonto.${i}.hasta`,
                'Cada escalón tiene que terminar en un monto mayor que el anterior',
              );
            }
          }
          // El primero puede ser cero: «hasta 200.000, nada».
          if (!(i === 0 && e.porcentaje === '0'))
            porcentaje(`escalonesDeMonto.${i}.porcentaje`, e.porcentaje);
        });
        return;

      case 'gift':
        if (!entero(v.compra)) error('compra', 'Cuántas unidades tiene que comprar');
        if (!v.regalo) error('regalo', 'Elegí qué se regala');
        if (!entero(v.cantidadDeRegalo)) error('cantidadDeRegalo', 'Cuántas unidades se regalan');
        return;

      case 'bundle':
        if (!v.coleccion) error('coleccion', 'Elegí la colección');
        if (!entero(v.productosDelBundle) || Number(v.productosDelBundle) < 2) {
          error('productosDelBundle', 'Un bundle necesita al menos 2 productos');
        }
        if (v.beneficio === 'percent') porcentaje('valorDelBundle', v.valorDelBundle);
        if (v.beneficio === 'fixed' && !entero(v.valorDelBundle)) {
          error('valorDelBundle', 'El monto, en números y sin puntos');
        }
        if (v.beneficio === 'gift') {
          if (!v.regalo) error('regalo', 'Elegí qué se regala');
          if (!entero(v.cantidadDeRegalo)) error('cantidadDeRegalo', 'Cuántas unidades se regalan');
        }
        return;

      case 'free_shipping':
        if (!v.todasLasZonas && v.zonas.length === 0) error('zonas', 'Elegí al menos una zona');
        return;
    }
  });

export type PromocionValidada = z.output<typeof promocionSchema>;
export type FormularioPromocion = z.input<typeof promocionSchema>;

/**
 * Si el tipo usa «a qué productos alcanza». El bundle elige su colección, y un
 * envío gratis no depende de qué se compra.
 */
export function usaAlcance(kind: PromotionKind): boolean {
  return kind !== 'bundle' && kind !== 'free_shipping';
}

/** Si la compra mínima tiene sentido. En «por monto» los escalones ya son el mínimo. */
export function usaCompraMinima(kind: PromotionKind): boolean {
  return kind !== 'tiered';
}

export const VALORES_INICIALES: FormularioPromocion = {
  title: '',
  kind: 'discount',
  modo: 'auto',
  status: 'draft',
  priority: '0',
  stackable: false,
  discountType: 'percentage',
  discountValue: '',
  lleva: '3',
  paga: '2',
  segunda: '50',
  escalonesDeCantidad: [
    { desde: '2', porcentaje: '10' },
    { desde: '4', porcentaje: '20' },
  ],
  mezclar: false,
  escalonesDeMonto: [
    { hasta: '300000', porcentaje: '0' },
    { hasta: '600000', porcentaje: '10' },
    { hasta: '', porcentaje: '15' },
  ],
  compra: '1',
  regalo: '',
  nombreDelRegalo: '',
  cantidadDeRegalo: '1',
  coleccion: '',
  productosDelBundle: '2',
  beneficio: 'percent',
  valorDelBundle: '10',
  todasLasZonas: true,
  zonas: [],
  targetKind: 'all',
  targetIds: [],
  code: '',
  startsAt: '',
  endsAt: '',
  usageLimit: '',
  minSubtotal: '',
  minQuantity: '',
};

const aPuntos = (s: string) => Math.round(Number(s.replace(',', '.')) * 100);
const dePuntos = (n: number | undefined) =>
  n === undefined ? '' : String(n / 100).replace('.', ',');

/** Lo que el tipo guarda en `rules`. */
function reglas(v: PromocionValidada): PromotionRules | undefined {
  const regalo = { giftVariantId: v.regalo, giftQuantity: Number(v.cantidadDeRegalo) };
  switch (v.kind) {
    case 'discount':
      return undefined;
    case 'buy_x_pay_y':
      return { buy: Number(v.lleva), pay: Number(v.paga) };
    case 'second_unit':
      return { percent: aPuntos(v.segunda) };
    case 'quantity':
      return {
        tiers: v.escalonesDeCantidad.map((e) => ({
          minQuantity: Number(e.desde),
          percent: aPuntos(e.porcentaje),
        })),
        ...(v.mezclar ? { mix: true } : {}),
      };
    case 'tiered':
      return {
        tiers: v.escalonesDeMonto.map((e, i, todos) => ({
          ...(i < todos.length - 1 ? { upTo: Number(e.hasta) } : {}),
          percent: aPuntos(e.porcentaje),
        })),
      };
    case 'gift':
      return { buy: Number(v.compra), ...regalo };
    case 'bundle':
      return {
        count: Number(v.productosDelBundle),
        benefit: v.beneficio,
        ...(v.beneficio === 'percent' ? { value: aPuntos(v.valorDelBundle) } : {}),
        ...(v.beneficio === 'fixed' ? { value: Number(v.valorDelBundle) } : {}),
        ...(v.beneficio === 'gift' ? regalo : {}),
      };
    case 'free_shipping':
      return v.todasLasZonas ? {} : { zones: v.zonas };
  }
}

/**
 * De lo que el operador escribió a lo que la base guarda.
 *
 * Los puntos básicos son la conversión que importa: «12,5 %» entra como 1250 y
 * nunca pasa por un float, igual que todo el dinero del sistema.
 */
export function aDatos(v: PromocionValidada): DatosDePromocion {
  const rules = reglas(v);
  const target =
    v.kind === 'bundle'
      ? ({ kind: 'collection', ids: [v.coleccion] } as const)
      : v.kind === 'free_shipping' || v.targetKind === 'all'
        ? ({ kind: 'all' } as const)
        : ({ kind: v.targetKind, ids: v.targetIds } as const);
  return {
    title: v.title,
    kind: v.kind,
    status: v.status,
    priority: v.priority,
    stackable: v.stackable,
    ...(v.kind === 'discount'
      ? {
          discountType: v.discountType,
          discountValue:
            v.discountType === 'percentage' ? aPuntos(v.discountValue) : Number(v.discountValue),
        }
      : {}),
    ...(rules ? { rules } : {}),
    target,
    ...(v.modo === 'codigo' && v.code ? { code: v.code } : {}),
    ...(v.startsAt ? { startsAt: new Date(v.startsAt).toISOString() } : {}),
    ...(v.endsAt ? { endsAt: new Date(v.endsAt).toISOString() } : {}),
    ...(v.usageLimit !== undefined ? { usageLimit: v.usageLimit } : {}),
    ...(v.minSubtotal !== undefined && usaCompraMinima(v.kind)
      ? { minSubtotal: v.minSubtotal }
      : {}),
    ...(v.minQuantity !== undefined && v.kind === 'discount' ? { minQuantity: v.minQuantity } : {}),
  };
}

/** De una promoción guardada a lo que el formulario muestra. Lo inverso de `aDatos`. */
export function aFormulario(p: Promotion): FormularioPromocion {
  const r = p.rules ?? {};
  const base = VALORES_INICIALES;
  return {
    ...base,
    title: p.title,
    kind: p.kind,
    modo: p.code ? 'codigo' : 'auto',
    status: p.status,
    priority: String(p.priority),
    stackable: p.stackable,
    discountType: p.discountType ?? 'percentage',
    discountValue:
      p.discountValue === undefined
        ? ''
        : p.discountType === 'percentage'
          ? dePuntos(p.discountValue)
          : String(p.discountValue),
    lleva: r.buy !== undefined && p.kind === 'buy_x_pay_y' ? String(r.buy) : base.lleva,
    paga: r.pay !== undefined ? String(r.pay) : base.paga,
    segunda: r.percent !== undefined ? dePuntos(r.percent) : base.segunda,
    escalonesDeCantidad:
      p.kind === 'quantity' && r.tiers
        ? r.tiers.map((t) => ({
            desde: String(t.minQuantity ?? ''),
            porcentaje: dePuntos(t.percent),
          }))
        : base.escalonesDeCantidad,
    mezclar: r.mix === true,
    escalonesDeMonto:
      p.kind === 'tiered' && r.tiers
        ? r.tiers.map((t) => ({
            hasta: t.upTo !== undefined ? String(t.upTo) : '',
            porcentaje: dePuntos(t.percent),
          }))
        : base.escalonesDeMonto,
    compra: p.kind === 'gift' && r.buy !== undefined ? String(r.buy) : base.compra,
    regalo: r.giftVariantId ?? '',
    cantidadDeRegalo: r.giftQuantity !== undefined ? String(r.giftQuantity) : base.cantidadDeRegalo,
    coleccion: p.kind === 'bundle' && p.target.kind === 'collection' ? (p.target.ids[0] ?? '') : '',
    productosDelBundle: r.count !== undefined ? String(r.count) : base.productosDelBundle,
    beneficio: r.benefit ?? base.beneficio,
    valorDelBundle:
      r.value === undefined
        ? base.valorDelBundle
        : r.benefit === 'percent'
          ? dePuntos(r.value)
          : String(r.value),
    todasLasZonas: !r.zones || r.zones.length === 0,
    zonas: [...(r.zones ?? [])],
    targetKind: p.kind === 'bundle' ? 'all' : p.target.kind,
    targetIds: p.kind === 'bundle' || p.target.kind === 'all' ? [] : [...p.target.ids],
    code: p.code ?? '',
    startsAt: aCampoDeFecha(p.startsAt),
    endsAt: aCampoDeFecha(p.endsAt),
    usageLimit: p.usageLimit !== undefined ? String(p.usageLimit) : '',
    minSubtotal: p.minSubtotal !== undefined ? String(p.minSubtotal) : '',
    minQuantity: p.minQuantity !== undefined ? String(p.minQuantity) : '',
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
