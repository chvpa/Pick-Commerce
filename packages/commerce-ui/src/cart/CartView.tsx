import { useEffect, useState } from 'preact/hooks';
import { CartContents } from './CartContents.tsx';
import { getLines, subscribe, type CartLine } from './store.ts';

export interface CartViewProps {
  locale?: string;
  checkoutHref?: string;
  className?: string;
}

/**
 * Carrito como página. Existe además del drawer porque un carrito debe poder
 * compartirse por link y sobrevivir a una recarga.
 */
export function CartView({ locale, checkoutHref, className }: CartViewProps) {
  const [lines, setLines] = useState<readonly CartLine[]>([]);

  // Después de montar: el HTML del servidor no conoce el localStorage y leerlo
  // en el primer render provocaría un mismatch de hidratación.
  useEffect(() => {
    setLines(getLines());
    return subscribe(setLines);
  }, []);

  return (
    <CartContents lines={lines} locale={locale} checkoutHref={checkoutHref} className={className} />
  );
}
