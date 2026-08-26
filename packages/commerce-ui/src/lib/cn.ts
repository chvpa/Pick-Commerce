import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combina clases resolviendo conflictos de Tailwind.
 *
 * Sin el merge, pasar `className="px-6"` a un componente que ya trae `px-4`
 * deja ambas y gana la que esté después en el CSS generado, no la que pasó
 * quien consume: el escape hatch que exige PROJECT.md §17 no funcionaría.
 *
 * Usa la configuración por defecto a propósito. Se intentó recortarla con
 * `createTailwindMerge` para ahorrar ~5 KB gzip (ADR-041) y descartaba en
 * silencio clases que ningún test cubría: `border-b border-border` quedaba en
 * `border-border`, y el header, el footer y el drawer perdieron sus bordes en
 * producción sin que fallara nada. Ver ADR-050.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
