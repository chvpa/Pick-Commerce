import { expect, test, type Page } from '@playwright/test';
import { ADMIN, entrar } from './_admin.ts';

/**
 * «Mi cuenta» (ADR-155): el nombre, y dónde está abierta la cuenta.
 *
 * Las sesiones se prueban con dos navegadores de verdad, porque lo que importa
 * pasa entre ellos: que uno vea al otro, que lo cierre, y que salir de uno no
 * saque al otro —`signOut()` sin argumentos cerraba todos—.
 *
 * El usuario del smoke es compartido y cada spec que entra le abre una sesión,
 * así que el test empieza cerrando las demás: contar desde un número conocido
 * es lo único que no depende del orden de los specs.
 */

const filas = (page: Page) =>
  page.getByRole('list', { name: 'Sesiones abiertas' }).getByRole('listitem');

async function irAMiCuenta(page: Page) {
  await page.goto(`${ADMIN}/configuracion/cuenta`);
  await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible({ timeout: 30_000 });
  await expect(filas(page).first()).toBeVisible({ timeout: 15_000 });
}

test('el nombre se guarda y aparece en el menú de la cuenta', async ({ page }) => {
  const nombre = `Ana de Prueba ${Date.now()}`;
  await entrar(page);
  await irAMiCuenta(page);

  await page.getByLabel('Nombre').fill(nombre);
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Guardado')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Tu cuenta' }).click();
  await expect(page.getByRole('menu').getByText(nombre)).toBeVisible();
});

test('una sesión ve a la otra, la cierra, y salir de una no saca a la otra', async ({
  page,
  browser,
}) => {
  await entrar(page);
  await irAMiCuenta(page);

  // Desde un número conocido: sólo la de este navegador.
  const otras = page.getByRole('button', { name: /^Cerrar las otras/ });
  const una = page.getByRole('button', { name: 'Cerrar sesión' });
  // Una cosa o la otra: después de «Cerrar las otras» la lista tarda en releerse.
  if (await otras.isVisible()) await otras.click();
  else if ((await una.count()) === 1) await una.click();
  await expect(filas(page)).toHaveCount(1, { timeout: 15_000 });
  await expect(filas(page).first()).toContainText('Esta sesión');

  // Un segundo navegador entra, y el primero lo ve.
  const otro = await browser.newContext();
  const otraPagina = await otro.newPage();
  await entrar(otraPagina);
  await page.reload();
  await expect(filas(page)).toHaveCount(2, { timeout: 15_000 });

  // Y lo cierra desde acá.
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(filas(page)).toHaveCount(1, { timeout: 15_000 });

  /*
   * Salir del segundo no saca al primero. Con `scope: 'global'` —lo que hacía
   * `signOut()` sin argumentos— la sesión de acá también desaparecía de la
   * base, y esta lista quedaba vacía.
   */
  await entrar(otraPagina);
  await page.reload();
  await expect(filas(page)).toHaveCount(2, { timeout: 15_000 });
  await otraPagina.getByRole('button', { name: 'Tu cuenta' }).click();
  await otraPagina.getByRole('menuitem', { name: 'Salir' }).click();
  await expect(otraPagina.locator('#email')).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(filas(page)).toHaveCount(1, { timeout: 15_000 });
  await expect(filas(page).first()).toContainText('Esta sesión');
  await otro.close();
});
