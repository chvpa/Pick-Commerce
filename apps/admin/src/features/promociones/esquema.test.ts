import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promocionSchema } from './esquema.ts';

/**
 * Validación del formulario de promoción.
 *
 * Existe porque los campos numéricos aceptaban cualquier cosa sin avisar: el
 * esquema convertía con `Number()` **antes** de validar, así que un texto se
 * volvía `NaN` y el mensaje resultante hablaba de cero. Lo que se prueba acá es
 * que cada entrada equivocada produzca el mensaje que corresponde.
 */

const BASE = {
  title: 'Promo',
  status: 'draft' as const,
  priority: '0',
  stackable: false,
  discountType: 'percentage' as const,
  discountValue: '15',
  targetKind: 'all' as const,
  targetIds: [],
  code: '',
  startsAt: '',
  endsAt: '',
  usageLimit: '',
  minSubtotal: '',
  minQuantity: '',
};

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
  assert.equal(conComa.data.discountValue, 12.5);

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
