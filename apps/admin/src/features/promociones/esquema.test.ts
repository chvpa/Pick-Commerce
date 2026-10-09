import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aDatos, aFormulario, promocionSchema, VALORES_INICIALES } from './esquema.ts';
import type { Promotion } from '@pick/commerce-core';

/**
 * Validación del formulario de promoción.
 *
 * Existe porque los campos numéricos aceptaban cualquier cosa sin avisar: el
 * esquema convertía con `Number()` **antes** de validar, así que un texto se
 * volvía `NaN` y el mensaje resultante hablaba de cero. Lo que se prueba acá es
 * que cada entrada equivocada produzca el mensaje que corresponde.
 */

const BASE = { ...VALORES_INICIALES, title: 'Promo', discountValue: '15' };

/** El mensaje del primer error sobre ese campo, o `null` si pasó. */
function errorDe(campo: string, valores: Record<string, unknown>): string | null {
  const r = promocionSchema.safeParse({ ...BASE, ...valores });
  if (r.success) return null;
  return r.error.issues.find((i) => i.path.join('.') === campo)?.message ?? null;
}

test('un texto en un campo numérico se rechaza diciendo que van números', () => {
  for (const campo of ['usageLimit', 'minSubtotal', 'minQuantity']) {
    assert.match(
      errorDe(campo, { [campo]: 'abc' }) ?? '',
      /Sólo números/,
      `${campo} aceptó un texto o dio un mensaje equivocado`,
    );
  }
});

test('un decimal donde va una cantidad se rechaza', () => {
  // 1,5 usos de un cupón o 2,5 unidades mínimas no significan nada.
  for (const campo of ['usageLimit', 'minQuantity']) {
    assert.match(errorDe(campo, { [campo]: '1.5' }) ?? '', /Sólo números enteros/);
    assert.match(errorDe(campo, { [campo]: '1,5' }) ?? '', /Sólo números enteros/);
  }
});

test('el cero se rechaza donde el campo significa un mínimo', () => {
  assert.match(errorDe('minQuantity', { minQuantity: '0' }) ?? '', /mayor que cero/);
  assert.match(errorDe('usageLimit', { usageLimit: '0' }) ?? '', /mayor que cero/);
});

test('un negativo no pasa por ser negativo, no por otra cosa', () => {
  assert.match(errorDe('minSubtotal', { minSubtotal: '-5' }) ?? '', /Sólo números/);
});

test('vacío significa ausente y es válido', () => {
  const r = promocionSchema.safeParse(BASE);
  assert.ok(r.success, JSON.stringify(r.error?.issues));
  assert.equal(r.data.usageLimit, undefined);
  assert.equal(r.data.minSubtotal, undefined);
  assert.equal(r.data.minQuantity, undefined);
});

test('el porcentaje admite un decimal con coma; el monto fijo no admite ninguno', () => {
  const conComa = promocionSchema.safeParse({ ...BASE, discountValue: '12,5' });
  assert.ok(conComa.success);
  assert.equal(aDatos(conComa.data).discountValue, 1250, 'el 12,5 % no quedó en puntos básicos');

  assert.match(
    errorDe('discountValue', { discountType: 'fixed', discountValue: '50000,5' }) ?? '',
    /no lleva decimales/,
  );

  // Un monto fijo entero sí pasa, aunque sea grande.
  assert.equal(errorDe('discountValue', { discountType: 'fixed', discountValue: '50000' }), null);
});

test('un porcentaje mayor a 100 se rechaza', () => {
  assert.match(errorDe('discountValue', { discountValue: '150' }) ?? '', /no puede pasar de 100/);
});

test('la prioridad vacía vale cero y un texto no pasa', () => {
  assert.equal(promocionSchema.safeParse({ ...BASE, priority: '' }).data?.priority, 0);
  assert.match(errorDe('priority', { priority: 'alta' }) ?? '', /Sólo números enteros/);
});

test('el fin tiene que ser posterior al inicio', () => {
  const r = errorDe('endsAt', {
    startsAt: '2026-12-01T00:00',
    endsAt: '2026-11-01T00:00',
  });
  assert.match(r ?? '', /posterior/);
});

test('un alcance por categoría sin ninguna elegida se rechaza', () => {
  assert.match(errorDe('targetIds', { targetKind: 'category', targetIds: [] }) ?? '', /al menos/);
});

// ---------------------------------------------------------------------------
// Los tipos de carrito (ADR-164): las validaciones del handoff
// ---------------------------------------------------------------------------

test('un 3x2 tiene que pagar menos de lo que lleva', () => {
  assert.match(
    errorDe('paga', { kind: 'buy_x_pay_y', lleva: '2', paga: '2' }) ?? '',
    /menos unidades de las que lleva/,
  );
  assert.equal(errorDe('paga', { kind: 'buy_x_pay_y', lleva: '3', paga: '2' }), null);
});

