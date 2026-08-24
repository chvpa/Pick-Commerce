import { useId } from 'preact/hooks';
import { cn } from '../lib/cn.ts';

export interface QuantitySelectorProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  /** Tope de stock. El selector nunca deja pedir más de lo disponible. */
  max?: number;
  disabled?: boolean;
  className?: string;
}

export function QuantitySelector({
  value,
  onChange,
  min = 1,
  max,
  disabled = false,
  className,
}: QuantitySelectorProps) {
  const id = useId();
  const clamp = (n: number) => Math.min(Math.max(n, min), max ?? Number.MAX_SAFE_INTEGER);

  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;

  const button =
    'flex h-9 w-9 items-center justify-center text-fg transition-colors ' +
    'hover:bg-surface-sunken disabled:cursor-not-allowed disabled:text-fg-subtle disabled:hover:bg-transparent ' +
    'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent cursor-pointer';

  return (
    <div className={cn('inline-flex items-center rounded-md border border-border', className)}>
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={disabled || atMin}
        aria-label="Quitar uno"
        aria-controls={id}
        className={cn(button, 'rounded-l-md')}
      >
        <span aria-hidden="true">−</span>
      </button>

      {/*
        `output` en vez de `input`: la cantidad se cambia con los botones, así que
        un campo editable prometería una interacción que no existe. `aria-live`
        hace que el lector de pantalla anuncie el nuevo valor al pulsar.
      */}
      <output id={id} aria-live="polite" className="w-10 text-center text-sm tabular-nums">
        {value}
      </output>

      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={disabled || atMax}
        aria-label="Agregar uno"
        aria-controls={id}
        className={cn(button, 'rounded-r-md')}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}
