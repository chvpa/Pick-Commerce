import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combina clases resolviendo conflictos de Tailwind.
 *
 * Sin `twMerge`, pasar `className="px-6"` a un componente que ya trae `px-4`
 * deja ambas clases y gana la que esté después en el CSS generado, no la que
 * pasó quien consume. Es decir: el escape hatch `className` que exige
 * PROJECT.md §17 no funcionaría de forma predecible.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
