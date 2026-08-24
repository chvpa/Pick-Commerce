import { cn } from '../lib/cn.ts';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-md font-medium ' +
  'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
  'disabled:pointer-events-none disabled:opacity-60';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  secondary: 'border border-border bg-surface text-fg hover:border-border-strong',
  ghost: 'text-fg hover:bg-surface-sunken',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-6 text-sm',
};

export interface ButtonVariantsOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

/**
 * Receta de clases de botón, sin componente.
 *
 * El storefront tiene dos capas de render — `.astro` estático y Preact
 * hidratado — que no pueden compartir componentes. Sí pueden compartir las
 * clases, así que el estilo vive acá una sola vez y ninguna de las dos capas
 * lo redefine.
 */
export function buttonVariants({
  variant = 'primary',
  size = 'md',
  className,
}: ButtonVariantsOptions = {}): string {
  return cn(BASE, VARIANT[variant], SIZE[size], className);
}
