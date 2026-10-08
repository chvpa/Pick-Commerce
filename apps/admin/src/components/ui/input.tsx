import * as React from 'react';
import { Input as InputPrimitive } from '@base-ui/react/input';

import { cn } from '@/lib/utils';

/*
 * 38 px de alto, como el handoff. El foco es el borde azul más un anillo de su
 * tinte, y el error el borde rojo: los dos se ven sin depender del color del
 * texto de ayuda.
 */
const CAMPO =
  'w-full min-w-0 rounded-[9px] border border-input bg-white px-3 text-sm text-foreground transition-[border-color,box-shadow] outline-none placeholder:text-ink-faint focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-focus-tint disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-danger aria-invalid:focus-visible:ring-destructive/15';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        CAMPO,
        'h-[38px] py-1 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export { CAMPO, Input };
