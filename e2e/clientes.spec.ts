import { expect, test } from '@playwright/test';
import { ADMIN, entrar, vigilar } from './_admin.ts';

/**
 * Clientes por segmento, y su ficha (ADR-150).
 *
 * Las cuentas de la cabecera y la regla de cada segmento las prueban
 * `recurrencia.test.ts` y el core. Esto prueba lo que esos tests no ven: que la
 * pantalla llega a las funciones con la sesión del Admin, que el segmento queda
 * en la URL y que la ficha abre con sus pedidos.
 *
 * Corre sobre la tienda de la demo, que tiene pedidos sembrados y los que deja el
 * checkout de la misma corrida: no cuenta cuántos clientes hay.
 */

test('la cabecera cuenta, los segmentos filtran y la ficha abre con sus pedidos', async ({
  page,
}) => {
  const problemas = vigilar(page);
  await entrar(page);
  await page.goto(`${ADMIN}/clientes`);

  await expect(page.getByText('Clientes que compraron')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Volvieron a comprar').first()).toBeVisible();
  await expect(page.getByText('Gasto promedio por cliente')).toBeVisible();

  // Un segmento en la URL, con su regla dicha en vez de filtros.
  const pestanas = page.getByRole('navigation', { name: 'Clientes por segmento' });
  await pestanas.getByRole('link', { name: /^Los mejores/ }).click();
  await expect(page).toHaveURL(/tab=champions/);
  await expect(page.getByText('Cuatro compras o más')).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Buscar clientes' })).toHaveCount(0);

  // De vuelta a todos, la ficha de cualquiera: su nombre arriba y sus pedidos.
  await pestanas.getByRole('link', { name: /^Todos/ }).click();
  const primero = page.getByRole('list', { name: 'Clientes' }).getByRole('link').first();
  const nombre = (await primero.innerText()).trim();
  await primero.click();
  await expect(page.getByRole('heading', { name: nombre, level: 1 })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('heading', { name: 'Pedidos' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Contacto' })).toBeVisible();

  expect(problemas).toEqual([]);
});
