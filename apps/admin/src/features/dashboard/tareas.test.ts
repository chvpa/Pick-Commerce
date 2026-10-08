import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TareasDeLaTienda } from '@pick/commerce-core';
import { esTiendaNueva, haceCuanto, listaDeTareas, pasosDeAlta } from './tareas.ts';

const AHORA = new Date('2026-10-07T15:00:00Z');

const NADA: TareasDeLaTienda = {
  porCobrar: { n: 0, desde: null },
  paraPreparar: { n: 0, desde: null },
  avisosFallidos: { n: 0, pedido: null },
  sinFoto: { n: 0, ocultos: false },
  resenas: { n: 0, ultima: null },
  propuestas: { descripciones: 0, fotos: 0 },
  pedidos: 12,
  alta: { productos: true, pagos: true, envio: true, portada: true, equipo: true },
};

const TODO: TareasDeLaTienda = {
  porCobrar: { n: 4, desde: '2026-10-02T15:00:00Z' },
  paraPreparar: { n: 1, desde: '2026-10-07T12:00:00Z' },
  avisosFallidos: {
    n: 1,
    pedido: { id: 'p1', number: 1045, customerName: 'Rodrigo Villalba' },
  },
  sinFoto: { n: 312, ocultos: true },
  resenas: { n: 5, ultima: { producto: 'Speedcross 6', rating: 5 } },
  propuestas: { descripciones: 18, fotos: 1 },
  pedidos: 64,
  alta: NADA.alta,
};

const opciones = { ahora: AHORA, locale: 'es', veIA: true };

test('sin nada pendiente, no hay tareas', () => {
  assert.deepEqual(listaDeTareas(NADA, opciones), []);
});

test('van por urgencia: lo que le falla a un cliente, la plata, lo que sale, la vitrina', () => {
  assert.deepEqual(
    listaDeTareas(TODO, opciones).map((t) => t.clave),
    ['aviso', 'cobrar', 'preparar', 'foto', 'resena', 'descripciones', 'fotos'],
  );
});

test('un solo aviso lleva a su pedido; varios, a la lista', () => {
  const uno = listaDeTareas(TODO, opciones)[0]!;
  assert.equal(uno.to, '/pedidos/$id');
  assert.deepEqual(uno.params, { id: 'p1' });
  assert.equal(uno.detalle, 'Pedido #1045 · Rodrigo Villalba no recibió el aviso');

  const varios = listaDeTareas(
    { ...TODO, avisosFallidos: { ...TODO.avisosFallidos, n: 3 } },
    opciones,
  )[0]!;
  assert.equal(varios.to, '/pedidos');
  assert.equal(varios.titulo, '3 correos a clientes no se pudieron enviar');
});

test('el singular y el plural se dicen bien', () => {
  const tareas = listaDeTareas(TODO, opciones);
  assert.equal(tareas[1]!.titulo, '4 pedidos esperan que confirmes el pago');
  assert.equal(tareas[2]!.titulo, 'Un pedido pago para preparar');
  assert.equal(tareas[4]!.detalle, 'La más reciente: Speedcross 6 · 5 estrellas');
});

test('sin foto dice si se ven o no, según lo que la tienda oculta', () => {
  const ocultos = listaDeTareas(TODO, opciones).find((t) => t.clave === 'foto')!;
  assert.equal(ocultos.titulo, '312 productos sin foto no se ven en la tienda');

  const visibles = listaDeTareas({ ...TODO, sinFoto: { n: 1, ocultos: false } }, opciones).find(
    (t) => t.clave === 'foto',
  )!;
  assert.equal(visibles.titulo, 'Un producto se muestra sin foto');
});

test('las propuestas de la IA sólo para quien las puede revisar', () => {
  const claves = listaDeTareas(TODO, { ...opciones, veIA: false }).map((t) => t.clave);
  assert.ok(!claves.includes('descripciones'));
  assert.ok(!claves.includes('fotos'));
});

test('el más viejo se cuenta en el tiempo de quien lee', () => {
  assert.equal(haceCuanto('2026-10-02T15:00:00Z', AHORA, 'es'), 'hace 5 días');
  assert.equal(haceCuanto('2026-10-07T12:00:00Z', AHORA, 'es'), 'hace 3 horas');
  assert.equal(haceCuanto('2026-10-06T15:00:00Z', AHORA, 'es'), 'ayer');
});

test('la tienda es nueva sin pedidos y con algún paso pendiente', () => {
  const nueva = { ...NADA, pedidos: 0, alta: { ...NADA.alta, pagos: false } };
  assert.equal(esTiendaNueva(nueva), true);
  // Con todo hecho deja de serlo, aunque todavía no haya vendido.
  assert.equal(esTiendaNueva({ ...NADA, pedidos: 0 }), false);
  // Y con un pedido también: ya está vendiendo.
  assert.equal(esTiendaNueva({ ...nueva, pedidos: 1 }), false);
});

test('crear la tienda siempre está hecho; el resto sale de los datos', () => {
  const pasos = pasosDeAlta({
    productos: true,
    pagos: false,
    envio: false,
    portada: true,
    equipo: false,
  });
  assert.deepEqual(
    pasos.map((p) => [p.clave, p.hecho]),
    [
      ['tienda', true],
      ['productos', true],
      ['pagos', false],
      ['envio', false],
      ['portada', true],
      ['equipo', false],
    ],
  );
});
