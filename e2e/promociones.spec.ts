import { expect, test } from '@playwright/test';
import { ADMIN, entrar, vigilar } from './_admin.ts';

/**
 * El formulario de promociones de ocho tipos (ADR-164).
 *
 * El dinero lo prueba la paridad de `promociones.test.ts`. Esto prueba lo que
 * sólo se ve en un navegador: que elegir un tipo cambie los campos, que la
 * vista previa responda con lo que la promoción hace, que las validaciones del
 * handoff frenen el guardado y que con código no se pueda elegir un 3x2.
 */

test('un 3x2 se arma con el atajo, se ve en el carrito de ejemplo y se guarda', async ({
  page,
}) => {
  const problemas = vigilar(page);
  await entrar(page);
  await page.goto(`${ADMIN}/promociones/nueva`);

  const titulo = `3x2 del smoke ${Date.now()}`;
  await page.locator('#title').fill(titulo);
  await page.getByRole('radio', { name: /Llevá X, pagá Y/ }).click();

  // Primero mal: pagar lo mismo que lleva no es una promoción.
  await page.locator('#lleva').fill('2');
  await page.locator('#paga').fill('2');
  await page.getByRole('button', { name: 'Crear promoción' }).click();
  await expect(page.getByText('Tiene que pagar menos unidades de las que lleva')).toBeVisible();

  await page.getByRole('button', { name: '3x2', exact: true }).click();
  const carrito = page.getByRole('group', { name: 'Así se ve en el carrito' });
  await expect(carrito).toContainText('3 ×', { timeout: 15_000 });
  await expect(carrito).toContainText('−');
  await expect(page.getByRole('complementary', { name: 'Vista previa' })).toContainText(
    'Llevá 3, pagá 2',
  );

  await page.getByRole('button', { name: 'Crear promoción' }).click();
  const fila = page.getByRole('row', { name: new RegExp(titulo) });
  await expect(fila).toBeVisible({ timeout: 15_000 });
  await expect(fila).toContainText('3x2');

  // Se vuelve a abrir con lo que se guardó, y se borra para no dejar rastro.
  await fila
    .getByRole('link', { name: new RegExp(titulo) })
    .first()
    .click();
  await expect(page.getByRole('radio', { name: /Llevá X, pagá Y/ })).toHaveAttribute(
    'aria-checked',
    'true',
    { timeout: 15_000 },
  );
  await expect(page.locator('#lleva')).toHaveValue('3');
  await page.goto(`${ADMIN}/promociones`);
  await fila.getByRole('button', { name: `Borrar ${titulo}` }).click();
  await page.getByRole('button', { name: 'Borrar', exact: true }).click();
  await expect(fila).toHaveCount(0, { timeout: 15_000 });

  expect(problemas, problemas.join('\n')).toEqual([]);
});

test('con código sólo se puede elegir un descuento o un envío gratis', async ({ page }) => {
  await entrar(page);
  await page.goto(`${ADMIN}/promociones/nueva`);

  await page.getByRole('radio', { name: /Bundle/ }).click();
  await page.getByRole('button', { name: 'Con código' }).click();

  // El bundle no puede ser cupón: vuelve al descuento y queda deshabilitado.
  await expect(page.getByRole('radio', { name: /Descuento/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByRole('radio', { name: /Bundle/ })).toBeDisabled();
  await expect(page.getByRole('radio', { name: /Envío gratis/ })).toBeEnabled();
  await expect(page.locator('#code')).toBeVisible();
});
