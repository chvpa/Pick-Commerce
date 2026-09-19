import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EN_PARALELO,
  TOPE_POR_TANDA,
  limpiarFondosEnLote,
  type OperacionesDeLimpieza,
} from './limpieza.ts';

const foto = (n: number) => ({ productId: `p${n}`, title: `Producto ${n}`, url: `u${n}` });

/** Operaciones que registran lo que se les pidió, sin red. */
function operaciones(fallaEn: readonly string[] = []) {
  const propuestas: { productId: string; original: string }[] = [];
  let simultaneas = 0;
  let maximoSimultaneas = 0;

  const ops: OperacionesDeLimpieza = {
    async limpiar(url) {
      simultaneas++;
      maximoSimultaneas = Math.max(maximoSimultaneas, simultaneas);
      await new Promise((r) => setTimeout(r, 5));
      simultaneas--;
      if (fallaEn.includes(url)) throw new Error('OpenAI dijo que no');
      return new File([new Uint8Array([1])], 'x.webp', { type: 'image/webp' });
    },
    async subir() {
      return 'https://x/ia/limpia.webp';
    },
    async proponer(productId, urls) {
      propuestas.push({ productId, original: urls.original });
    },
  };

  return { ops, propuestas, maximo: () => maximoSimultaneas };
}

test('deja una propuesta por foto, con la original de la que partió', async () => {
  const { ops, propuestas } = operaciones();
  const resultado = await limpiarFondosEnLote([foto(1), foto(2), foto(3)], ops);

  assert.equal(resultado.hechas, 3);
  assert.deepEqual(resultado.errores, []);
  assert.deepEqual(
    propuestas.map((p) => [p.productId, p.original]),
    [
      ['p1', 'u1'],
      ['p2', 'u2'],
      ['p3', 'u3'],
    ],
  );
});

test('una foto que falla no tira abajo el resto de la tanda', async () => {
  // Es el caso normal en una tanda de cien: un 429, una foto que OpenAI
  // rechaza. Si cortara, habría que empezar de nuevo y pagar dos veces.
  const { ops, propuestas } = operaciones(['u2']);
  const resultado = await limpiarFondosEnLote([foto(1), foto(2), foto(3)], ops);

  assert.equal(resultado.hechas, 2);
  assert.deepEqual(resultado.errores, [{ title: 'Producto 2', motivo: 'OpenAI dijo que no' }]);
  assert.deepEqual(
    propuestas.map((p) => p.productId),
    ['p1', 'p3'],
  );
});

test('no manda más de dos a la vez: cada una se paga en la cuenta del comercio', async () => {
  const { ops, maximo } = operaciones();
  await limpiarFondosEnLote([foto(1), foto(2), foto(3), foto(4), foto(5)], ops);
  assert.equal(maximo(), EN_PARALELO);
});

test('la tanda tiene tope, aunque se seleccionen más', async () => {
  const { ops } = operaciones();
  const muchas = Array.from({ length: TOPE_POR_TANDA + 20 }, (_, i) => foto(i));
  const resultado = await limpiarFondosEnLote(muchas, ops);
  assert.equal(resultado.hechas, TOPE_POR_TANDA);
});

test('el progreso cuenta también lo que falló', async () => {
  // Si no contara los errores, una tanda con fallas se quedaría clavada en
  // «97 de 100» para siempre.
  const { ops } = operaciones(['u2']);
  const avisos: number[] = [];
  await limpiarFondosEnLote([foto(1), foto(2), foto(3)], ops, (hechas) => avisos.push(hechas));
  assert.deepEqual(avisos, [1, 2, 3]);
});
