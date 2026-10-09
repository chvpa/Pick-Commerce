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
    kind: 'discount',
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

// ---------------------------------------------------------------------------
// Los tipos de carrito (ADR-164)
// ---------------------------------------------------------------------------

/** Una promoción de carrito: sin `discountType`, con lo suyo en `rules`. */
function deCarrito(parcial: Partial<Promotion> & Pick<Promotion, 'kind'>): Promotion {
  return promo({ discountType: undefined, discountValue: undefined, ...parcial });
}

const MEDIA = { productId: 'media', categoryId: 'cat-2', collectionIds: ['trail'] };

test('ningún tipo de carrito se pinta en el catálogo', () => {
  const tipos = [
    'buy_x_pay_y',
    'second_unit',
    'quantity',
    'tiered',
    'gift',
    'bundle',
    'free_shipping',
  ] as const;
  for (const kind of tipos) assert.equal(esDeCatalogo(deCarrito({ kind })), false, kind);
});

test('3x2: cada tres unidades del mismo producto, la más barata es gratis', () => {
  const tresX2 = deCarrito({ kind: 'buy_x_pay_y', rules: { buy: 3, pay: 2 } });
  // Dos talles de la misma media: cuentan juntos, y la gratis es la de 80.000.
  const c = aplicarAlCarrito(
    [
      linea({ ...MEDIA, variantId: 'm-s', listUnitPrice: PYG(80_000), quantity: 1 }),
      linea({ ...MEDIA, variantId: 'm-l', listUnitPrice: PYG(90_000), quantity: 2 }),
    ],
    [tresX2],
    AHORA,
  );
  assert.equal(c.discount.amount, 80_000);
  assert.equal(c.total.amount, 180_000);
  assert.equal(c.applied[0]!.kind, 'buy_x_pay_y');

  // Con cinco unidades sigue siendo una sola gratis; con seis, dos.
  assert.equal(
    aplicarAlCarrito([linea({ quantity: 5 })], [tresX2], AHORA).discount.amount,
    100_000,
  );
  assert.equal(
    aplicarAlCarrito([linea({ quantity: 6 })], [tresX2], AHORA).discount.amount,
    200_000,
  );
});

test('3x2: productos distintos no se juntan para completar el grupo', () => {
  const c = aplicarAlCarrito(
    [linea({ quantity: 2 }), linea({ ...MEDIA, variantId: 'm', quantity: 1 })],
    [deCarrito({ kind: 'buy_x_pay_y', rules: { buy: 3, pay: 2 } })],
    AHORA,
  );
  assert.equal(c.discount.amount, 0);
  assert.equal(c.applied.length, 0);
});

test('un 3x2 mal configurado no regala nada', () => {
  for (const rules of [{ buy: 2, pay: 2 }, { buy: 3 }, { buy: 3, pay: 0 }, {}]) {
    const c = aplicarAlCarrito(
      [linea({ quantity: 6 })],
      [deCarrito({ kind: 'buy_x_pay_y', rules })],
      AHORA,
    );
    assert.equal(c.discount.amount, 0, JSON.stringify(rules));
  }
});

test('2da unidad: de cada par, la más barata lleva el descuento', () => {
  const c = aplicarAlCarrito(
    [linea({ quantity: 3 })],
    [deCarrito({ kind: 'second_unit', rules: { percent: 5000 } })],
    AHORA,
  );
  // Tres unidades son un par y una suelta: un solo 50 %.
  assert.equal(c.discount.amount, 50_000);
});

test('por cantidad: el escalón más alto alcanzado, sobre todas las unidades', () => {
  const porCantidad = deCarrito({
    kind: 'quantity',
    rules: {
      tiers: [
        { minQuantity: 2, percent: 1000 },
        { minQuantity: 4, percent: 2000 },
      ],
    },
  });
  const con = (n: number) =>
    aplicarAlCarrito([linea({ quantity: n })], [porCantidad], AHORA).discount.amount;
  assert.equal(con(1), 0);
  assert.equal(con(3), 30_000);
  assert.equal(con(4), 80_000);
});

test('por cantidad mezclando productos: la más cara se cobra entera', () => {
  const c = aplicarAlCarrito(
    [
      linea({ listUnitPrice: PYG(100_000), quantity: 1 }),
      linea({ ...MEDIA, variantId: 'm', listUnitPrice: PYG(50_000), quantity: 2 }),
    ],
    [
      deCarrito({
        kind: 'quantity',
        rules: { mix: true, tiers: [{ minQuantity: 3, percent: 2000 }] },
      }),
    ],
    AHORA,
  );
  // Tres unidades alcanzan el escalón; el 20 % va sobre las dos de 50.000.
  assert.equal(c.discount.amount, 20_000);
});

test('por monto: el escalón donde cae lo comprado', () => {
  const escala = deCarrito({
    kind: 'tiered',
    rules: {
      tiers: [{ upTo: 200_000, percent: 0 }, { upTo: 400_000, percent: 1000 }, { percent: 1500 }],
    },
  });
  const con = (n: number) =>
    aplicarAlCarrito([linea({ quantity: n })], [escala], AHORA).discount.amount;
  assert.equal(con(2), 0, '200.000 todavía es el primer escalón');
  assert.equal(con(3), 30_000);
  assert.equal(con(4), 40_000, '400.000 es el tope del segundo, inclusive');
  assert.equal(con(5), 75_000);
});

