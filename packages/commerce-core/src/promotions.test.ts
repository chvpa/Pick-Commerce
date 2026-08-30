import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  alcanza,
  aplicarAlCarrito,
  aplicarCadena,
  esDeCatalogo,
  precioDeCatalogo,
  vigente,
  type LineaParaPromocion,
  type Promotion,
} from './promotions.ts';

/**
 * El motor de promociones.
 *
 * Lo que se prueba es lo que pierde plata **sin lanzar una excepción**: el
 * redondeo, los bordes de vigencia, el tope de un descuento fijo mayor que el
 * precio, y sobre todo que el precio unitario del catálogo y el total del
 * carrito no se contradigan.
 */

const PYG = (amount: number) => ({ amount, currency: 'PYG' });

function promo(parcial: Partial<Promotion> = {}): Promotion {
  return {
    id: 'p1',
    title: 'Promoción de prueba',
    status: 'active',
    priority: 0,
    stackable: false,
    usageCount: 0,
    discountType: 'percentage',
    discountValue: 1500,
    target: { kind: 'all' },
    ...parcial,
  };
}

const PRODUCTO = { productId: 'prod-1', categoryId: 'cat-1', collectionIds: ['col-1'] };
const AHORA = new Date('2026-09-01T12:00:00Z');

// ---------------------------------------------------------------------------
// Catálogo contra carrito
// ---------------------------------------------------------------------------

test('una promoción con mínimo de compra no es de catálogo', () => {
  // No se puede pintar en la PLP: no hay carrito todavía contra el que evaluarla.
  assert.equal(esDeCatalogo(promo()), true);
  assert.equal(esDeCatalogo(promo({ minSubtotal: 100_000 })), false);
  assert.equal(esDeCatalogo(promo({ minQuantity: 2 })), false);
  assert.equal(esDeCatalogo(promo({ code: 'VERANO' })), false);
});

// ---------------------------------------------------------------------------
// Vigencia
// ---------------------------------------------------------------------------

test('un borrador y una archivada no aplican aunque estén en fecha', () => {
  assert.equal(vigente(promo({ status: 'draft' }), AHORA), false);
  assert.equal(vigente(promo({ status: 'archived' }), AHORA), false);
});

test('los bordes de la vigencia: inicio inclusivo, fin exclusivo', () => {
  const inicio = '2026-09-01T12:00:00Z';
  // Justo en el instante de inicio ya aplica.
  assert.equal(vigente(promo({ startsAt: inicio }), AHORA), true);
  // Un milisegundo antes, no.
  assert.equal(vigente(promo({ startsAt: inicio }), new Date(AHORA.getTime() - 1)), false);

  // Justo en el instante de fin ya NO aplica: una promo que termina el 1 a las
  // 00:00 no vale el día 1.
  assert.equal(vigente(promo({ endsAt: inicio }), AHORA), false);
  assert.equal(vigente(promo({ endsAt: inicio }), new Date(AHORA.getTime() - 1)), true);
});

test('una promoción agotada deja de aplicar', () => {
  assert.equal(vigente(promo({ usageLimit: 10, usageCount: 9 }), AHORA), true);
  assert.equal(vigente(promo({ usageLimit: 10, usageCount: 10 }), AHORA), false);
  // Sin tope, el contador no importa.
  assert.equal(vigente(promo({ usageCount: 9999 }), AHORA), true);
});

// ---------------------------------------------------------------------------
// Alcance
// ---------------------------------------------------------------------------

test('el target decide a qué productos alcanza', () => {
  assert.equal(alcanza(promo({ target: { kind: 'all' } }), PRODUCTO), true);
  assert.equal(alcanza(promo({ target: { kind: 'product', ids: ['prod-1'] } }), PRODUCTO), true);
  assert.equal(alcanza(promo({ target: { kind: 'product', ids: ['otro'] } }), PRODUCTO), false);
  assert.equal(alcanza(promo({ target: { kind: 'category', ids: ['cat-1'] } }), PRODUCTO), true);
  assert.equal(alcanza(promo({ target: { kind: 'collection', ids: ['col-1'] } }), PRODUCTO), true);
  assert.equal(alcanza(promo({ target: { kind: 'collection', ids: ['col-9'] } }), PRODUCTO), false);
});

