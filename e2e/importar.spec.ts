import { expect, test } from '@playwright/test';
import { ADMIN_E2E } from '../scripts/datos-admin-e2e.ts';
import { ADMIN, entrar, irALaTiendaDelSmoke } from './_admin.ts';

/**
 * Importar el catálogo desde un CSV, en tres pasos (ADR-154).
 *
 * Corre en la tienda del smoke, que el teardown borra entera, y sólo en desktop:
 * crea un producto, y una segunda corrida lo encontraría creado y probaría otra
 * cosa.
 */

const N = Date.now();

const CSV = [
  'handle,titulo,sku,variante,precio,stock',
  `importada-${N},Remera importada ${N},IMP-${N}-M,M,150000,3`,
  `importada-${N},Remera importada ${N},IMP-${N}-L,L,150000,2`,
  `con-errata-${N},Buzo con errata,ERR-${N}-M,M,150000,1`,
  `con-errata-${N},Buzo con errata,ERR-${N}-L,L,15O000,1`,
].join('\n');

test('el archivo se revisa fila por fila, y una errata deja afuera a su producto entero', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'crea un producto; se corre una vez');

  await entrar(page);
  await irALaTiendaDelSmoke(page);
  await page.goto(`${ADMIN}/productos/importar`);
  await expect(page.getByRole('heading', { name: 'Importar productos', level: 1 })).toBeVisible();

  await page.getByLabel('Archivo CSV').setInputFiles({
    name: 'catalogo.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(CSV),
  });

  // La revisión, con nada escrito todavía.
  await expect(page.getByText('2 listas')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('2 con errores')).toBeVisible();
  const fila = (sku: string) => page.getByRole('row').filter({ hasText: sku });
  await expect(fila(`IMP-${N}-M`)).toContainText('Nuevo');
  await expect(fila(`ERR-${N}-L`)).toContainText('precio tiene que ser un número');
  /*
   * La fila buena del producto con la errata tampoco entra: para uno que ya
   * existiera, importarla sola borraría la variante de la fila mala.
   */
  await expect(fila(`ERR-${N}-M`)).toContainText('la línea 5 de este producto tiene errores');

  await page.getByRole('button', { name: 'Importar 2 filas' }).click();
  await expect(page.getByText('Catálogo actualizado')).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText('1 producto nuevo y 0 actualizados. 2 filas quedaron afuera por errores.'),
  ).toBeVisible();

  // El artefacto: el producto está en el catálogo, con sus dos variantes.
  await page.getByRole('link', { name: 'Ir a productos' }).click();
  await page.getByPlaceholder('Título, marca o SKU').fill(`Remera importada ${N}`);
  const enLaLista = page.getByRole('row').filter({ hasText: `Remera importada ${N}` });
  await expect(enLaLista).toBeVisible({ timeout: 15_000 });
  await enLaLista.getByRole('link').first().click();
  await expect(page.getByRole('heading', { name: `Remera importada ${N}` })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('button', { name: /^Editar la variante/ })).toHaveCount(2);

  // Quien importó queda como autor, y la historia lo cuenta (ADR-159).
  await expect(page.getByText(/^Creado por/)).toContainText(ADMIN_E2E.email);
  await page.getByRole('button', { name: /^Ver cambios/ }).click();
  await expect(page.getByRole('dialog', { name: 'Historial de cambios' })).toContainText(
    'creó el producto',
  );
});
