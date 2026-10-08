import { expect, type Locator, type Page } from '@playwright/test';
import { ADMIN_E2E, TIENDA_E2E } from '../scripts/datos-admin-e2e.ts';

/**
 * Lo que comparten los smokes del Admin: entrar, abrir el sidebar y moverse.
 *
 * Vive aparte porque lo usan `admin.spec.ts` y `ia.spec.ts`, y duplicarlo salió
 * caro una vez: la copia de `ia.spec.ts` no sabía que en mobile el sidebar es un
 * sheet cerrado, le pidió el texto a un elemento que no existe y esperó hasta el
 * timeout. Todo lo que sabe de esa diferencia está acá, en un solo lugar.
 *
 * Es un módulo y no un spec: Playwright sólo recoge `*.spec.ts`, así que esto no
 * agrega tests.
 */

export const ADMIN = 'http://127.0.0.1:4322';

/** Falla si algo explotó en el navegador, aunque la aserción de turno pase. */
export function vigilar(page: Page): string[] {
  const problemas: string[] = [];
  page.on('pageerror', (error) => problemas.push(`excepción: ${error.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') problemas.push(`console.error: ${msg.text()}`);
  });
  return problemas;
}

export async function entrar(page: Page): Promise<void> {
  await page.goto(ADMIN);
  await page.locator('#email').fill(ADMIN_E2E.email);
  await page.locator('#password').fill(ADMIN_E2E.password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  /*
   * Se espera la barra de arriba y no el sidebar: en mobile el panel vive dentro
   * de una hoja que arranca cerrada y todavía no existe en el DOM, y en desktop
   * no hay botón de menú —el sidebar no se pliega (ADR-143)—. La barra está en
   * los dos tamaños.
   */
  await expect(page.locator('[data-slot="barra-superior"]')).toBeVisible({ timeout: 30_000 });
}

/**
 * Deja el sidebar abierto, venga de donde venga.
 *
 * En desktop está siempre a la vista y no hay botón de menú. En mobile hay que
 * abrir la hoja, y además navegar la vuelve a cerrar: por eso se llama antes de
 * cada interacción y no una sola vez. Lo que dice «está abierto» es la cabecera
 * con la tienda, que existe en los dos tamaños sólo si el panel se ve.
 */
export async function abrirSidebar(page: Page): Promise<void> {
  const pie = page.locator('[data-slot="sidebar-header"]');
  const sheet = page.locator('[role="dialog"]');
  /*
   * El sheet abierto **y quieto**.
   *
   * Base UI marca `data-ending-style` mientras el panel se va, así que sin ese
   * atributo está abierto de verdad. Se filtra en el selector y no con
   * `getAttribute`: preguntarle un atributo a un elemento que puede no existir
   * lo hace esperar, y en desktop —donde no hay sheet— esperaría hasta el
   * timeout del test.
   */
  const abierto = page.locator('[role="dialog"]:not([data-ending-style])');

  // Desktop: el sidebar es permanente y no hay sheet de por medio.
  if ((await sheet.count()) === 0) {
    if (await pie.isVisible().catch(() => false)) return;
  } else if ((await abierto.count()) === 1) {
    // Mobile con la hoja ya abierta: no hay nada que hacer, y tocar el botón la
    // cerraría.
    await expect(pie).toBeVisible();
    return;
  }

  /*
   * Mobile: esperar a que el sheet termine de cerrarse antes de volver a
   * abrirlo. Decidir por la visibilidad llevaba a tocar el botón a mitad de la
   * animación: el panel se cerraba, el clic lo volvía a abrir, y el enlace
   * quedaba en movimiento o directamente desprendido del DOM. Un
   * `waitForTimeout` lo tapaba; esto lo resuelve.
   */
  await expect(sheet).toHaveCount(0);
  await page.locator('[data-slot="sidebar-trigger"]').click();
  await expect(pie).toBeVisible();
}

/**
 * Entra a una de las pantallas de contenido: Secciones por el sidebar, y
 * Colecciones o Categorías por su pestaña, que es como se llega desde ADR-152.
 * Se acota al sidebar y a la barra de pestañas porque «Colecciones» también
 * nombra el «← volver» de sus formularios.
 */
export async function irAContenido(
  page: Page,
  sub: 'Secciones' | 'Colecciones' | 'Categorías',
): Promise<void> {
  await abrirSidebar(page);
  await page
    .locator('[data-sidebar="sidebar"]')
    .getByRole('link', { name: 'Secciones', exact: true })
    .click();
  if (sub === 'Secciones') return;
  // Colecciones y Categorías son pestañas de Secciones (ADR-152).
  await page
    .getByRole('navigation', { name: 'Contenido de la tienda' })
    .getByRole('link', { name: new RegExp(`^${sub}`) })
    .click();
}

/**
 * Cambia a la tienda del smoke, la que el setup crea y el teardown borra.
 *
 * Se usa donde el test necesita una tienda **sin estado previo**: la de
 * demostración es real y alguien puede haberle cargado cosas.
 */
export async function irALaTiendaDelSmoke(page: Page): Promise<void> {
  await abrirSidebar(page);

  const cabecera = page.locator('[data-slot="sidebar-header"]');
  if ((await cabecera.textContent())?.includes(TIENDA_E2E.name)) return;

  await cabecera.locator('button').first().click();
  await page.getByRole('menu').getByRole('menuitem', { name: TIENDA_E2E.name }).click();
  await expect(cabecera).toContainText(TIENDA_E2E.name);
}

/**
 * Elige una opción de un desplegable.
 *
 * Desde que los `<select>` nativos son el Select de Base UI, `selectOption` no
 * sirve: no hay `<option>` que elegir sino un menú que hay que abrir. Se abre
 * por el disparador y se elige por el texto, que es lo que hace una persona.
 *
 * Tanto el disparador como la opción se buscan por `data-slot`: dentro de un
 * `<form>`, Base UI dibuja además un `<select>` nativo oculto para que el
 * control se envíe con el formulario, y ese select responde al mismo rol y al
 * mismo `aria-label` que el botón. Buscar por etiqueta encuentra el que nunca se
 * ve, el clic no abre nada y el test espera hasta el timeout.
 */
export function desplegable(page: Page, selector: string): Locator {
  return page.locator(`[data-slot="select-trigger"]${selector}`);
}
export async function elegir(page: Page, disparador: Locator, opcion: string): Promise<void> {
  await disparador.click();
  await page
    .locator('[data-slot="select-content"]')
    .getByRole('option', { name: opcion, exact: true })
    .click();
}
