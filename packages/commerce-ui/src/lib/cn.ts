import { clsx, type ClassValue } from 'clsx';
import { createTailwindMerge, validators } from 'tailwind-merge';

/**
 * Grupos de utilidades cuyos conflictos se resuelven.
 *
 * La config por defecto de tailwind-merge cubre **toda** Tailwind y pesa 27 KB.
 * `cn` la usan las islands Preact, así que esos 27 KB viajaban al browser en
 * cada página: el 95 % del chunk más grande del storefront. Ver ADR-041.
 *
 * ponytail: lista a mano en vez de la config por defecto. Un grupo que falte
 * deja de resolver conflictos **en silencio**. El test de `cn` compara contra
 * el tailwind-merge completo sobre las combinaciones reales del design system:
 * si una queda sin resolver, falla ahí. Al exponer una utilidad nueva como
 * override, agregar su grupo acá y un caso al test.
 */
const twMerge = createTailwindMerge(() => ({
  cacheSize: 500,
  theme: {},
  classGroups: {
    // Espaciado
    p: [{ p: [validators.isAny] }],
    px: [{ px: [validators.isAny] }],
    py: [{ py: [validators.isAny] }],
    pt: [{ pt: [validators.isAny] }],
    pb: [{ pb: [validators.isAny] }],
    m: [{ m: [validators.isAny] }],
    mx: [{ mx: [validators.isAny] }],
    my: [{ my: [validators.isAny] }],
    gap: [{ gap: [validators.isAny] }],
    'gap-x': [{ 'gap-x': [validators.isAny] }],
    'gap-y': [{ 'gap-y': [validators.isAny] }],

    // Tamaño
    w: [{ w: [validators.isAny] }],
    h: [{ h: [validators.isAny] }],
    size: [{ size: [validators.isAny] }],
    'min-w': [{ 'min-w': [validators.isAny] }],
    'max-w': [{ 'max-w': [validators.isAny] }],

    // Tipografía. `text-` es ambiguo: `text-sm` es tamaño y `text-fg` es color,
    // así que el tamaño se enumera y el resto cae en color.
    'font-size': [{ text: ['2xs', 'xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl'] }],
    'text-color': [{ text: [validators.isAny] }],
    'font-weight': [{ font: ['thin', 'light', 'normal', 'medium', 'semibold', 'bold'] }],

    // Color y borde
    'bg-color': [{ bg: [validators.isAny] }],
    'border-color': [{ border: [validators.isAny] }],
    rounded: [{ rounded: [validators.isAny] }],
    opacity: [{ opacity: [validators.isAny] }],

    // Interacción
    cursor: [{ cursor: [validators.isAny] }],
    display: ['block', 'inline-block', 'flex', 'inline-flex', 'grid', 'hidden'],
    position: ['static', 'relative', 'absolute', 'fixed', 'sticky'],
  },
  conflictingClassGroups: {
    p: ['px', 'py', 'pt', 'pb'],
    px: [],
    py: ['pt', 'pb'],
    m: ['mx', 'my'],
    gap: ['gap-x', 'gap-y'],
    size: ['w', 'h'],
  },
  conflictingClassGroupModifiers: {},
  orderSensitiveModifiers: [],
}));

/**
 * Combina clases resolviendo conflictos de Tailwind.
 *
 * Sin el merge, pasar `className="px-6"` a un componente que ya trae `px-4`
 * deja ambas y gana la que esté después en el CSS generado, no la que pasó
 * quien consume: el escape hatch que exige PROJECT.md §17 no funcionaría.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
