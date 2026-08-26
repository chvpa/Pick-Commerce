import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  actualizarTasa,
  configuracionDeMoneda,
  configuracionPorDefecto,
} from './currency-config.ts';

test('una tienda sin configurar no convierte', () => {
  const c = configuracionPorDefecto('PYG');
  assert.equal(c.enabled, false);
  assert.deepEqual(c.displayCurrencies, ['PYG']);
  assert.equal(c.checkoutCurrency, 'PYG');
});

test('settings ausentes o corruptos caen al default seguro, no lanzan', () => {
  // Una tienda no debe dejar de vender porque su config de moneda esté mal.
  for (const entrada of [null, undefined, {}, { currency: null }, { currency: 'roto' }]) {
    const c = configuracionDeMoneda(entrada, 'PYG');
    assert.equal(c.base, 'PYG');
    assert.equal(c.enabled, false);
  }
});

test('lee la configuración completa cuando existe', () => {
  const c = configuracionDeMoneda(
    {
      currency: {
        base: 'PYG',
        enabled: true,
        displayCurrencies: ['PYG', 'USD'],
        checkoutCurrency: 'PYG',
        exchangeRate: { mode: 'manual', value: 7350, updatedAt: '2026-01-01T00:00:00Z' },
      },
    },
    'PYG',
  );
  assert.equal(c.enabled, true);
  assert.deepEqual(c.displayCurrencies, ['PYG', 'USD']);
  assert.equal(c.exchangeRate?.value, 7350);
  // Mostrar USD no significa cobrar en USD.
  assert.equal(c.checkoutCurrency, 'PYG');
});

test('actualizarTasa devuelve la config y su auditoría juntas', () => {
  const base = configuracionPorDefecto('PYG');
  const { config, auditoria } = actualizarTasa(base, 7350, 'user-1', '2026-01-01T00:00:00Z');

  assert.equal(config.exchangeRate?.value, 7350);
  assert.equal(config.exchangeRate?.updatedBy, 'user-1');
  assert.equal(auditoria.action, 'currency.rate_updated');
  assert.deepEqual(auditoria.metadata, { anterior: null, nuevo: 7350, base: 'PYG' });

  // El segundo cambio registra de dónde venía.
  const segundo = actualizarTasa(config, 7400, 'user-2', '2026-02-01T00:00:00Z');
  assert.deepEqual(segundo.auditoria.metadata, { anterior: 7350, nuevo: 7400, base: 'PYG' });
});

test('rechaza una tasa que no sea un número positivo', () => {
  const base = configuracionPorDefecto('PYG');
  for (const malo of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => actualizarTasa(base, malo, 'u', 'x'), RangeError);
  }
});
