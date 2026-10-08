import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/*
 * La pill de estado del handoff: 22 px de alto, redonda, con un punto de 6 px.
 *
 * Los seis tonos tienen significado y no son decoración: ámbar es «falta algo
 * de tu lado» —cobrar, confirmar—, azul es «en curso», verde es «terminado bien»,
 * rojo es «salió mal», gris es «quieto» y violeta es «lo hizo la IA». Un estado
 * nuevo elige el tono por lo que le pide a quien mira, no por cómo combina.
 */
/** El color de cada tono, también para lo que no es una pill —un desplegable de estado—. */
export const COLOR_DE_TONO = {
  amber: 'bg-[#fdf4e3] text-[#9a5b0b]',
  blue: 'bg-[#edf1fe] text-[#2b47bd]',
  green: 'bg-[#e8f6ee] text-[#13774a]',
  red: 'bg-[#fdeceb] text-[#bf3324]',
  gray: 'bg-[#f1f2f5] text-ink-3',
  violet: 'bg-[#f2eefe] text-[#5f37cf]',
} as const;

/** El punto de cada tono: el de la pill y el de las opciones de un menú de estado. */
export const PUNTO_DE_TONO: Readonly<Record<keyof typeof COLOR_DE_TONO, string>> = {
  amber: '#e8930c',
  blue: '#3b5bdb',
  green: '#22a565',
  red: '#e5484d',
  gray: '#a3aab8',
  violet: '#7c5cf0',
};

const badgeVariants = cva(
  'group/badge inline-flex h-[22px] w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full border border-transparent px-2 text-[12.5px] font-medium whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-focus-tint [&>svg]:pointer-events-none [&>svg]:size-3!',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        secondary: 'bg-[#f1f2f5] text-ink-3',
        destructive: 'bg-[#fdeceb] text-[#bf3324]',
        outline: 'border-border text-foreground',
        ghost: 'hover:bg-muted hover:text-muted-foreground',
        link: 'text-link underline-offset-4 hover:underline',
        ...COLOR_DE_TONO,
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

/** Los tonos con significado; los demás variantes son las de shadcn. */
export type Tono = keyof typeof COLOR_DE_TONO;

function Badge({
  className,
  variant = 'default',
  render,
  children,
  ...props
}: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  // El punto va sólo en los tonos: en las variantes de shadcn no hay color de
  // estado que repetir.
  const punto = variant != null && variant in PUNTO_DE_TONO ? PUNTO_DE_TONO[variant as Tono] : null;
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>(
      {
        className: cn(badgeVariants({ variant }), className),
        children: (
          <>
            {punto && (
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: punto }}
              />
            )}
            {children}
          </>
        ),
      },
      props,
    ),
    render,
    state: {
      slot: 'badge',
      variant,
    },
  });
}

export { Badge, badgeVariants };