test('un producto sin categoría no lo alcanza una promoción por categoría', () => {
  // Sin esto, `undefined` entraría en la lista de ids por comparación floja.
  const sinCategoria = { productId: 'prod-2', collectionIds: [] };
  assert.equal(
    alcanza(promo({ target: { kind: 'category', ids: ['cat-1'] } }), sinCategoria),
    false,
  );
});

// ---------------------------------------------------------------------------
// Encadenado y stackability
// ---------------------------------------------------------------------------

test('la más prioritaria que no combina aplica sola', () => {
  const { amount, applied } = aplicarCadena(PYG(100_000), [
    promo({ id: 'a', priority: 10, stackable: false, discountValue: 1000 }),
    promo({ id: 'b', priority: 5, stackable: true, discountValue: 5000 }),
  ]);
  assert.equal(amount.amount, 90_000);
  assert.deepEqual(
    applied.map((a) => a.promotionId),
    ['a'],
  );
});

test('dos que combinan se encadenan, la segunda sobre el precio ya rebajado', () => {
  const { amount, applied } = aplicarCadena(PYG(100_000), [
    promo({ id: 'a', priority: 10, stackable: true, discountValue: 1000 }),
    promo({ id: 'b', priority: 5, stackable: true, discountValue: 1000 }),
  ]);
  // 10 % de 100.000 = 90.000; 10 % de 90.000 = 81.000. No es 80.000.
  assert.equal(amount.amount, 81_000);
  assert.equal(applied.length, 2);
});

test('la que no combina se saltea si ya se aplicó otra', () => {
  // Declaró que no se suma a otra. Respetar eso importa más que descontar más.
  const { amount, applied } = aplicarCadena(PYG(100_000), [
    promo({ id: 'a', priority: 10, stackable: true, discountValue: 1000 }),
    promo({ id: 'b', priority: 5, stackable: false, discountValue: 5000 }),
  ]);
  assert.equal(amount.amount, 90_000);
  assert.deepEqual(
    applied.map((a) => a.promotionId),
    ['a'],
  );
});

test('sin promociones el importe queda intacto', () => {
  const { amount, applied } = aplicarCadena(PYG(100_000), []);
  assert.equal(amount.amount, 100_000);
  assert.equal(applied.length, 0);
});

test('la prioridad empata por id, para que el orden sea total', () => {
  // Sin desempate, dos promos de igual prioridad podrían encadenarse en distinto
  // orden en el catálogo y en el carrito, y con descuentos encadenados eso da
  // precios distintos.
  const promos = [
    promo({ id: 'b', priority: 5, stackable: true, discountType: 'fixed', discountValue: 10_000 }),
    promo({ id: 'a', priority: 5, stackable: true, discountValue: 5000 }),
  ];
  const directo = aplicarCadena(PYG(100_000), promos);
  const alReves = aplicarCadena(PYG(100_000), [...promos].reverse());
  assert.equal(directo.amount.amount, alReves.amount.amount);
  assert.deepEqual(
    directo.applied.map((a) => a.promotionId),
    ['a', 'b'],
  );
});

// ---------------------------------------------------------------------------
// Dinero
// ---------------------------------------------------------------------------

test('un descuento fijo mayor que el precio no deja un importe negativo', () => {
  // Un negativo que llega al total es plata que el comercio termina debiendo.
  const { amount } = aplicarCadena(PYG(5000), [
    promo({ discountType: 'fixed', discountValue: 20_000 }),
  ]);
  assert.equal(amount.amount, 0);
});

