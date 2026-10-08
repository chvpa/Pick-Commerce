import { expect, test } from '@playwright/test';
import { ADMIN, entrar, vigilar } from './_admin.ts';

/**
 * Productos por pestaña (ADR-148).
 *
 * Qué cae en cada pestaña lo prueba `supabase/tests/productos-por-pestana.test.ts`.
 * Esto prueba lo que ese test no ve: que la pestaña está en la URL, que los
 * filtros llegan al servidor con la sesión del Admin, y que las dos pestañas que
 * reemplazaron a sus pantallas llevan a ellas.
 *
 * Corre sobre la tienda de la demo, que tiene productos agotados. No cuenta
 * cuántos: el checkout de la misma corrida compra y cambia el stock.
 */

test('las pestañas y los filtros van al servidor, y las bandas llevan a su pantalla', async ({
  page,
}) => {
  const problemas = vigilar(page);
  await entrar(page);
  await page.goto(`${ADMIN}/productos`);

  const pestanas = page.getByRole('navigation', { name: 'Productos por estado' });
  await expect(pestanas.getByRole('link', { name: /^Todos \d+$/ })).toBeVisible({
    timeout: 15_000,
  });

  // El filtro de stock: todo lo que queda a la vista dice que no hay.
  await page.getByRole('button', { name: 'Stock' }).click();
  await page.getByRole('menuitem', { name: 'Sin stock' }).click();
  const filas = page.getByRole('row').filter({ has: page.getByRole('link') });
  // Una aserción que reintenta y no un recorrido: las filas de antes del filtro
  // siguen a la vista hasta que llega la respuesta.
  await expect(filas.filter({ hasNotText: 'Sin stock' })).toHaveCount(0);
  await expect(filas.first()).toBeVisible();
  await page.getByRole('button', { name: 'Sacar el filtro de stock' }).click();

  // «Stock quieto» está en la URL y lleva a la antigüedad por tramo.
  await pestanas.getByRole('link', { name: /^Stock quieto/ }).click();
  await expect(page).toHaveURL(/tab=quieto/);
  await page.getByRole('link', { name: 'Ver por antigüedad' }).click();
  await expect(page.getByRole('heading', { name: 'Stock quieto' })).toBeVisible();

  // «Sin foto» entra por la URL, y su banda lleva a sacar las fotos.
  await page.goto(`${ADMIN}/productos?tab=sinfoto`);
  await expect(pestanas.getByRole('link', { name: /^Sin foto/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('link', { name: 'Fotografiar' })).toHaveAttribute(
    'href',
    '/productos/sin-foto',
  );

  expect(problemas).toEqual([]);
});
