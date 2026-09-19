import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODELO_DE_IMAGEN } from '@pick/commerce-core';
import { proveedorOpenAI, textoDeLaRespuesta } from './index.ts';

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

/**
 * La petición de limpieza de fondo se arma acá y la ejecuta el Worker del Admin
 * (ADR-130), así que lo único comprobable sin red es su forma. Y su forma es lo
 * que sostiene la promesa: si se pierde el pedido de no tocar el producto, o se
 * cambia el modelo por uno que no es el de edición, la foto que sale ya no es la
 * misma cosa.
 */
test('la limpieza de fondo pide el modelo de edición y que no se toque el producto', () => {
  const { url, init } = proveedorOpenAI().peticionDeLimpiezaDeFondo({
    apiKey: 'sk-de-prueba',
    imagenUrl: 'https://x.supabase.co/storage/v1/object/public/product-media/t/foto.webp',
  });

  assert.equal(url, 'https://api.openai.com/v1/images/edits');
  assert.equal(init.method, 'POST');
  assert.equal(
    (init.headers as Record<string, string>).authorization,
    'Bearer sk-de-prueba',
    'la clave del comercio no viaja en la cabecera',
  );

  const cuerpo = JSON.parse(init.body as string) as Record<string, unknown>;
  assert.equal(cuerpo.model, MODELO_DE_IMAGEN);
  // `input_fidelity` **no** va: la API lo rechaza con este modelo (400).
  assert.equal(cuerpo.input_fidelity, undefined);
  assert.equal(cuerpo.background, 'opaque');
  assert.equal(cuerpo.output_format, 'webp');
  assert.deepEqual(cuerpo.images, [
    { image_url: 'https://x.supabase.co/storage/v1/object/public/product-media/t/foto.webp' },
  ]);

  const pedido = cuerpo.prompt as string;
  for (const debe of ['No cambies el producto', 'logos', 'No agregues sombras']) {
    assert.ok(pedido.includes(debe), `el pedido perdió «${debe}»`);
  }
});
