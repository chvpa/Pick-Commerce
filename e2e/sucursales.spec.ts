import { expect, test, type Page } from '@playwright/test';
import { ADMIN, desplegable, elegir, entrar, irALaTiendaDelSmoke } from './_admin.ts';

/**
 * El stock entra en la sucursal que se elige (v2 Fase 8).
 *
 * Es el smoke de tres hallazgos del backlog que eran el mismo, y ninguno se podía
 * reproducir con una sola sucursal: el Admin escribía en la primera, leía la suma
 * de todas y la reescribía en una —30 → 50 → 70 en tres guardados sin tocar el
 * campo— y un negativo en un depósito se compensaba con el positivo de otro.
 *
 * Por eso el test **crea la segunda sucursal**: sin ella no hay bug que mostrar.
 * Corre sobre la tienda del smoke, que el teardown borra con todo lo que cuelga.
 */

/*
 * Sólo en escritorio: crea una sucursal con nombre fijo, y dos proyectos corriendo
 * a la vez crearían dos con el mismo nombre. Además es una pantalla de
 * configuración, que se toca sentado.
 */
const SOLO_ESCRITORIO = 'crea una sucursal con nombre fijo, una sola vez';

const NORTE = 'Depósito norte';

/**
 * El campo de stock de la primera variante, por `name` y no por etiqueta.
 *
 * `getByLabel('Stock')` encuentra tres cosas en esta pantalla: este campo y —por
 * coincidencia de texto— el desplegable «Sucursal del stock», que dentro de un
 * formulario son dos controles, el botón y el `<select>` oculto de Base UI. El
 * `name` lo pone react-hook-form y es único.
 */
function stock(page: Page) {
  return page.locator('input[name="variantes.0.stock"]');
}

/**
 * La fila de una sucursal, por el campo que lleva su nombre.
 *
 * No por `hasText`: el nombre se edita en el lugar, así que vive en el `value` de
 * un `<input>` y no en el texto de la fila. El primer intento buscaba texto y no
 * encontraba una sucursal que estaba en pantalla.
 */
function fila(page: Page, nombre: string) {
  return page
    .getByRole('list', { name: 'Sucursales' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('textbox', { name: `Nombre de ${nombre}` }) });
}

test.describe('Sucursales', () => {
  test('el stock va a la sucursal elegida y las otras quedan como estaban', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', SOLO_ESCRITORIO);
    await entrar(page);
    await irALaTiendaDelSmoke(page);

    // 1 · La segunda sucursal, que es lo que destapa el problema.
    await page.goto(`${ADMIN}/configuracion`);
    const sucursales = page.getByRole('list', { name: 'Sucursales' });
    await expect(sucursales).toBeVisible({ timeout: 30_000 });

    const norte = fila(page, NORTE);
    if ((await norte.count()) === 0) {
      await page.getByLabel('Nueva sucursal').fill(NORTE);
      await page.getByRole('button', { name: 'Agregar' }).click();
      await expect(norte).toBeVisible({ timeout: 15_000 });
    }

    // 2 · Un producto con stock en la sucursal que el formulario ofrece primero.
    const handle = `stock-por-sucursal-${Date.now()}`;
    const titulo = 'Producto con dos depósitos';
    await page.goto(`${ADMIN}/productos/nuevo`);
    await expect(page.getByLabel('Título')).toBeVisible({ timeout: 30_000 });
    await page.getByLabel('Título').fill(titulo);
    await page.getByLabel('URL').fill(handle);
    await page.locator('input[name="variantes.0.title"]').fill('Única');
    await page.locator('input[name="variantes.0.sku"]').fill(handle.toUpperCase());
    await page.locator('input[name="variantes.0.precio"]').fill('50000');

    // El selector aparece **porque** hay dos sucursales: con una sola no existe.
    await expect(desplegable(page, '[aria-label="Sucursal del stock"]')).toBeVisible();
    await stock(page).fill('7');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page).toHaveURL(/\/productos$/, { timeout: 30_000 });

    // 3 · Se abre de vuelta: el número que se ve es el de una sucursal, no la suma.
    await page.getByRole('link', { name: titulo }).click();
    await expect(stock(page)).toHaveValue('7', { timeout: 30_000 });

    // El depósito nuevo no tiene nada, aunque el producto tenga 7 en el otro.
    await elegir(page, desplegable(page, '[aria-label="Sucursal del stock"]'), NORTE);
    await expect(stock(page)).toHaveValue('0');

    await stock(page).fill('3');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page).toHaveURL(/\/productos$/, { timeout: 30_000 });

    /*
     * 4 · El corazón del test: cargar el segundo depósito **no** tocó el primero.
     * Antes el formulario leía la suma, la guardaba en una sola sucursal y el
     * total quedaba mal en cada guardado.
     */
    await page.getByRole('link', { name: titulo }).click();
    await expect(stock(page)).toHaveValue('7', { timeout: 30_000 });
    await elegir(page, desplegable(page, '[aria-label="Sucursal del stock"]'), NORTE);
    await expect(stock(page)).toHaveValue('3');

    // 5 · Y la configuración lo cuenta por sucursal, que es donde vive el stock.
    await page.goto(`${ADMIN}/configuracion`);
    await expect(fila(page, NORTE)).toContainText('3 unidades', { timeout: 30_000 });
  });
});
