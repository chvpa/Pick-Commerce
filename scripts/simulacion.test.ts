import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARQUETIPOS, prng, simular, type ProductoSim } from './simulacion.ts';

const productos: ProductoSim[] = Array.from({ length: 200 }, (_, i) => ({
  id: `p${i}`,
  handle: `producto-${i}`,
  title: `Remera deportiva ${i}`,
  brand: i % 2 ? 'Nike' : 'Adidas',
  categoria: ['Remeras', 'Calzado', 'Accesorios'][i % 3]!,
  // Un tercio sin stock: la simulación no puede venderlo.
  variantes: [{ id: `v${i}`, available: i % 3 === 2 ? 0 : 3 }],
}));

const opciones = {
  semilla: 7,
  dias: 120,
  compradores: 300,
  visitasPorDia: 20,
  hasta: new Date('2026-09-01T00:00:00Z'),
  productos,
};

test('la misma semilla da la misma tienda', () => {
  assert.deepEqual(simular(opciones), simular(opciones));
  assert.notDeepEqual(simular(opciones), simular({ ...opciones, semilla: 8 }));
});

test('todo cae dentro del período y en orden', () => {
  const visitas = simular(opciones);
  const desde = opciones.hasta.getTime() - opciones.dias * 86_400_000;
  let anterior = 0;
  for (const v of visitas) {
    assert.ok(v.at.getTime() >= desde && v.at.getTime() < opciones.hasta.getTime());
    assert.ok(v.at.getTime() >= anterior);
    anterior = v.at.getTime();
  }
});

test('nunca vende más de lo que hay, ni lo que no tiene stock', () => {
  const vendido = new Map<string, number>();
  for (const v of simular(opciones)) {
    for (const l of v.pedido?.lineas ?? []) {
      vendido.set(l.variantId, (vendido.get(l.variantId) ?? 0) + l.quantity);
    }
  }
  assert.ok(vendido.size > 0);
  for (const [variante, unidades] of vendido) {
    const disponible = productos.flatMap((p) => p.variantes).find((x) => x.id === variante)!;
    assert.ok(
      unidades <= disponible.available,
      `${variante}: ${unidades} > ${disponible.available}`,
    );
  }
});

test('una compra recorre el embudo entero, y sólo las compras lo terminan', () => {
  for (const v of simular(opciones)) {
    const tipos = v.eventos.map((e) => e.type);
    assert.equal(tipos.includes('checkout_completed'), v.pedido !== undefined);
    if (v.pedido) {
      assert.ok(tipos.includes('add_to_cart') && tipos.includes('begin_checkout'));
      assert.ok(tipos.indexOf('begin_checkout') < tipos.indexOf('checkout_completed'));
    }
    const segundos = v.eventos.map((e) => e.segundo);
    assert.deepEqual(
      segundos,
      [...segundos].sort((a, b) => a - b),
    );
  }
});

test('la recurrencia es desigual: la mayoría compra una vez y unos pocos vuelven mucho', () => {
  const porComprador = new Map<string, number>();
  for (const v of simular({ ...opciones, compradores: 1000, dias: 170 })) {
    if (v.pedido)
      porComprador.set(
        v.pedido.comprador.email,
        (porComprador.get(v.pedido.comprador.email) ?? 0) + 1,
      );
  }
  const una = [...porComprador.values()].filter((n) => n === 1).length / porComprador.size;
  const cuatroOMas = [...porComprador.values()].filter((n) => n >= 4).length;
  assert.ok(una > 0.55 && una < 0.85, `compran una vez: ${una}`);
  assert.ok(cuatroOMas > 0, 'nadie volvió cuatro veces');
});

test('los correos no pueden existir y los pesos de arquetipo suman uno', () => {
  for (const v of simular(opciones)) {
    if (v.pedido) assert.match(v.pedido.comprador.email, /@simulacion\.invalid$/);
  }
  const total = Object.values(ARQUETIPOS).reduce((s, a) => s + a.peso, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
});

test('el generador reparte en [0, 1)', () => {
  const r = prng(1);
  for (let i = 0; i < 10_000; i++) {
    const x = r();
    assert.ok(x >= 0 && x < 1);
  }
});
