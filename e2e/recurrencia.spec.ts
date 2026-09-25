import { expect, test } from '@playwright/test';
import { ADMIN, entrar, vigilar } from './_admin.ts';

/**
 * Recurrencia: cohortes y RFM (v2 Fase 8, ADR-134).
 *
 * Las cuentas las prueba `supabase/tests/recurrencia.test.ts` con fechas
 * puestas a mano. Esto prueba lo que ese test no ve: que la pantalla llega a la
 * función con la sesión del Admin —RLS incluido—, que dibuja lo que vuelve y que
 * elegir un segmento filtra la lista del lado del servidor.
 *
 * Corre sobre la tienda de la demo, que tiene pedidos sembrados.
 */

test('las cohortes y los segmentos se ven, y un segmento filtra la lista', async ({ page }) => {
  const problemas = vigilar(page);
  await entrar(page);
  await page.goto(`${ADMIN}/clientes/recurrencia`);

  await expect(page.getByRole('heading', { name: 'Recurrencia' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('columnheader', { name: 'Primera compra' })).toBeVisible({
    timeout: 15_000,
  });

  // Los siete segmentos, como botones que filtran.
  const segmentos = page.locator('button[aria-pressed]');
  await expect(segmentos).toHaveCount(7);

  // Uno con clientes: el número grande de la tarjeta no es cero.
  const conClientes = segmentos.filter({ hasNot: page.locator('span', { hasText: /^0$/ }) });
  const elegido = conClientes.first();
  const nombre = (await elegido.locator('span').first().innerText()).trim();
  await elegido.click();

  await expect(elegido).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: nombre, level: 2 })).toBeVisible();
  // Filtrada, la columna de segmento sobra: todas las filas son del mismo.
  await expect(page.getByRole('columnheader', { name: 'Segmento' })).toHaveCount(0);
  await expect(
    page
      .getByRole('row')
      .filter({ has: page.getByRole('link') })
      .first(),
  ).toBeVisible();

  // Tocarlo otra vez vuelve a todos.
  await elegido.click();
  await expect(page.getByRole('columnheader', { name: 'Segmento' })).toBeVisible();

  expect(problemas).toEqual([]);
});
