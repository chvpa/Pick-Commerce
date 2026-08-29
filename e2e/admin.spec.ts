import { expect, test, type Page } from '@playwright/test';
import { ADMIN_E2E, TIENDA_E2E } from '../scripts/datos-admin-e2e.ts';

/**
 * Smoke del Admin: entrar, moverse por el sidebar y salir.
 *
 * Existe por un fallo concreto. El menú de usuario y el selector de tiendas
 * lanzaban una excepción de Base UI **al abrirse** —un `Menu.GroupLabel` fuera
 * de su `Menu.Group`— y se llevaban la pantalla puesta. No lo detectaba nada:
 * el typecheck pasa, el lint pasa, y el control se ve perfecto hasta que se le
 * hace clic. Es la clase de fallo que sólo encuentra un navegador.
 *
 * Por eso los tests afirman que el menú **abre**, no que el botón existe:
 * contar botones habría dado verde con la aplicación rota.
 *
 * El Admin corre en 4322, aparte del storefront: es otra aplicación y otro
 * build. La URL va explícita porque el `baseURL` de la configuración apunta al
 * storefront.
 */

const ADMIN = 'http://127.0.0.1:4322';

/** Falla si algo explotó en el navegador, aunque la aserción de turno pase. */
function vigilar(page: Page): string[] {
  const problemas: string[] = [];
  page.on('pageerror', (error) => problemas.push(`excepción: ${error.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') problemas.push(`console.error: ${msg.text()}`);
  });
  return problemas;
}

async function entrar(page: Page): Promise<void> {
  await page.goto(ADMIN);
  await page.locator('#email').fill(ADMIN_E2E.email);
  await page.locator('#password').fill(ADMIN_E2E.password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  /*
   * Se espera el botón del sidebar y no el sidebar mismo: en mobile el panel
   * vive dentro de un sheet que arranca cerrado y todavía no existe en el DOM.
   * El botón de la cabecera está en los dos tamaños. Se localiza por su
   * `data-slot` y no por su nombre accesible: el riel lateral se llama igual
   * —«Toggle Sidebar»— y por nombre la búsqueda encuentra dos.
   */
  await expect(page.locator('[data-slot="sidebar-trigger"]')).toBeVisible({ timeout: 30_000 });
}

/**
 * Deja el sidebar abierto, venga de donde venga.
 *
 * En desktop ya está desplegado y tocar el botón lo **colapsaría**, así que
 * primero se mira si el panel se ve. En mobile hay que abrir el sheet, y además
 * navegar lo vuelve a cerrar: por eso se llama antes de cada interacción y no
 * una sola vez.
 */
async function abrirSidebar(page: Page): Promise<void> {
  const pie = page.locator('[data-slot="sidebar-footer"]');
  const sheet = page.locator('[role="dialog"]');

  // Desktop: el sidebar es permanente y no hay sheet de por medio.
  if ((await sheet.count()) === 0 && (await pie.isVisible().catch(() => false))) return;

  /*
   * Mobile: esperar a que el sheet termine de cerrarse antes de volver a
   * abrirlo. Mientras se va sigue estando "visible", así que decidir por eso
   * llevaba a tocar el botón a mitad de la animación: el panel se cerraba, el
   * clic lo volvía a abrir, y el enlace quedaba en movimiento o directamente
   * desprendido del DOM. Un `waitForTimeout` lo tapaba; esto lo resuelve.
   */
  await expect(sheet).toHaveCount(0);
  await page.locator('[data-slot="sidebar-trigger"]').click();
  await expect(pie).toBeVisible();
}

test.describe('Admin', () => {
  test('el menú de usuario abre y deja cerrar sesión', async ({ page }) => {
    const problemas = vigilar(page);
    await entrar(page);
    await abrirSidebar(page);

    await page.locator('[data-slot="sidebar-footer"] button').first().click();

    // Que el menú **abra** es la aserción: antes reventaba justo acá.
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByText(ADMIN_E2E.email)).toBeVisible();

    await menu.getByRole('menuitem', { name: 'Salir' }).click();

    // Cerrar sesión devuelve al login.
    await expect(page.locator('#email')).toBeVisible({ timeout: 15_000 });
    expect(problemas, problemas.join('\n')).toEqual([]);
  });

  test('el selector de tiendas abre y cambia de tienda', async ({ page }) => {
    const problemas = vigilar(page);
    await entrar(page);
    await abrirSidebar(page);

    await page.locator('[data-slot="sidebar-header"] button').first().click();

    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();

    // Las dos tiendas de la organización: la del seed y la que crea el setup.
    // Sin la segunda, el componente dibuja una variante inerte y este test no
    // probaría nada.
    await expect(menu.getByRole('menuitem')).toHaveCount(2);

    await menu.getByRole('menuitem', { name: TIENDA_E2E.name }).click();

    // La cabecera del sidebar pasa a nombrar la tienda elegida.
    await expect(page.locator('[data-slot="sidebar-header"]')).toContainText(TIENDA_E2E.name);
    expect(problemas, problemas.join('\n')).toEqual([]);
  });

  test('la navegación del sidebar llega a las secciones', async ({ page }) => {
    const problemas = vigilar(page);
    await entrar(page);
    await abrirSidebar(page);

    for (const seccion of ['Productos', 'Pedidos', 'Promociones', 'Contenido', 'Clientes']) {
      await page.getByRole('link', { name: seccion }).click();
      await expect(page.getByRole('heading', { name: seccion, level: 1 })).toBeVisible({
        timeout: 15_000,
      });
      await abrirSidebar(page);
    }

    expect(problemas, problemas.join('\n')).toEqual([]);
  });

  test('crear una campaña de descuento no exige escribir código', async ({ page }) => {
    /*
     * Es el Definition of Done de la Fase 9 en un test. Y como el de los menús,
     * afirma sobre lo que **pasa** y no sobre lo que se ve: que el preview diga
     * a cuántos productos alcanza sólo puede salir de una consulta que llegó a
     * la base con el alcance elegido.
     */
    const problemas = vigilar(page);
    await entrar(page);
    await abrirSidebar(page);

    await page.getByRole('link', { name: 'Promociones' }).click();
    await page.getByRole('link', { name: 'Nueva promoción' }).click();

    const titulo = `Rebaja del smoke ${Date.now()}`;
    await page.locator('#title').fill(titulo);
    await page.locator('#discountValue').fill('20');

    // El preview responde con el alcance real del catálogo de la tienda.
    await expect(page.getByText(/Alcanza \d+ productos?\./)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Crear promoción' }).click();

    // Vuelve a la lista, y la promoción está con su descuento y su estado.
    const fila = page.getByRole('row', { name: new RegExp(titulo) });
    await expect(fila).toBeVisible({ timeout: 15_000 });
    await expect(fila).toContainText('20 %');
    await expect(fila).toContainText('Borrador');
    // Sin cupón ni mínimos, se ve en la vidriera además del carrito.
    await expect(fila).toContainText('Catálogo y carrito');

    expect(problemas, problemas.join('\n')).toEqual([]);
  });

  test('una sección de la home se arma sin escribir código', async ({ page }) => {
    /*
     * La otra mitad del Definition of Done. Se crea una colección **dinámica**
     * a propósito: es la que no tiene lista de productos y se resuelve como
     * consulta guardada, así que si `rules` no llegara a la base la colección
     * quedaría manual y vacía sin que nada avisara.
     */
    const problemas = vigilar(page);
    await entrar(page);
    await abrirSidebar(page);

    await page.getByRole('link', { name: 'Contenido' }).click();
    await page.getByRole('tab', { name: 'Colecciones' }).click();
    await page.getByRole('link', { name: 'Nueva colección' }).click();

    const titulo = `Novedades del smoke ${Date.now()}`;
    await page.locator('#title').fill(titulo);
    await page
      .getByLabel('Cómo se arma la colección')
      .selectOption('dinamica');
    await page.locator('#sort').selectOption('newest');

    // Publicada y en la home: los dos interruptores del final.
    await page.getByRole('switch', { name: /Publicada/ }).click();
    await page.getByRole('switch', { name: /sección de la home/ }).click();
    await expect(page.locator('#homePosition')).toBeVisible();

    await page.getByRole('button', { name: 'Crear colección' }).click();

    const fila = page.getByRole('listitem').filter({ hasText: titulo });
    await expect(fila).toBeVisible({ timeout: 15_000 });
    await expect(fila).toContainText('dinámica, por newest');
    await expect(fila).toContainText('Publicada');

    expect(problemas, problemas.join('\n')).toEqual([]);
  });
});
