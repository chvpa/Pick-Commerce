import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  categoriasDe,
  categoriasDeLaSeccion,
  columnasDe,
  columnasEnElTelefonoDe,
  moverEn,
  productosDe,
  tipoDe,
} from './content.ts';

test('mover cambia el orden sin tocar la lista original', () => {
  const original = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moverEn(original, 2, 0), ['c', 'a', 'b', 'd']);
  assert.deepEqual(moverEn(original, 0, 3), ['b', 'c', 'd', 'a']);
  assert.deepEqual(original, ['a', 'b', 'c', 'd'], 'se mutó la lista de entrada');
});

test('subir el primero o bajar el último no hace nada, y no lanza', () => {
  // Es lo que pasa cuando alguien insiste con la flecha: tiene que ser inofensivo.
  const lista = ['a', 'b', 'c'];
  assert.deepEqual(moverEn(lista, 0, -1), lista);
  assert.deepEqual(moverEn(lista, 2, 3), lista);
  assert.deepEqual(moverEn(lista, 1, 1), lista);
  assert.deepEqual(moverEn(lista, 9, 0), lista);
});

test('mover en una lista de uno la deja igual', () => {
  assert.deepEqual(moverEn(['solo'], 0, 0), ['solo']);
});

test('las columnas fuera de rango caen al defecto', () => {
  // El dato viene de un jsonb: un `columns: 97` dibujaría mosaicos de dos píxeles.
  assert.equal(columnasDe({ columns: 3 }), 3);
  assert.equal(columnasDe({ columns: 97 }), 2);
  assert.equal(columnasDe({ columns: 0 }), 2);
  assert.equal(columnasDe({ columns: 2.5 }), 2);
  assert.equal(columnasDe({}), 2);
  assert.equal(columnasDe({ columns: '3' }), 3);
});

test('la cantidad de productos de un carrusel se acota, y sin dato son ocho', () => {
  // Lo que pidió Treeshop: diez en su vitrina, sin cambiarle el carrusel a nadie.
  assert.equal(productosDe({ limit: 10 }), 10);
  assert.equal(productosDe({ limit: '12' }), 12);
  // Sin dato, lo de siempre: las secciones que ya existían no cambian.
  assert.equal(productosDe({}), 8);
  // Fuera de rango, el default: un jsonb con 500 le pediría la tienda entera a
  // la portada.
  assert.equal(productosDe({ limit: 500 }), 8);
  assert.equal(productosDe({ limit: 0 }), 8);
  assert.equal(productosDe({ limit: 7.5 }), 8);
});

test('una colección con reglas es dinámica', () => {
  assert.equal(tipoDe({ rules: { color: ['Negro'] } }), 'dinamica');
  assert.equal(tipoDe({}), 'manual');
  // Sin reglas, aunque el objeto exista vacío, sigue siendo manual: `{}` como
  // regla no acota nada y una colección que no acota nada es todo el catálogo.
  assert.equal(tipoDe({ rules: undefined }), 'manual');
});

// --- Qué categorías muestra una sección -------------------------------------

test('sin selección, la sección muestra todas las categorías', () => {
  // Vacío es «todas» y no «ninguna»: las secciones que ya existían no podían
  // elegir, así que la ausencia de elección tiene que seguir significando lo de
  // siempre.
  assert.deepEqual(categoriasDe({}), []);
  assert.deepEqual(categoriasDe({ categoryIds: 'calzado' }), []);

  const todas = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(categoriasDeLaSeccion(todas, []), todas);
});

test('la sección respeta el orden elegido, no el del catálogo', () => {
  const todas = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(categoriasDeLaSeccion(todas, ['c', 'a']), [{ id: 'c' }, { id: 'a' }]);
});

test('una categoría borrada no rompe la sección: desaparece', () => {
  const todas = [{ id: 'a' }];
  assert.deepEqual(categoriasDeLaSeccion(todas, ['a', 'fantasma']), [{ id: 'a' }]);
});

test('los ids que no son texto se descartan al leerlos', () => {
  assert.deepEqual(categoriasDe({ categoryIds: ['a', '', 'b'] as unknown as readonly string[] }), [
    'a',
    'b',
  ]);
});

test('en el teléfono, una o dos columnas, y nunca más que en la computadora', () => {
  assert.equal(columnasEnElTelefonoDe({}), 1);
  assert.equal(columnasEnElTelefonoDe({ columns: 3, mobileColumns: 2 }), 2);
  assert.equal(columnasEnElTelefonoDe({ columns: 3, mobileColumns: '2' }), 2);
  assert.equal(columnasEnElTelefonoDe({ columns: 3, mobileColumns: 7 }), 1);
  // Dos en el teléfono con una en la pantalla grande no es un diseño.
  assert.equal(columnasEnElTelefonoDe({ columns: 1, mobileColumns: 2 }), 1);
});
