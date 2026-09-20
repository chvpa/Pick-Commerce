import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  configuracionDePagos,
  totalDelCarrito,
  validarCarrito,
  validarDatosDeCheckout,
  type VarianteParaCarrito,
} from './checkout.ts';

const PYG = (amount: number) => ({ amount, currency: 'PYG' });

const REMERA: VarianteParaCarrito = {
  variantId: 'v1',
  title: 'Remera',
  variantTitle: 'M',
  sku: 'REM-M',
  price: PYG(150000),
  available: 5,
};

const GORRA: VarianteParaCarrito = {
  variantId: 'v2',
  title: 'Gorra',
  sku: 'GOR-1',
  price: PYG(90000),
  available: 2,
};

// --- Validación del carrito --------------------------------------------------

test('un carrito comprable suma sus líneas', () => {
  const r = validarCarrito(
    [
      { variantId: 'v1', quantity: 2 },
      { variantId: 'v2', quantity: 1 },
    ],
    [REMERA, GORRA],
  );

  assert.equal(r.issues.length, 0);
  assert.equal(r.lines.length, 2);
  assert.deepEqual(r.total, PYG(390000));
  assert.deepEqual(r.lines[0]!.subtotal, PYG(300000));
});

test('una variante que ya no está se informa y no entra en el total', () => {
  const r = validarCarrito(
    [
      { variantId: 'v1', quantity: 1 },
      { variantId: 'fantasma', quantity: 1 },
    ],
    [REMERA],
  );

  assert.deepEqual(r.issues, [{ type: 'variant_unavailable', variantId: 'fantasma' }]);
  assert.deepEqual(r.total, PYG(150000), 'el total incluyó una línea que no se puede comprar');
});

test('sin stock suficiente dice cuánto queda y recorta a eso', () => {
  // Recortar y no perder la línea: la venta de lo que sí hay no se tira. Antes
  // quedaba afuera entera y el producto desaparecía del carrito en el checkout.
  const r = validarCarrito([{ variantId: 'v2', quantity: 5 }], [GORRA]);
  assert.deepEqual(r.issues, [{ type: 'insufficient_stock', variantId: 'v2', available: 2 }]);
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0]!.quantity, 2);
  assert.deepEqual(r.total, PYG(180000));
});

test('con cero disponible la línea sí sale del carrito', () => {
  const r = validarCarrito([{ variantId: 'v2', quantity: 1 }], [{ ...GORRA, available: 0 }]);
  assert.deepEqual(r.issues, [{ type: 'insufficient_stock', variantId: 'v2', available: 0 }]);
  assert.deepEqual(r.lines, []);
  assert.deepEqual(r.total, PYG(0));
});

test('un stock negativo se le muestra al comprador como cero', () => {
  // Un negativo es un descuadre del espejo del ERP. Decirle «quedan -3» a quien
  // está comprando no significa nada.
  const r = validarCarrito(
    [{ variantId: 'v3', quantity: 1 }],
    [{ ...GORRA, variantId: 'v3', available: -3 }],
  );
  assert.deepEqual(r.issues, [{ type: 'insufficient_stock', variantId: 'v3', available: 0 }]);
});

test('dos líneas de la misma variante se validan sumadas', () => {
  const r = validarCarrito(
    [
      { variantId: 'v2', quantity: 2 },
      { variantId: 'v2', quantity: 1 },
    ],
    [GORRA],
  );
  assert.equal(r.issues.length, 1, 'validó cada línea contra el stock entero');
  assert.equal(r.issues[0]!.type, 'insufficient_stock');
});

test('dos líneas de la misma variante que sí entran se consolidan en una', () => {
  const r = validarCarrito(
    [
      { variantId: 'v1', quantity: 2 },
      { variantId: 'v1', quantity: 1 },
    ],
    [REMERA],
  );
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0]!.quantity, 3);
  assert.deepEqual(r.total, PYG(450000));
});

test('el orden de las líneas es el que trajo el carrito', () => {
  const r = validarCarrito(
    [
      { variantId: 'v2', quantity: 1 },
      { variantId: 'v1', quantity: 1 },
    ],
    [REMERA, GORRA],
  );
  assert.deepEqual(
    r.lines.map((l) => l.variantId),
    ['v2', 'v1'],
  );
});

test('un carrito vacío no es un error', () => {
  const r = validarCarrito([], []);
  assert.deepEqual(r, { lines: [], issues: [], total: PYG(0) });
});

