import type { VariantOption, VariantSelection } from '@pick/commerce-core';
import { cn } from '../lib/cn.ts';

export interface VariantSelectorProps {
  options: readonly VariantOption[];
  selection: VariantSelection;
  onSelect: (name: string, value: string) => void;
  /**
   * Color CSS por valor, para mostrar swatches en vez de texto.
   * Lo aporta el preset o el storefront: el catálogo guarda "Negro", no un hex,
   * y el Core no inventa esa correspondencia.
   */
  swatches?: Readonly<Record<string, string>>;
  className?: string;
}

export function VariantSelector({
  options,
  selection,
  onSelect,
  swatches,
  className,
}: VariantSelectorProps) {
  return (
    <div className={cn('flex flex-col gap-5', className)}>
      {options.map((option) => (
        <fieldset key={option.name} className="flex flex-col gap-2">
          <legend className="text-sm font-medium capitalize">{option.name}</legend>

          <div className="flex flex-wrap gap-2">
            {option.values.map(({ value, available }) => {
              const selected = selection[option.name] === value;
              const swatch = swatches?.[value];

              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onSelect(option.name, value)}
                  // No se deshabilita el agotado: el usuario debe poder
                  // seleccionarlo para ver que no hay stock, y así entender por
                  // qué el botón de compra queda bloqueado.
                  aria-pressed={selected}
                  title={available ? value : `${value} — sin stock`}
                  className={cn(
                    'cursor-pointer rounded-md border text-sm transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                    swatch ? 'h-8 w-8' : 'min-w-11 px-3 py-2',
                    selected ? 'border-fg' : 'border-border hover:border-border-strong',
                    // Tachado diagonal para el agotado: no depende sólo del color.
                    !available &&
                      'relative text-fg-subtle before:absolute before:inset-0 before:m-auto before:h-px before:w-full before:rotate-[-20deg] before:bg-border-strong',
                  )}
                >
                  {swatch ? (
                    <>
                      <span
                        aria-hidden="true"
                        className="block h-full w-full rounded-[3px]"
                        style={{ backgroundColor: swatch }}
                      />
                      <span className="sr-only">{value}</span>
                    </>
                  ) : (
                    value
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