test('el porcentaje redondea al medio hacia arriba', () => {
  // 15 % de 33.333 son 4.999,95. El guaraní no tiene decimales.
  const { amount, applied } = aplicarCadena(PYG(33_333), [promo({ discountValue: 1500 })]);
  assert.equal(applied[0]!.amount.amount, 5000);
  assert.equal(amount.amount, 28_333);
});

// ---------------------------------------------------------------------------
// Precio de catálogo
// ---------------------------------------------------------------------------

test('el precio de catálogo devuelve el rebajado y tacha el de lista', () => {
  const r = precioDeCatalogo(
    PYG(100_000),
    undefined,
    [promo({ discountValue: 2000 })],
    PRODUCTO,
    AHORA,
  );
  assert.equal(r.price.amount, 80_000);
  assert.equal(r.compareAtPrice?.amount, 100_000);
});

test('sin promoción vigente el precio no se toca', () => {
  const r = precioDeCatalogo(
    PYG(100_000),
    undefined,
    [promo({ status: 'draft' })],
    PRODUCTO,
    AHORA,
  );
  assert.equal(r.price.amount, 100_000);
  assert.equal(r.compareAtPrice, undefined);
});

test('una promoción con condición de carrito no baja el precio del catálogo', () => {
  // Es la regla que parte el modelo en dos, y sin test se rompe sin ruido.
  const r = precioDeCatalogo(
    PYG(100_000),
    undefined,
    [promo({ minSubtotal: 500_000, discountValue: 5000 })],
    PRODUCTO,
    AHORA,
  );
  assert.equal(r.price.amount, 100_000);
});

test('si la variante ya traía un tachado mayor, gana ese', () => {
  // Tachar el de lista mostraría un ahorro más chico del real.
  const r = precioDeCatalogo(
    PYG(100_000),
    PYG(150_000),
    [promo({ discountValue: 2000 })],
    PRODUCTO,
    AHORA,
  );
  assert.equal(r.price.amount, 80_000);
  assert.equal(r.compareAtPrice?.amount, 150_000);
});

// ---------------------------------------------------------------------------
// Carrito
// ---------------------------------------------------------------------------

function linea(parcial: Partial<LineaParaPromocion> = {}): LineaParaPromocion {
  return {
    variantId: 'v1',
    productId: 'prod-1',
    categoryId: 'cat-1',
    collectionIds: ['col-1'],
    listUnitPrice: PYG(100_000),
    quantity: 1,
    ...parcial,
  };
}

test('el precio unitario del catálogo y el total del carrito coinciden', () => {
  // El caso que obliga a descontar por unidad y no sobre el subtotal: con ₲10 al
  // 15 %, por unidad son ₲8 y tres unidades ₲24; sobre el subtotal serían ₲25.
  // La PLP diría 8 cada uno y el carrito cobraría 25 por tres.
  const p = promo({ discountValue: 1500 });
  const unitario = precioDeCatalogo(PYG(10), undefined, [p], PRODUCTO, AHORA);
  const carrito = aplicarAlCarrito([linea({ listUnitPrice: PYG(10), quantity: 3 })], [p], AHORA);

  assert.equal(unitario.price.amount, 8);
  assert.equal(carrito.total.amount, unitario.price.amount * 3);
});

test('el subtotal es de lista y el descuento es la diferencia', () => {
  const carrito = aplicarAlCarrito(
    [linea({ quantity: 2 })],
    [promo({ discountValue: 2500 })],
    AHORA,
  );
  assert.equal(carrito.subtotal.amount, 200_000);
  assert.equal(carrito.total.amount, 150_000);
  assert.equal(carrito.discount.amount, 50_000);
});

test('el mínimo de compra se evalúa justo por debajo y justo por encima', () => {
  const p = promo({ minSubtotal: 200_000, discountType: 'fixed', discountValue: 30_000 });

  const justoAbajo = aplicarAlCarrito([linea({ listUnitPrice: PYG(199_999) })], [p], AHORA);
  assert.equal(justoAbajo.discount.amount, 0);

  const justo = aplicarAlCarrito([linea({ listUnitPrice: PYG(200_000) })], [p], AHORA);
  assert.equal(justo.discount.amount, 30_000);
});

