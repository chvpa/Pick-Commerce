import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cambiosLegibles, queHizo, type EntradaDeActividad } from './actividad.ts';

const CTX = { currency: 'PYG', locale: 'es-PY' };

function entrada(parte: Partial<EntradaDeActividad>): EntradaDeActividad {
  return { id: 1, at: '2026-10-08T12:00:00Z', action: 'update', entity: 'products', ...parte };
}

test('un precio se lee en plata, y la frase dice de qué variante', () => {
  const e = entrada({
    entity: 'product_variants',
    label: 'M',
    changes: { price: [150000, 175000] },
  });
  assert.equal(queHizo(e), 'cambió el precio de «M»');
  const [cambio] = cambiosLegibles(e, CTX);
  assert.equal(cambio!.campo, 'Precio');
  assert.match(cambio!.antes, /150\.000/);
  assert.match(cambio!.despues, /175\.000/);
});

test('un pedido anulado se dice así, con los estados en castellano', () => {
  const e = entrada({ entity: 'orders', changes: { status: ['received', 'cancelled'] } });
  assert.equal(queHizo(e), 'anuló el pedido');
  const [cambio] = cambiosLegibles(e, CTX);
  assert.equal(cambio!.campo, 'Estado');
  assert.notEqual(cambio!.despues, 'cancelled');
});

test('lo vacío es una raya, un id es «otra» y lo largo se recorta', () => {
  const e = entrada({
    changes: {
      brand: [null, 'Norte'],
      category_id: ['a1', 'b2'],
      description: ['x'.repeat(10), 'y'.repeat(200)],
    },
  });
  const [marca, categoria, descripcion] = cambiosLegibles(e, CTX);
  assert.equal(marca!.antes, '—');
  assert.equal(categoria!.despues, 'otra');
  assert.ok(descripcion!.despues.length <= 80);
});

test('crear, borrar y el stock tienen su propia frase', () => {
  assert.equal(queHizo(entrada({ action: 'insert' })), 'creó el producto');
  assert.equal(
    queHizo(entrada({ entity: 'product_variants', action: 'delete', label: 'L' })),
    'quitó la variante «L»',
  );
  assert.equal(
    queHizo(entrada({ entity: 'inventory_levels', changes: { available: [3, 9] } })),
    'ajustó el stock',
  );
});
