import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from './admin-catalog.ts';

test('slugify conserva las palabras al quitar acentos', () => {
  // Sin quitar los acentos antes de filtrar, la í dejaría un hueco:
  // `campera-t-cnica`.
  assert.equal(slugify('Campera técnica'), 'campera-tecnica');
  assert.equal(slugify('Ñandú'), 'nandu');
});

test('slugify colapsa separadores y no deja guiones en los bordes', () => {
  assert.equal(slugify('  Remera 100% algodón  '), 'remera-100-algodon');
  assert.equal(slugify('---A---B---'), 'a-b');
});

test('slugify acota el largo', () => {
  assert.equal(slugify('a'.repeat(200)).length, 80);
});

test('un título sin caracteres utilizables da un handle vacío', () => {
  // Que devuelva vacío y no algo inventado: el formulario lo trata como
  // "todavía no hay handle" y pide uno, en vez de guardar `-` como identidad
  // pública del producto.
  assert.equal(slugify('¿¡!?'), '');
});
