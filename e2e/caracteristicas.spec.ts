import { expect, test } from '@playwright/test';
import { ADMIN, entrar, irALaTiendaDelSmoke } from './_admin.ts';

/**
 * Productos › Características (ADR-161). La alta, las opciones pegadas de una
 * vez y el borrado, en la tienda del smoke —que el teardown borra—; y en la
 * ficha de la demo, que lo declarado se elige de una lista.
 */

test('una característica se crea con opciones pegadas, se edita y se borra', async ({ page }) => {
  const nombre = `Material ${Date.now()}`;
  await entrar(page);
  await irALaTiendaDelSmoke(page);
  await page.goto(`${ADMIN}/productos/caracteristicas`);
  await expect(page.getByRole('heading', { name: 'Características', level: 1 })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole('button', { name: 'Nueva característica' }).click();
  await page.getByLabel('Nombre').fill(nombre);
  const opciones = page.getByLabel('Agregar opciones');
  await opciones.fill('Algodón, Lino,algodón ,Seda');
  await opciones.press('Enter');
  // La repetida no entra dos veces, aunque cambie la mayúscula.
  await expect(page.getByRole('button', { name: /^Quitar / })).toHaveCount(3);
  await page.getByRole('button', { name: 'Crear característica' }).click();

  const fila = page.getByRole('list', { name: 'Características' }).getByRole('button', {
    name: new RegExp(nombre),
  });
  await expect(fila).toContainText('3 opciones', { timeout: 15_000 });

  // Editar: una opción menos y obligatoria.
  await page.getByRole('button', { name: 'Quitar Seda' }).click();
  await page.getByRole('switch', { name: 'Obligatoria al cargar un producto' }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(fila).toContainText('2 opciones', { timeout: 15_000 });

  // Borrar, con su confirmación.
  await page.getByRole('button', { name: 'Borrar característica' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: /^Borrar/ })
    .click();
  await expect(fila).toHaveCount(0, { timeout: 15_000 });
});

test('en la ficha, lo declarado para variantes se elige de una lista', async ({ page }) => {
  await entrar(page);
  await page.goto(`${ADMIN}/productos`);
  await page.getByRole('link', { name: 'Campera cortaviento' }).click();

  await page
    .getByRole('button', { name: /^Editar la variante/ })
    .first()
    .click();
  const dialogo = page.getByRole('dialog');
  // El color de la demo está declarado: es un desplegable con su valor, no texto.
  await expect(dialogo.getByRole('combobox', { name: 'Color' })).toContainText('Azul', {
    timeout: 15_000,
  });
  await page.keyboard.press('Escape');
});
