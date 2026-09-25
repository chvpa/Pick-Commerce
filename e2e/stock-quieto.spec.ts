import { expect, test } from '@playwright/test';
import { ADMIN, entrar, vigilar } from './_admin.ts';

/**
 * Stock quieto: la antigüedad del stock (v2 Fase 8, ADR-135).
 *
 * Las cuentas las prueba `supabase/tests/antiguedad-del-stock.test.ts`. Esto
 * prueba que la pantalla llega a la función con la sesión del Admin, dibuja los
 * cuatro tramos y que elegir uno filtra la lista del lado del servidor.
 *
 * Corre sobre la tienda de la demo, que tiene stock sembrado.
 */

test('los cuatro tramos se ven, y uno filtra la lista', async ({ page }) => {
  const problemas = vigilar(page);
  await entrar(page);
  await page.goto(`${ADMIN}/productos/stock-quieto`);

  await expect(page.getByRole('heading', { name: 'Stock quieto' })).toBeVisible({
    timeout: 15_000,
  });

  const tramos = page.locator('button[aria-pressed]');
  await expect(tramos).toHaveCount(4, { timeout: 15_000 });

  // Uno que tenga unidades.
  const conStock = tramos.filter({ hasNotText: /^Sin vender.*\s0 unidades/s });
  const elegido = conStock.first();
  const nombre = (await elegido.locator('span').first().innerText()).trim();
  await elegido.click();

  await expect(elegido).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: nombre, level: 2 })).toBeVisible();
  await expect(
    page
      .getByRole('row')
      .filter({ has: page.getByRole('link') })
      .first(),
  ).toBeVisible();

  await elegido.click();
  await expect(
    page.getByRole('heading', { name: 'Todo el stock, lo más viejo primero', level: 2 }),
  ).toBeVisible();

  expect(problemas).toEqual([]);
});
