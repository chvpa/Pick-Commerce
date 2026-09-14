import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuentasHabilitadas } from './accounts.ts';

test('las cuentas están apagadas mientras nadie las prenda', () => {
  // Los cuatro son «no configurado» y los cuatro llegan de verdad: `settings`
  // viene de un `maybeSingle()` que puede no traer fila, y de un jsonb que
  // puede no tener la clave.
  for (const settings of [null, undefined, {}, { otra: 'cosa' }]) {
    assert.equal(cuentasHabilitadas(settings), false);
  }
});

test('sólo el booleano verdadero las prende', () => {
  assert.equal(cuentasHabilitadas({ accounts: true }), true);

  // Nada de `truthy`: un `'true'` que quedó de un formulario mal serializado no
  // puede habilitar un login que el correo de esa tienda quizá no sostenga.
  for (const valor of ['true', 1, 'si', {}]) {
    assert.equal(cuentasHabilitadas({ accounts: valor }), false, `${JSON.stringify(valor)}`);
  }
});