// --- Totales ------------------------------------------------------------------

test('sumar monedas distintas falla en vez de dar un número equivocado', () => {
  assert.throws(
    () => totalDelCarrito([{ subtotal: PYG(1000) }, { subtotal: { amount: 50, currency: 'USD' } }]),
    TypeError,
  );
});

// --- Datos del checkout --------------------------------------------------------

const VALIDOS = {
  customer: { name: 'Ana López', email: 'Ana@Cliente.TEST', phone: '0981 123 456' },
  address: { street: 'Avda. Siempre Viva 742', city: 'Asunción' },
  paymentMethod: 'bank_transfer',
};

test('los datos válidos se normalizan', () => {
  const r = validarDatosDeCheckout(VALIDOS);
  assert.deepEqual(r.errores, {});
  assert.equal(r.datos!.customer.email, 'ana@cliente.test', 'no bajó el email a minúsculas');
  assert.equal(r.datos!.customer.phone, '0981123456', 'no limpió el teléfono');
});

test('los campos opcionales vacíos se omiten, no van vacíos', () => {
  const r = validarDatosDeCheckout({
    ...VALIDOS,
    notes: '   ',
    customer: { ...VALIDOS.customer, taxId: '' },
  });
  assert.ok(!('notes' in r.datos!), 'mandó una nota vacía');
  assert.ok(!('taxId' in r.datos!.customer), 'mandó un RUC vacío');
});

test('los datos fiscales llegan cuando están', () => {
  const r = validarDatosDeCheckout({
    ...VALIDOS,
    customer: { ...VALIDOS.customer, taxId: '80012345-6', taxName: 'Comercial S.A.' },
  });
  assert.equal(r.datos!.customer.taxId, '80012345-6');
  assert.equal(r.datos!.customer.taxName, 'Comercial S.A.');
});

test('el teléfono acepta las formas en que la gente lo escribe', () => {
  for (const phone of [
    '0981123456',
    '0981 123 456',
    '+595 981 123456',
    '(0981) 123-456',
    '021 555 444',
  ]) {
    const r = validarDatosDeCheckout({ ...VALIDOS, customer: { ...VALIDOS.customer, phone } });
    assert.deepEqual(r.errores, {}, `rechazó un teléfono válido: ${phone}`);
  }
});

test('cada campo inválido dice qué hacer', () => {
  const r = validarDatosDeCheckout({
    customer: { name: 'A', email: 'sin-arroba', phone: '123' },
    address: { street: '', city: '' },
    paymentMethod: '',
  });
  assert.deepEqual(Object.keys(r.errores).sort(), [
    'city',
    'email',
    'name',
    'paymentMethod',
    'phone',
    'street',
  ]);
  assert.equal(r.datos, undefined, 'devolvió datos pese a los errores');
});

test('una entrada que no es un objeto no rompe', () => {
  for (const entrada of [null, undefined, 'texto', 42, []]) {
    const r = validarDatosDeCheckout(entrada);
    assert.ok(Object.keys(r.errores).length > 0, `aceptó ${JSON.stringify(entrada)}`);
  }
});

// --- Formas de pago -------------------------------------------------------------

test('sin configuración, la tienda igual puede vender por transferencia', () => {
  for (const settings of [null, undefined, {}, { payments: null }, { payments: { enabled: [] } }]) {
    const r = configuracionDePagos(settings);
    assert.deepEqual(
      r.enabled,
      ['bank_transfer'],
      `no cayó al default con ${JSON.stringify(settings)}`,
    );
    assert.equal(r.default, 'bank_transfer');
  }
});

test('la configuración de la tienda manda', () => {
  const r = configuracionDePagos({
    payments: {
      enabled: ['bank_transfer', 'bancard'],
      default: 'bancard',
      bankTransfer: { instructions: 'Banco X, cuenta 123' },
    },
  });
  assert.deepEqual(r.enabled, ['bank_transfer', 'bancard']);
  assert.equal(r.default, 'bancard');
  assert.equal(r.bankTransfer?.instructions, 'Banco X, cuenta 123');
});

test('un default que no está habilitado se cae al primero habilitado', () => {
  const r = configuracionDePagos({ payments: { enabled: ['bank_transfer'], default: 'bancard' } });
  assert.equal(r.default, 'bank_transfer', 'ofreció un método que no está habilitado');
});