test('el mínimo de cantidad cuenta unidades, no líneas', () => {
  const p = promo({ minQuantity: 3, discountType: 'fixed', discountValue: 10_000 });

  const dosLineas = aplicarAlCarrito(
    [linea({ variantId: 'v1' }), linea({ variantId: 'v2' })],
    [p],
    AHORA,
  );
  assert.equal(dosLineas.discount.amount, 0);

  const tresUnidades = aplicarAlCarrito([linea({ quantity: 3 })], [p], AHORA);
  assert.equal(tresUnidades.discount.amount, 10_000);
});

test('el cupón se aplica sin distinguir mayúsculas', () => {
  const cupon = promo({ code: 'VERANO26', discountType: 'fixed', discountValue: 25_000 });
  const carrito = aplicarAlCarrito([linea()], [cupon], AHORA, ' verano26 ');
  assert.equal(carrito.couponIssue, undefined);
  assert.equal(carrito.total.amount, 75_000);
});

test('cada motivo de rechazo del cupón se distingue del otro', () => {
  const base = { code: 'VERANO26', discountType: 'fixed' as const, discountValue: 25_000 };
  const con = (p: Partial<Promotion>, codigo = 'VERANO26') =>
    aplicarAlCarrito([linea()], [promo({ ...base, ...p })], AHORA, codigo).couponIssue;

  assert.equal(con({}, 'NOEXISTE'), 'not_found');
  assert.equal(con({ status: 'archived' }), 'not_found');
  assert.equal(con({ startsAt: '2026-12-01T00:00:00Z' }), 'not_started');
  assert.equal(con({ endsAt: '2026-08-01T00:00:00Z' }), 'expired');
  assert.equal(con({ usageLimit: 5, usageCount: 5 }), 'exhausted');
  assert.equal(con({ minSubtotal: 999_999 }), 'minimum');
});

test('un cupón inválido no toca el resto del carrito', () => {
  // El error del cupón no puede vaciar el carrito ni anular la promo automática.
  const carrito = aplicarAlCarrito(
    [linea()],
    [promo({ id: 'auto', discountValue: 1000 })],
    AHORA,
    'NOEXISTE',
  );
  assert.equal(carrito.couponIssue, 'not_found');
  assert.equal(carrito.lines.length, 1);
  assert.equal(carrito.total.amount, 90_000);
});

test('el cupón se suma después de la promoción de catálogo', () => {
  const carrito = aplicarAlCarrito(
    [linea()],
    [
      promo({ id: 'auto', discountValue: 1000 }),
      promo({ id: 'cup', code: 'X', discountType: 'fixed', discountValue: 10_000 }),
    ],
    AHORA,
    'X',
  );
  // 100.000 → 90.000 por el 10 %, y el cupón descuenta 10.000 sobre eso.
  assert.equal(carrito.total.amount, 80_000);
  assert.equal(carrito.discount.amount, 20_000);
});

test('lo aplicado se guarda con el monto por línea, no por unidad', () => {
  // Es lo que va al snapshot del pedido: si guardara el unitario, el pedido
  // diría que descontó 10.000 cuando descontó 30.000.
  const carrito = aplicarAlCarrito(
    [linea({ quantity: 3 })],
    [promo({ discountType: 'fixed', discountValue: 10_000 })],
    AHORA,
  );
  assert.equal(carrito.applied[0]!.amount.amount, 30_000);
  assert.equal(carrito.discount.amount, 30_000);
});

test('un carrito vacío no rompe ni inventa una moneda', () => {
  const carrito = aplicarAlCarrito([], [promo()], AHORA);
  assert.equal(carrito.total.amount, 0);
  assert.equal(carrito.discount.amount, 0);
  assert.equal(carrito.applied.length, 0);
});
