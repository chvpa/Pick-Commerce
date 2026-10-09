import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DatosDePromocion } from '@pick/commerce-core';
import { carritoDeEjemplo } from './vistaPrevia.ts';

/**
 * El carrito de ejemplo del formulario. Lo calcula el core; lo que se prueba
 * es que el ejemplo se arme con lo que hace aplicar a cada tipo.
 */

const EJEMPLO = { title: 'Medias', price: { amount: 80_000, currency: 'PYG' } };

function datos(parcial: Partial<DatosDePromocion> & Pick<DatosDePromocion, 'kind'>) {
  return {
    title: 'Promo',
    status: 'draft',
    priority: 0,
    stackable: false,
    target: { kind: 'all' },
    ...parcial,
  } as DatosDePromocion;
}

test('un 3x2 se ve con tres unidades y una gratis', () => {
  const c = carritoDeEjemplo(
    datos({ kind: 'buy_x_pay_y', rules: { buy: 3, pay: 2 } }),
    EJEMPLO,
    '',
    'es-PY',
  );
  assert.match(c.filas[0]!.etiqueta, /^3 × Medias/);
  assert.equal(c.noAplica, false);
  assert.match(c.total, /160\.000/);
});

test('un regalo se ve como una línea gratis con su nombre', () => {
  const c = carritoDeEjemplo(
    datos({ kind: 'gift', rules: { buy: 1, giftVariantId: 'v', giftQuantity: 1 } }),
    EJEMPLO,
    'Gorra',
    'es-PY',
  );
  assert.ok(c.filas.some((f) => f.etiqueta === '1 × Gorra · regalo' && f.valor === 'Gratis'));
});

test('un bundle se arma con tantos productos distintos como pide', () => {
  const c = carritoDeEjemplo(
    datos({
      kind: 'bundle',
      target: { kind: 'collection', ids: ['trail'] },
      rules: { count: 3, benefit: 'free_shipping' },
    }),
    EJEMPLO,
    '',
    'es-PY',
  );
  assert.equal(c.filas[0]!.etiqueta, '3 productos distintos');
  assert.ok(c.filas.some((f) => f.etiqueta === 'Envío' && f.valor === 'Gratis'));
});

test('un descuento por producto se aplica al producto del ejemplo', () => {
  // El ejemplo sale del alcance: si el carrito usara otro id, el descuento no aplicaría.
  const c = carritoDeEjemplo(
    datos({
      kind: 'discount',
      discountType: 'percentage',
      discountValue: 1000,
      target: { kind: 'product', ids: ['p-1'] },
    }),
    EJEMPLO,
    '',
    'es-PY',
  );
  assert.equal(c.noAplica, false);
  assert.match(c.total, /72\.000/);
});