test('los escalones por monto tienen que crecer', () => {
  const escalones = [
    { hasta: '500000', porcentaje: '5' },
    { hasta: '300000', porcentaje: '10' },
    { hasta: '', porcentaje: '15' },
  ];
  assert.match(
    errorDe('escalonesDeMonto.1.hasta', { kind: 'tiered', escalonesDeMonto: escalones }) ?? '',
    /mayor que el anterior/,
  );
});

test('los escalones por cantidad piden cada vez más unidades', () => {
  const escalones = [
    { desde: '4', porcentaje: '10' },
    { desde: '3', porcentaje: '20' },
  ];
  assert.match(
    errorDe('escalonesDeCantidad.1.desde', { kind: 'quantity', escalonesDeCantidad: escalones }) ??
      '',
    /más unidades que el anterior/,
  );
});

test('un bundle necesita dos productos o más y su colección', () => {
  assert.match(
    errorDe('productosDelBundle', { kind: 'bundle', coleccion: 'c', productosDelBundle: '1' }) ??
      '',
    /al menos 2 productos/,
  );
  assert.match(errorDe('coleccion', { kind: 'bundle' }) ?? '', /Elegí la colección/);
});

test('un envío gratis por zona necesita al menos una', () => {
  assert.match(
    errorDe('zonas', { kind: 'free_shipping', todasLasZonas: false, zonas: [] }) ?? '',
    /al menos una zona/,
  );
});

test('un regalo sin elegir qué se regala no pasa', () => {
  assert.match(errorDe('regalo', { kind: 'gift' }) ?? '', /qué se regala/);
});

test('con código sólo hay descuento o envío gratis', () => {
  assert.match(
    errorDe('kind', { kind: 'buy_x_pay_y', modo: 'codigo', code: 'TRES' }) ?? '',
    /descuento o un envío gratis/,
  );
  assert.match(errorDe('code', { modo: 'codigo', code: '' }) ?? '', /Falta el código/);
});

/** Valida, convierte y vuelve: lo que se guarda tiene que volver a abrir igual. */
function idaYVuelta(valores: Record<string, unknown>) {
  const r = promocionSchema.safeParse({ ...BASE, ...valores });
  assert.ok(r.success, JSON.stringify(r.error?.issues));
  const datos = aDatos(r.data);
  const guardada: Promotion = { ...datos, id: 'x', usageCount: 0 };
  return { datos, formulario: aFormulario(guardada) };
}

test('cada tipo guarda sus reglas y vuelve a abrir con lo mismo', () => {
  const tresX2 = idaYVuelta({ kind: 'buy_x_pay_y', lleva: '3', paga: '2' });
  assert.deepEqual(tresX2.datos.rules, { buy: 3, pay: 2 });
  assert.equal(tresX2.datos.discountType, undefined, 'un 3x2 guardó un descuento');
  assert.equal(tresX2.formulario.lleva, '3');

  const escala = idaYVuelta({ kind: 'tiered' });
  assert.deepEqual(escala.datos.rules, {
    tiers: [{ upTo: 300000, percent: 0 }, { upTo: 600000, percent: 1000 }, { percent: 1500 }],
  });
  assert.deepEqual(escala.formulario.escalonesDeMonto, VALORES_INICIALES.escalonesDeMonto);

  const bundle = idaYVuelta({ kind: 'bundle', coleccion: 'col-1', valorDelBundle: '12,5' });
  assert.deepEqual(bundle.datos.target, { kind: 'collection', ids: ['col-1'] });
  assert.deepEqual(bundle.datos.rules, { count: 2, benefit: 'percent', value: 1250 });
  assert.equal(bundle.formulario.coleccion, 'col-1');
  assert.equal(bundle.formulario.valorDelBundle, '12,5');

  const envio = idaYVuelta({ kind: 'free_shipping', todasLasZonas: false, zonas: ['Central'] });
  assert.deepEqual(envio.datos.rules, { zones: ['Central'] });
  assert.equal(envio.formulario.todasLasZonas, false);

  const regalo = idaYVuelta({ kind: 'gift', regalo: 'v-1', compra: '2' });
  assert.deepEqual(regalo.datos.rules, { buy: 2, giftVariantId: 'v-1', giftQuantity: 1 });
  assert.equal(regalo.formulario.regalo, 'v-1');
});

test('un cupón guarda su código y una automática no, aunque quede escrito', () => {
  assert.equal(idaYVuelta({ modo: 'codigo', code: 'volve10' }).datos.code, 'VOLVE10');
  assert.equal(idaYVuelta({ modo: 'auto', code: 'VIEJO' }).datos.code, undefined);
});
