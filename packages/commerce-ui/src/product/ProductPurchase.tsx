import { useMemo, useState } from 'preact/hooks';
import type { ProductVariant } from '@pick/commerce-types';
import {
  buildVariantOptions,
  defaultSelection,
  discountPercent,
  findVariant,
  formatMoney,
} from '@pick/commerce-core';
import { cn } from '../lib/cn.ts';
import { AddToCart } from './AddToCart.tsx';
import { VariantSelector } from './VariantSelector.tsx';

export interface ProductPurchaseProps {
  variants: readonly ProductVariant[];
  locale?: string;
  swatches?: Readonly<Record<string, string>>;
  className?: string;
}

/**
 * Bloque de compra del PDP: selección de variante, precio y alta al carrito.
 *
 * Es **una sola island** a propósito. Astro no puede pasar estado ni callbacks
 * entre islands, así que separar el selector del botón obligaría a un store
 * compartido. Una única island que contiene los tres controles no necesita
 * ninguna coordinación externa.
 *
 * El precio se renderiza acá y no con el componente `.astro`: cambia al cambiar
 * la variante, así que necesita vivir del lado hidratado. Es el caso previsto
 * en ADR-032; el formato y el descuento siguen viniendo del core.
 */
export function ProductPurchase({ variants, locale, swatches, className }: ProductPurchaseProps) {
  const [selection, setSelection] = useState(() => defaultSelection(variants));

  const options = useMemo(() => buildVariantOptions(variants, selection), [variants, selection]);
  const variant = findVariant(variants, selection);

  const discount =
    variant?.compareAtPrice !== undefined
      ? discountPercent(variant.price, variant.compareAtPrice)
      : null;
  const onSale = discount !== null;

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <div aria-live="polite">
        {variant ? (
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className={cn('text-lg font-medium', onSale && 'text-sale')}>
              {formatMoney(variant.price, locale)}
            </span>
            {onSale && variant.compareAtPrice ? (
              <>
                <s className="text-fg-subtle text-sm">
                  <span className="sr-only">Precio anterior: </span>
                  {formatMoney(variant.compareAtPrice, locale)}
                </s>
                <span className="text-sale text-xs font-medium">-{discount}%</span>
              </>
            ) : null}
          </p>
        ) : (
          <p className="text-fg-muted text-sm">Elegí una combinación disponible</p>
        )}
      </div>

      {options.length > 0 ? (
        <VariantSelector
          options={options}
          selection={selection}
          swatches={swatches}
          onSelect={(name, value) => setSelection((prev) => ({ ...prev, [name]: value }))}
        />
      ) : null}

      {/*
        `key` fuerza a remontar al cambiar de variante: así el estado de
        "agregado" no se arrastra de una variante a la siguiente, que sería
        una confirmación falsa.
      */}
      <AddToCart
        key={variant?.id ?? 'none'}
        variantId={variant?.id ?? ''}
        available={variant?.availableQuantity ?? 0}
      />
    </div>
  );
}
