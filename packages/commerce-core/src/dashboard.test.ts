import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodoAnterior, rangoDePeriodo, variacion } from './dashboard.ts';

/**
 * Los rangos de los períodos y la comparación con el anterior: lo único con
 * lógica del módulo, el resto son tipos.
 *
 * Los casos usan una fecha fija y comparan contra fechas construidas igual, no
 * contra cadenas literales: los tests corren en el huso de quien los ejecuta, y
 * afirmar `'2026-08-27T00:00:00.000Z'` los ataría al de quien los escribió.
 */

const AHORA = new Date(2026, 7, 27, 15, 30, 45, 123); // 27/08/2026 15:30 local

test('hoy se compara con ayer a la misma hora', () => {
  const hoy = rangoDePeriodo('hoy', new Date(2026, 9, 7, 15, 0));
  const ayer = periodoAnterior('hoy', hoy);
  assert.equal(new Date(ayer.from).getTime(), new Date(2026, 9, 6, 0, 0).getTime());
  assert.equal(new Date(ayer.to).getTime(), new Date(2026, 9, 6, 15, 0).getTime());
});

test('7d y 30d se comparan con la ventana de antes, del mismo largo', () => {
  const rango = rangoDePeriodo('30d', new Date(2026, 9, 7, 15, 0));
  const antes = periodoAnterior('30d', rango);
  assert.equal(antes.to, rango.from);
  assert.equal(
    new Date(antes.to).getTime() - new Date(antes.from).getTime(),
    new Date(rango.to).getTime() - new Date(rango.from).getTime(),
  );
});

test('la variación es nula cuando antes no hubo nada', () => {
  assert.equal(variacion(120, 100), 0.2);
  assert.equal(variacion(80, 100), -0.2);
  assert.equal(variacion(50, 0), null);
  assert.equal(variacion(0, 0), null);
});

test('el extremo superior es siempre el momento actual', () => {
  for (const periodo of ['hoy', '7d', '30d'] as const) {
    assert.equal(rangoDePeriodo(periodo, AHORA).to, AHORA.toISOString());
  }
});

test('hoy arranca a la medianoche local, no hace 24 horas', () => {
  // La diferencia importa: a las 15:30, "hace 24 horas" incluiría la tarde de
  // ayer, y el operador que pregunta cuánto vendió hoy no está preguntando eso.
  const { from } = rangoDePeriodo('hoy', AHORA);
  const medianoche = new Date(2026, 7, 27, 0, 0, 0, 0);
  assert.equal(from, medianoche.toISOString());
});

test('7d y 30d son ventanas móviles que conservan la hora', () => {
  assert.equal(
    rangoDePeriodo('7d', AHORA).from,
    new Date(2026, 7, 20, 15, 30, 45, 123).toISOString(),
  );
  assert.equal(
    rangoDePeriodo('30d', AHORA).from,
    new Date(2026, 6, 28, 15, 30, 45, 123).toISOString(),
  );
});

test('el rango no se sale cuando el mes cambia', () => {
  // Restar 30 días al 5 de enero cruza el año. `setDate` con un negativo lo
  // resuelve solo; el test está para que siga siendo así si alguien lo reescribe
  // restando milisegundos.
  const enero = new Date(2026, 0, 5, 10, 0, 0, 0);
  assert.equal(rangoDePeriodo('30d', enero).from, new Date(2025, 11, 6, 10, 0, 0, 0).toISOString());
});

test('no muta la fecha que recibe', () => {
  const ahora = new Date(AHORA);
  rangoDePeriodo('30d', ahora);
  assert.equal(ahora.getTime(), AHORA.getTime(), 'le movió el reloj a quien la llamó');
});
