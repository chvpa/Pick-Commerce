import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/*
 * Las medidas son las del handoff (ADR-143): 36 px de alto, 9 de radio y 14 px
 * de texto. El chico, 32 px, es el de las tarjetas y las filas. El foco es un
 * anillo azul de 3 px, el mismo que los campos: con un anillo gris el foco no
 * se distinguía del borde.
 */
const variantes = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-[9px] border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-focus-tint disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-[#252d3f]',
        outline:
          'border-input bg-white text-foreground hover:bg-[#f7f8fa] aria-expanded:bg-[#f7f8fa]',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-[#eceef2]',
        ghost: 'text-ink-2 hover:bg-accent hover:text-foreground aria-expanded:bg-accent',
        // Rojo lleno, como el handoff: lo destructivo es la acción que confirma,
        // y tiene que distinguirse del «Volver» que tiene al lado.
        destructive:
          'border-[#d93a2b] bg-[#d93a2b] text-white hover:border-[#c0301f] hover:bg-[#c0301f] focus-visible:ring-destructive/20',
        link: 'text-link underline-offset-4 hover:text-link-hover hover:underline',
      },
      size: {
        default:
          'h-9 gap-2 px-3.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
        xs: "h-7 gap-1 rounded-lg px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-lg px-3 text-[13.5px] [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-10 gap-2 rounded-[10px] px-4',
        icon: 'size-9',
        'icon-xs': "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8 rounded-lg',
        'icon-lg': 'size-10 rounded-[10px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

/**
 * Las clases de un botón, ya resueltas.
 *
 * Pasan por `cn` porque se usan sueltas sobre enlaces —`<Link className={…}>`—
 * y no sólo dentro de `Button`: sin resolver, la base deja `border-transparent`
 * junto al `border-input` de la variante, y en un enlace ganaba el transparente.
 * «Configurar» o «Importar productos» se veían como texto plano.
 */
function buttonVariants(props?: Parameters<typeof variantes>[0]): string {
  return cn(variantes(props));
}

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof variantes>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={buttonVariants({ variant, size, className })}
      {...props}
    />
  );
}

export { Button, buttonVariants };
