import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agregarOpciones, claveDeCaracteristica } from './caracteristicas.ts';

test('pegar una lista agrega cada opción una vez, sin espacios ni repetidas', () => {
  assert.deepEqual(agregarOpciones(['Azul'], ' Rojo, azul,Verde\n Rojo ,,'), [
    'Azul',
    'Rojo',
    'Verde',
  ]);
});

test('la clave sale del nombre y no pisa una que ya existe', () => {
  assert.equal(claveDeCaracteristica('Silueta', []), 'silueta');
  assert.equal(claveDeCaracteristica('Tipo de tela', []), 'tipo_de_tela');
  assert.equal(claveDeCaracteristica('Color', ['color']), 'color_2');
  assert.equal(claveDeCaracteristica('Color', ['color', 'color_2']), 'color_3');
});
