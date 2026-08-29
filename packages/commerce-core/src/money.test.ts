import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMoney,
  currencyDecimals,
  discountPercent,
  formatMoney,
  money,
  multiplyMoney,
  percentageOf,
  subtractMoney,
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

test('percentageOf redondea al medio hacia arriba sobre la unidad mínima', () => {
  // 15 % de ₲33.333 son 4.999,95, y el guaraní no tiene decimales.
  assert.equal(percentageOf(money(33_333, 'PYG'), 1500).amount, 5000);
  // En una moneda con decimales el redondeo es sobre el centavo, no sobre el dólar.
  assert.equal(percentageOf(money(10.01, 'USD'), 1500).amount, 150);
  // Los puntos básicos permiten medios porcentajes sin pasar por un float.
  assert.equal(percentageOf(money(1000, 'PYG'), 1250).amount, 125);
});

test('percentageOf rechaza puntos básicos que no sean enteros no negativos', () => {
  assert.throws(() => percentageOf(money(100, 'PYG'), -100), TypeError);
  assert.throws(() => percentageOf(money(100, 'PYG'), 12.5), TypeError);
});

test('subtractMoney topa en cero en vez de devolver un negativo', () => {
  // Un negativo que llega al total es plata que el comercio termina debiendo.
  assert.equal(subtractMoney(money(5000, 'PYG'), money(20_000, 'PYG')).amount, 0);
  assert.equal(subtractMoney(money(20_000, 'PYG'), money(5000, 'PYG')).amount, 15_000);
  assert.throws(() => subtractMoney(money(1, 'USD'), money(1, 'PYG')), TypeError);
});

test('multiplyMoney exige una cantidad entera no negativa', () => {
  assert.equal(multiplyMoney(money(10, 'PYG'), 3).amount, 30);
  assert.equal(multiplyMoney(money(10, 'PYG'), 0).amount, 0);
  assert.throws(() => multiplyMoney(money(10, 'PYG'), 1.5), TypeError);
  assert.throws(() => multiplyMoney(money(10, 'PYG'), -1), TypeError);
});
