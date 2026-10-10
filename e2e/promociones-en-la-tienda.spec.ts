import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { clienteDeServidor } from '@pick/adapter-supabase';
import { IDS, INVENTARIO, PRODUCTOS, VARIANTES } from '../scripts/seed-data.ts';

/**
 * Lo que las promociones le hacen al carrito, en la tienda (ADR-164): el 3x2
 * descontado, el regalo como una línea aparte y cuánto falta para el envío
 * gratis.
 *
 * Las promociones se crean acá y se borran al terminar, como el modelo de
 * `modelo-en-la-tienda.spec.ts`: en el seed cambiarían los totales que miran el
 * checkout y el pago. Corre con un solo worker.
 */

if (existsSync('.env')) process.loadEnvFile('.env');
const admin = clienteDeServidor({
  url: process.env.SUPABASE_URL!,
  secretKey: process.env.SUPABASE_SECRET_KEY!,
});

const MARCA = 'E2E promo en la tienda';
const zapatilla = PRODUCTOS.find((p) => p.handle === 'zapatilla-urbana')!;
const mochila = PRODUCTOS.find((p) => p.handle === 'mochila-tecnica')!;
const vZapatilla = VARIANTES.find((v) => v.product_id === zapatilla.id)!;
const vMochila = VARIANTES.find((v) => v.product_id === mochila.id)!;
// Una campera con stock: cuesta menos que el umbral, así que falta para el envío gratis.
const campera = PRODUCTOS.find((p) => p.handle === 'campera-cortaviento')!;
const vCampera = VARIANTES.filter((v) => v.product_id === campera.id).sort(
  (a, b) =>
    (INVENTARIO.find((i) => i.variant_id === b.id)?.available ?? 0) -
    (INVENTARIO.find((i) => i.variant_id === a.id)?.available ?? 0),
)[0]!;
/** El umbral de envío gratis de la tienda, leído de la base: el e2e lo cambia. */
let UMBRAL = 0;

const borrar = () => admin.from('promotions').delete().like('title', `${MARCA}%`);

/*
 * El 3x2 necesita tres zapatillas, y en la corrida completa otros specs las
 * compran: llegó a quedar una y el carrito se recortaba antes de aplicar nada.
 * Se repone para este spec y se deja como estaba.
 */
let stockPrevio: number | undefined;
async function stockDeZapatilla(n?: number): Promise<number> {
  if (n !== undefined) {
    await admin.from('inventory_levels').update({ available: n }).eq('variant_id', vZapatilla.id);
  }
  const { data } = await admin
    .from('inventory_levels')
    .select('available')
    .eq('variant_id', vZapatilla.id)
    .single();
  return data?.available ?? 0;
}

test.beforeAll(async () => {
  const { data: ajustes } = await admin
    .from('store_settings')
    .select('settings')
    .eq('store_id', IDS.store)
    .single();
  UMBRAL = Number(
    (ajustes?.settings as { shipping?: { freeFrom?: number } } | null)?.shipping?.freeFrom ?? 0,
  );
  await borrar();
  stockPrevio = await stockDeZapatilla();
  if (stockPrevio < 10) await stockDeZapatilla(10);
  const { error } = await admin.from('promotions').insert([
    {
      tenant_id: IDS.tenant,
      store_id: IDS.store,
      title: `${MARCA} 3x2`,
      status: 'active',
      stackable: true,
      priority: 0,
      kind: 'buy_x_pay_y',
      rules: { buy: 3, pay: 2 },
      target: { kind: 'product', ids: [zapatilla.id] },
    },
    {
      tenant_id: IDS.tenant,
      store_id: IDS.store,
      title: `${MARCA} regalo`,
      status: 'active',
      kind: 'gift',
      stackable: true,
      priority: 10,
      rules: { buy: 1, giftVariantId: vMochila.id, giftQuantity: 1 },
      target: { kind: 'all' },
    },
  ]);
  expect(error, error?.message).toBeNull();
});

test.afterAll(async () => {
  await borrar();
  if (stockPrevio !== undefined && stockPrevio < 10) await stockDeZapatilla(stockPrevio);
});

async function conCarrito(
  page: Page,
  variante: { id: string; price: number },
  titulo: string,
  cantidad: number,
) {
  await page.goto('/');
  await page.evaluate(
    ([variante, n, titulo, precio]) => {
      localStorage.setItem(
        'pick:cart:v1',
        JSON.stringify([
          {
            variantId: variante,
            quantity: n,
            title: titulo,
            price: { amount: precio, currency: 'PYG' },
            available: 99,
          },
        ]),
      );
    },
    [variante.id, cantidad, titulo, variante.price] as const,
  );
  await page.goto('/carrito');
}

const gs = (n: number) => `Gs. ${n.toLocaleString('es-PY')}`;

test('el carrito muestra el regalo y cuánto falta para el envío gratis', async ({ page }) => {
  await conCarrito(page, vCampera, campera.title, 1);

  await expect(page.getByText(`1 × ${mochila.title}`)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Regalo', { exact: true }).first()).toBeVisible();
  // Una campera no está en el 3x2.
  await expect(page.getByText(`${MARCA} 3x2`)).toHaveCount(0);

  const falta = UMBRAL - vCampera.price;
  expect(falta, 'la campera dejó de costar menos que el umbral').toBeGreaterThan(0);
  await expect(page.getByText(`Te faltan ${gs(falta)} para el envío gratis.`)).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Hacia el envío gratis' })).toBeVisible();
  // Las recomendaciones de abajo con el 3x2 activo: decían «Gs. 0» (ADR-164).
  await expect(page.getByText('Gs. 0', { exact: true })).toHaveCount(0);
});

test('con tres, el 3x2 descuenta una y el total lo dice', async ({ page }) => {
  await conCarrito(page, vZapatilla, zapatilla.title, 3);

  const linea = page.getByText(`${MARCA} 3x2`);
  await expect(linea).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(`−${gs(vZapatilla.price)}`)).toBeVisible();
  await expect(page.getByText(gs(vZapatilla.price * 2), { exact: true })).toBeVisible();

  // El checkout dice lo mismo: es el mismo cálculo.
  await page.goto('/checkout');
  await expect(page.getByText(`${MARCA} 3x2`)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(`1 × ${mochila.title}`)).toBeVisible();
});
