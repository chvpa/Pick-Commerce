import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';

import { cn } from '@/lib/utils';
import { CheckIcon } from '@/components/iconos';

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer relative flex size-[18px] shrink-0 cursor-pointer items-center justify-center rounded-[5px] border border-[#c8cdd7] bg-white transition-colors outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-focus-tint disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger data-checked:border-ring data-checked:bg-ring data-checked:text-white',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
