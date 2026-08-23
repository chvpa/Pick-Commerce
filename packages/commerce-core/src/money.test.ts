import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMoney,
  currencyDecimals,
  discountPercent,
  formatMoney,
  money,
  toMajorUnits,
} from './money.ts';

test('currencyDecimals respeta la moneda', () => {
  assert.equal(currencyDecimals('PYG'), 0);
  assert.equal(currencyDecimals('USD'), 2);
});

test('money guarda unidades mínimas sin error de coma flotante', () => {
  assert.deepEqual(money(1500.5, 'USD'), { amount: 150050, currency: 'USD' });
  assert.deepEqual(money(89900, 'PYG'), { amount: 89900, currency: 'PYG' });
  // 0.1 + 0.2 en float da 0.30000000000000004; en unidades mínimas no.
  assert.equal(addMoney(money(0.1, 'USD'), money(0.2, 'USD')).amount, 30);
});

test('toMajorUnits invierte a money', () => {
  assert.equal(toMajorUnits(money(19.99, 'USD')), 19.99);
  assert.equal(toMajorUnits(money(89900, 'PYG')), 89900);
});

test('formatMoney usa los decimales de cada moneda', () => {
  assert.match(formatMoney(money(89900, 'PYG')), /89\.900/);
  assert.match(formatMoney(money(19.9, 'USD'), 'en-US'), /^\$19\.90$/);
});

test('addMoney rechaza mezclar monedas', () => {
  assert.throws(() => addMoney(money(1, 'USD'), money(1, 'PYG')), TypeError);
});

test('discountPercent redondea hacia abajo y descarta el no-descuento', () => {
  assert.equal(discountPercent(money(70, 'USD'), money(100, 'USD')), 30);
  // 29,7 % real no debe mostrarse como 30 %.
  assert.equal(discountPercent(money(70.3, 'USD'), money(100, 'USD')), 29);
  assert.equal(discountPercent(money(100, 'USD'), money(100, 'USD')), null);
  assert.equal(discountPercent(money(120, 'USD'), money(100, 'USD')), null);
});

test('discountPercent no divide por cero ni acepta monedas mezcladas', () => {
  assert.equal(discountPercent(money(10, 'USD'), money(0, 'USD')), null);
  assert.throws(() => discountPercent(money(1, 'USD'), money(2, 'PYG')), TypeError);
});
