import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textoDeLaRespuesta } from './index.ts';

/**
 * La parte frágil del adapter es leer la respuesta: depende de la forma exacta
 * que devuelve la Responses API. Sin esto, un cambio de forma se descubre en
 * producción con un mensaje sobre sintaxis JSON que no dice nada.
 */

test('el texto sale del ítem de tipo message, no del primero', () => {
  // Un modelo que razona mete su ítem adelante. Tomar `output[0]` funciona hasta
  // que el comercio elige un modelo distinto.
  const cuerpo = {
    status: 'completed',
    output: [
      { type: 'reasoning', content: [] },
      { type: 'message', content: [{ type: 'output_text', text: '{"title":"Campera"}' }] },
    ],
  };

  assert.equal(textoDeLaRespuesta(cuerpo), '{"title":"Campera"}');
});

test('una respuesta cortada se explica, en vez de fallar al parsear', () => {
  assert.throws(
    () =>
      textoDeLaRespuesta({
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: [{ type: 'message', content: [{ type: 'output_text', text: '{"title":"Camp' }] }],
      }),
    /cortó la respuesta.*max_output_tokens/,
  );
});

test('una respuesta sin texto lo dice', () => {
  assert.throws(() => textoDeLaRespuesta({ status: 'completed', output: [] }), /sin texto/);
  assert.throws(() => textoDeLaRespuesta({}), /sin texto/);
});
