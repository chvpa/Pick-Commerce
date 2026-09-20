import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESQUEMA_DE_FICHA, MODELO_DE_IMAGEN } from '@pick/commerce-core';
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

/**
 * La ficha del alta (ADR-131) va por el mismo endpoint que el enriquecimiento y
 * con otro esquema. Lo que se prueba con `fetch` simulado es que salga con el
 * esquema correcto —el que declara la etiqueta— y que la respuesta se recorte,
 * porque de ahí sale un precio que alguien va a cobrar.
 */
test('la ficha pide el esquema del alta y recorta lo que devuelve el modelo', async () => {
  const original = globalThis.fetch;
  let enviado: Record<string, unknown> = {};

  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    enviado = JSON.parse(init.body as string) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        status: 'completed',
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  title: 'Vestido midi de lino',
                  description: null,
                  brand: null,
                  category: null,
                  attributes: [],
                  sizes: ['S', 'M'],
                  // Un dígito cambiado: no tiene que llegar a la pantalla.
                  label: { price: 250000, printedPrice: null, sku: null, barcode: '9780306406158' },
                  // Un campo que el esquema no declara, por las dudas.
                  stock: 12,
                }),
              },
            ],
          },
        ],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  try {
    const ficha = await proveedorOpenAI().ficha({
      apiKey: 'sk-de-prueba',
      modelo: 'gpt-5.6-luna',
      imagenes: ['https://x/1.webp', 'https://x/2.webp'],
      categorias: [{ id: 'c1', nombre: 'Vestidos' }],
    });

    assert.equal(ficha.title, 'Vestido midi de lino');
    assert.deepEqual(ficha.sizes, ['S', 'M']);
    assert.equal(ficha.label?.price, 250000);
    assert.equal(ficha.label?.barcode, undefined, 'el código con el dígito cambiado no se ofrece');
    assert.ok(!('stock' in ficha));

    const formato = (enviado.text as { format: { name: string; schema: unknown } }).format;
    assert.equal(formato.name, 'ficha_de_producto');
    assert.deepEqual(formato.schema, ESQUEMA_DE_FICHA);
    const contenido = (enviado.input as { content?: { type: string }[] }[])[1]!.content!;
    assert.equal(contenido.filter((p) => p.type === 'input_image').length, 2);
  } finally {
    globalThis.fetch = original;
  }
});
