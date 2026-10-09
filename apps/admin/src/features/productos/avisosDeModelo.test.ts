import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisosDelModelo } from './avisosDeModelo.ts';

test('un modelo sin eje pide elegirlo; uno vacío no dice nada', () => {
  assert.deepEqual(avisosDelModelo([], null), []);
  assert.match(avisosDelModelo([{ title: 'A', value: 'Negro' }], null)[0]!, /Elegí por qué/);
});

test('avisa del que no tiene valor y de los repetidos', () => {
  const avisos = avisosDelModelo(
    [
      { title: 'Negra', value: 'Negro' },
      { title: 'Otra negra', value: 'Negro' },
      { title: 'Sin color' },
    ],
    'color',
  );
  assert.equal(avisos.length, 2);
  assert.match(avisos[0]!, /«Sin color» no tiene color/);
  assert.match(avisos[1]!, /color Negro/);
});

test('un modelo bien armado no tiene avisos', () => {
  assert.deepEqual(
    avisosDelModelo(
      [
        { title: 'Negra', value: 'Negro' },
        { title: 'Azul', value: 'Azul' },
      ],
      'color',
    ),
    [],
  );
});