test('regalo: una línea aparte que existe sólo si hay stock', () => {
  const regalo = deCarrito({
    kind: 'gift',
    rules: { buy: 1, giftVariantId: 'medias', giftQuantity: 1 },
  });
  const con = aplicarAlCarrito([linea()], [regalo], AHORA, undefined, {
    stockDeRegalos: { medias: 1 },
  });
  assert.deepEqual(con.gifts, [{ promotionId: 'p1', variantId: 'medias', quantity: 1 }]);
  assert.equal(con.total.amount, 100_000, 'el regalo no cambia lo que se cobra');
  assert.equal(con.applied[0]!.amount.amount, 0);

  const sin = aplicarAlCarrito([linea()], [regalo], AHORA, undefined, {
    stockDeRegalos: { medias: 0 },
  });
  assert.equal(sin.gifts.length, 0, 'sin stock la promoción se pausa');
  assert.equal(sin.applied.length, 0);

  // Si el carrito ya compra la última unidad de esa variante, no se puede regalar.
  const compraLaUltima = aplicarAlCarrito(
    [linea(), linea({ variantId: 'medias', productId: 'medias' })],
    [regalo],
    AHORA,
    undefined,
    { stockDeRegalos: { medias: 1 } },
  );
  assert.equal(compraLaUltima.gifts.length, 0);
});

test('bundle: productos distintos de la colección, no unidades iguales', () => {
  const bundle = deCarrito({
    kind: 'bundle',
    target: { kind: 'collection', ids: ['trail'] },
    rules: { count: 2, benefit: 'percent', value: 1000 },
  });
  const dos = [linea({ ...MEDIA }), linea({ ...MEDIA, variantId: 'z', productId: 'zapatilla' })];

  assert.equal(
    aplicarAlCarrito([linea({ ...MEDIA, quantity: 2 })], [bundle], AHORA).discount.amount,
    0,
  );
  assert.equal(aplicarAlCarrito(dos, [bundle], AHORA).discount.amount, 20_000);

  const conEnvio = aplicarAlCarrito(
    dos,
    [{ ...bundle, rules: { count: 2, benefit: 'free_shipping' } }],
    AHORA,
  );
  assert.equal(conEnvio.freeShipping, true);
  assert.equal(conEnvio.discount.amount, 0);
});

test('envío gratis: sólo en las zonas elegidas', () => {
  const envio = deCarrito({ kind: 'free_shipping', rules: { zones: ['Central'] } });
  const en = (zona?: string) =>
    aplicarAlCarrito([linea()], [envio], AHORA, undefined, zona ? { zona } : {}).freeShipping;
  assert.equal(en('central '), true);
  assert.equal(en('Itapúa'), false);
  assert.equal(en(), false, 'sin zona todavía no se promete');
  assert.equal(
    aplicarAlCarrito([linea()], [deCarrito({ kind: 'free_shipping' })], AHORA).freeShipping,
    true,
    'sin lista de zonas, llega a todas',
  );
});

test('un cupón de envío gratis fuera de su zona lo dice', () => {
  const cupon = deCarrito({ kind: 'free_shipping', code: 'ENVIO', rules: { zones: ['Central'] } });
  const fuera = aplicarAlCarrito([linea()], [cupon], AHORA, 'envio', { zona: 'Itapúa' });
  assert.equal(fuera.couponIssue, 'zone');
  assert.equal(fuera.freeShipping, false);
  const dentro = aplicarAlCarrito([linea()], [cupon], AHORA, 'envio', { zona: 'Central' });
  assert.equal(dentro.freeShipping, true);
  assert.equal(dentro.couponIssue, undefined);
});

test('un 3x2 con código no existe como cupón', () => {
  const c = aplicarAlCarrito(
    [linea({ quantity: 3 })],
    [deCarrito({ kind: 'buy_x_pay_y', code: 'TRES', rules: { buy: 3, pay: 2 } })],
    AHORA,
    'TRES',
  );
  assert.equal(c.couponIssue, 'not_found');
  assert.equal(c.discount.amount, 0, 'tampoco aplica como automática');
});

test('los tipos nuevos respetan la stackability', () => {
  const tresX2 = deCarrito({
    id: 'a',
    kind: 'buy_x_pay_y',
    priority: 2,
    rules: { buy: 3, pay: 2 },
  });
  const diez = promo({ id: 'b', priority: 1, minQuantity: 1, discountValue: 1000 });

  // El 3x2 no combina: aplica él solo y corta.
  const solo = aplicarAlCarrito([linea({ quantity: 3 })], [tresX2, diez], AHORA);
  assert.deepEqual(
    solo.applied.map((a) => a.promotionId),
    ['a'],
  );

  // Si combinan, el 10 % va sobre lo que dejó el 3x2: 200.000 → 180.000.
  const juntas = aplicarAlCarrito(
    [linea({ quantity: 3 })],
    [
      { ...tresX2, stackable: true },
      { ...diez, stackable: true },
    ],
    AHORA,
  );
  assert.equal(juntas.total.amount, 180_000);
});

test('el descuento de un tipo nuevo nunca deja el total bajo cero', () => {
  const c = aplicarAlCarrito(
    [linea({ ...MEDIA }), linea({ ...MEDIA, variantId: 'z', productId: 'zapatilla' })],
    [
      deCarrito({
        kind: 'bundle',
        target: { kind: 'collection', ids: ['trail'] },
        rules: { count: 2, benefit: 'fixed', value: 500_000 },
      }),
    ],
    AHORA,
  );
  assert.equal(c.total.amount, 0);
  assert.equal(c.discount.amount, 200_000);
});
