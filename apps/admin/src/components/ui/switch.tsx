import { Switch as SwitchPrimitive } from '@base-ui/react/switch';

import { cn } from '@/lib/utils';

/*
 * El toggle del handoff: 38 × 22, azul encendido y gris apagado, con una perilla
 * de 18 px que se corre 16. `sm` queda para las filas densas.
 */
function Switch({
  className,
  size = 'default',
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: 'sm' | 'default';
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        'peer group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors duration-150 outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-3 focus-visible:ring-focus-tint data-[size=default]:h-[22px] data-[size=default]:w-[38px] data-[size=sm]:h-4 data-[size=sm]:w-7 data-checked:bg-ring data-unchecked:bg-[#d8dce4] data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full bg-white shadow-[0_1px_2px_rgba(16,24,40,0.2)] ring-0 transition-transform duration-150 group-data-[size=default]/switch:size-[18px] group-data-[size=sm]/switch:size-3 group-data-[size=default]/switch:data-checked:translate-x-[17px] group-data-[size=default]/switch:data-unchecked:translate-x-px group-data-[size=sm]/switch:data-checked:translate-x-[13px] group-data-[size=sm]/switch:data-unchecked:translate-x-px"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
