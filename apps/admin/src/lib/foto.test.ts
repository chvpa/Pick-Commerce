import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LADO_MAXIMO, medidasObjetivo } from './foto.ts';

test('una foto de teléfono se achica hasta el lado máximo, conservando la proporción', () => {
  // 4032 × 3024 es la foto típica de un teléfono, en horizontal.
  assert.deepEqual(medidasObjetivo(4032, 3024), { ancho: LADO_MAXIMO, alto: 1536 });
  // Y en vertical, el lado largo es el alto.
  assert.deepEqual(medidasObjetivo(3024, 4032), { ancho: 1536, alto: LADO_MAXIMO });
});

test('una foto más chica que el tope no se agranda', () => {
  // Agrandar no agrega detalle, sólo peso.
  assert.deepEqual(medidasObjetivo(800, 600), { ancho: 800, alto: 600 });
});

test('el tope también vale para una foto cuadrada', () => {
  assert.deepEqual(medidasObjetivo(5000, 5000), { ancho: LADO_MAXIMO, alto: LADO_MAXIMO });
});
