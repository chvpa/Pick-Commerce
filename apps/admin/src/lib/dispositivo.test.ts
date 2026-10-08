import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispositivoDe, esMovil } from './dispositivo.ts';

const UA = {
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  firefoxMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15.6; rv:143.0) Gecko/20100101 Firefox/143.0',
};

test('dice el navegador y el sistema como los reconoce una persona', () => {
  assert.equal(dispositivoDe(UA.chromeWindows), 'Chrome en Windows');
  // Edge se presenta también como Chrome, y un iPhone como Mac: el orden decide.
  assert.equal(dispositivoDe(UA.edgeWindows), 'Edge en Windows');
  assert.equal(dispositivoDe(UA.safariIphone), 'Safari en iPhone');
  assert.equal(dispositivoDe(UA.chromeAndroid), 'Chrome en Android');
  assert.equal(dispositivoDe(UA.firefoxMac), 'Firefox en Mac');
  assert.equal(dispositivoDe(null), 'Un navegador sin nombre');
});

test('el teléfono se distingue de la computadora', () => {
  assert.equal(esMovil(UA.safariIphone), true);
  assert.equal(esMovil(UA.chromeAndroid), true);
  assert.equal(esMovil(UA.chromeWindows), false);
  assert.equal(esMovil(null), false);
});
