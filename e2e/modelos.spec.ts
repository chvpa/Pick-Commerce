import { expect, test } from '@playwright/test';
import { PRODUCTO_SIN_FOTO_E2E, PROPUESTA_E2E } from '../scripts/datos-admin-e2e.ts';
import { ADMIN, entrar, irALaTiendaDelSmoke } from './_admin.ts';

/**
 * Productos › Modelos (ADR-162), con los dos productos que siembra la tienda del
 * smoke: armar el modelo, cambiar cuál va al catálogo, verlo desde la ficha y
 * borrarlo sin borrar los productos.
 */
test('un modelo se arma, se reordena, se ve en la ficha y se borra', async ({ page }) => {
  const nombre = `Modelo del smoke ${Date.now()}`;
  await entrar(page);
  await irALaTiendaDelSmoke(page);
  await page.goto(`${ADMIN}/productos/modelos`);

  await page.getByRole('button', { name: 'Nuevo modelo' }).click();
  await page.getByLabel('Nombre').fill(nombre);
  await page.getByRole('button', { name: 'Crear modelo' }).click();
  await expect(page.getByRole('list', { name: 'Modelos' })).toContainText(nombre, {
    timeout: 15_000,
  });

  const buscar = page.getByRole('searchbox', { name: 'Buscar un producto para agregar al modelo' });
  for (const titulo of [PRODUCTO_SIN_FOTO_E2E.title, PROPUESTA_E2E.title]) {
    await buscar.fill(titulo);
    // La búsqueda por el título exacto deja un solo candidato.
    await page.getByRole('button', { name: 'Agregar', exact: true }).first().click();
    await expect(page.getByRole('list', { name: 'Productos del modelo' })).toContainText(titulo, {
      timeout: 15_000,
    });
  }

  const productos = page.getByRole('list', { name: 'Productos del modelo' }).getByRole('listitem');
  await expect(productos.first()).toContainText(PRODUCTO_SIN_FOTO_E2E.title);
  await expect(productos.first()).toContainText('En catálogo');

  // El segundo pasa a ser el del catálogo.
  await page.getByRole('button', { name: `Mostrar ${PROPUESTA_E2E.title} en el catálogo` }).click();
  await expect(productos.first()).toContainText(PROPUESTA_E2E.title, { timeout: 15_000 });
  await expect(productos.first()).toContainText('En catálogo');

  // La ficha lo dice y lleva al modelo.
  await page.goto(`${ADMIN}/productos/${PROPUESTA_E2E.productoId}`);
  await page.getByRole('link', { name: nombre }).click();
  await expect(page.getByRole('list', { name: 'Productos del modelo' })).toBeVisible({
    timeout: 15_000,
  });

  // Borrar el modelo no borra sus productos.
  await page.getByRole('button', { name: 'Borrar modelo' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: /^Borrar/ })
    .click();
  await expect(page.getByRole('list', { name: 'Modelos' }).getByText(nombre)).toHaveCount(0, {
    timeout: 15_000,
  });
  await page.goto(`${ADMIN}/productos/${PROPUESTA_E2E.productoId}`);
  await expect(page.getByText('No es parte de un modelo.')).toBeVisible({ timeout: 15_000 });
});
