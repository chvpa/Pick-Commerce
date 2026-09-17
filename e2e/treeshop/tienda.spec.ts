import { expect, test, type Page } from '@playwright/test';
import { NOMBRE_E2E as NOMBRE_DE_LA_TIENDA } from '../../scripts/preparar-storefront-e2e.ts';

/**
 * El storefront del primer cliente real.
 *
 * Treeshop es el único storefront en producción y era el único sin suite:
 * `grep treeshop e2e/` daba cero. Lo que acá se prueba es **su código** —el
 * encabezado propio, el menú en teléfono, el preset, su `contenido.ts`— servido
 * contra los datos de la demo; el catálogo y las secciones ya los cubre el smoke
 * del 4321 y no hace falta probarlos dos veces.
 *
 * **No toca `sontres.shop`.** El Worker del 4323 corre con
 * `STOREFRONT_DOMAIN` apuntando a la tienda de demostración, y el `globalSetup`
 * aborta la corrida entera si eso no se cumple: las dos tiendas viven en el
 * mismo proyecto de Supabase, así que un `.dev.vars` que no se escribió haría
 * que esta suite le creara pedidos al comercio.
 *
 * Corre sólo en Pixel 7 (ver `playwright.config.ts`): la pieza que existe acá y
 * en ningún otro lado es el menú mobile, que en escritorio no se ve.
 */

const HANDLE = 'zapatilla-urbana';

/** Igual que en el smoke de la demo: un error de consola invalida el caso. */
test.beforeEach(async ({ page }) => {
  const problemas: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') problemas.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (error) => problemas.push(`excepción: ${error.message}`));
  page.on('response', (res) => {
    if (res.status() >= 400) problemas.push(`HTTP ${res.status()} en ${res.url()}`);
  });

  (page as unknown as { problemas: string[] }).problemas = problemas;
});

/**
 * Los problemas que el caso considera suyos.
 *
 * Se descuenta una sola cosa, y con nombre y apellido: las fotos del catálogo de
 * demostración son archivos de `apps/demo/public/products/`, y esta app no los
 * tiene. Es el precio de servir los datos de la demo con el código de Treeshop,
 * y es preferible a copiarle al cliente las fotos de la demo en su `public/`.
 * El filtro es lo más angosto posible a propósito: cualquier otro 404 —una ruta
 * de esta app, un asset suyo— sigue tumbando el caso.
 */
const FOTO_DE_LA_DEMO = /\/products\/[^/]+\.(jpg|png|webp)$/;

function problemasDe(page: Page): string[] {
  return (page as unknown as { problemas: string[] }).problemas.filter(
    (p) =>
      !(FOTO_DE_LA_DEMO.test(p) || (p.includes('404') && p.includes('Failed to load resource'))),
  );
}

/**
 * Abre el menú.
 *
 * Es un `<a href="/catalogo">` y no un `<button>`, y eso no es un descuido: sin
 * JavaScript el enlace lleva al catálogo, y con JavaScript se convierte en el
 * disparador del diálogo. Un `<button>` sin JS no hace nada.
 */
async function abrirElMenu(page: Page): Promise<void> {
  await page.getByRole('link', { name: /abrir el menú/i }).click();
}

test('la portada dice el nombre de la tienda que sirve, no el de la app', async ({ page }) => {
  await page.goto('/');

  /*
   * Es la comprobación que la Fase 12 dejó pendiente para esta app. El logotipo
   * es de Treeshop y está en el código —es la marca del cliente—, pero el
   * `<title>` tiene que salir de `stores.name`. Con la app de Treeshop sirviendo
   * la tienda de la demo, las dos cosas se ven a la vez y no se pueden confundir.
   */
  await expect(page).toHaveTitle(new RegExp(NOMBRE_DE_LA_TIENDA.replace(/[()]/g, '\\$&')));
  await expect(page.getByRole('link', { name: 'Treeshop' })).toBeVisible();

  expect(problemasDe(page)).toEqual([]);
});

test('el menú en teléfono abre, navega y cierra con Escape', async ({ page }) => {
  await page.goto('/');

  const menu = page.locator('dialog#ts-menu');
  await expect(menu).toBeHidden();

  await abrirElMenu(page);
  await expect(menu).toBeVisible();

  /*
   * Que el `<dialog>` se abra con `showModal()` y no con una clase es lo que
   * hace que Escape lo cierre sin escribir nada. Si alguien lo cambia por un
   * `display` a mano, esto se pone en rojo: es la trampa de ADR-045 y ADR-049,
   * donde un `display` sin acotar a `[open]` deja el diálogo visible cerrado.
   */
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  await abrirElMenu(page);
  // «Todo» y no una categoría: las de Treeshop —Prendas, Calzados, Accesorios—
  // no existen en la tienda de la demo, y una PLP vacía probaría menos.
  await menu.getByRole('link', { name: 'Todo' }).click();
  await expect(page).toHaveURL(/\/catalogo/);

  // Navegar cierra el menú: quedaría tapando la página de destino.
  await expect(menu).toBeHidden();

  expect(problemasDe(page)).toEqual([]);
});

test('el buscador del encabezado sugiere, y Escape cierra primero la lista', async ({ page }) => {
  await page.goto('/');

  const dialogo = page.locator('dialog#ts-buscar');
  await page.getByRole('link', { name: 'Buscar productos' }).click();
  await expect(dialogo).toBeVisible();

  const campo = dialogo.getByRole('combobox', { name: 'Buscar productos' });
  await campo.pressSequentially('tecnic', { delay: 30 });
  const lista = dialogo.getByRole('listbox', { name: 'Sugerencias' });
  // La lista cuelga por debajo del campo y sale del diálogo: si el diálogo la
  // recortara, no sería visible.
  await expect(lista.getByRole('option', { name: /mochila técnica/i })).toBeVisible();

  /*
   * Escape va de lo más chico a lo más grande: el primero cierra la lista y deja
   * lo escrito; el segundo lo usa el navegador para vaciar un campo
   * `type="search"`, y recién el tercero cierra el diálogo.
   */
  await page.keyboard.press('Escape');
  await expect(lista).toBeHidden();
  await expect(campo).toHaveValue('tecnic');
  await expect(dialogo).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(campo).toHaveValue('');
  await expect(dialogo).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialogo).toBeHidden();

  expect(problemasDe(page)).toEqual([]);
});

test('se puede comprar de punta a punta', async ({ page }) => {
  await page.goto(`/productos/${HANDLE}/`);
  await page.getByRole('button', { name: /agregar al carrito/i }).click();

  const drawer = page.locator('dialog[open]');
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText(/zapatilla/i).first()).toBeVisible();

  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: /confirmá tu pedido/i })).toBeVisible();
  // El resumen lo arma el servidor: hasta que responde hay un skeleton.
  await expect(page.getByRole('button', { name: /confirmar pedido/i })).toBeEnabled();

  await page.fill('input[name="name"]', 'Ana Prueba');
  await page.fill('input[name="email"]', `ana-treeshop-${Date.now()}@e2e.test`);
  await page.fill('input[name="phone"]', '0981 123 456');
  await page.fill('input[name="street"]', 'Avda. de Prueba 123');
  await page.fill('input[name="city"]', 'Asunción');

  await page.getByRole('button', { name: /confirmar pedido/i }).click();

  await expect(page).toHaveURL(/\/checkout\/confirmacion/);
  /*
   * `\d{3,}` y no `1\d{3}`. El número de pedido es una secuencia por comercio
   * que **sólo crece**, así que el regex viejo tenía fecha de vencimiento: se
   * rompió el día que la tienda pasó el pedido 1999, con un #2003
   * perfectamente correcto en pantalla. Un test que falla por el paso del
   * tiempo y no por un cambio de código es peor que no tenerlo.
   */
  await expect(page.getByText(/^#\d{3,}$/).first()).toBeVisible();

  expect(problemasDe(page)).toEqual([]);
});

test('las políticas son las de este comercio y no las de la demo', async ({ page }) => {
  await page.goto('/politicas');

  /*
   * `contenido.ts` es de la app, no de la base: es lo único de esta página que
   * Treeshop no comparte con la demo, y hasta ahora no lo miraba nadie.
   *
   * **Este caso ya se puso en rojo una vez y funcionó.** Decía «todavía no hay
   * cuentas en la tienda», con el compromiso escrito de cambiar el texto antes
   * que la tienda; la Fase 1 entregó las cuentas y el caso falló, que es
   * exactamente lo que tenía que pasar. Lo que se afirma ahora es lo que la v2
   * sí sostiene: existe la cuenta, y lo que mirás sigue sin cruzarse con ella
   * —`store_events` guarda el id de sesión y nada lo ata a `customer_accounts`—.
   *
   * La frase vieja se sigue exigiendo ausente: es la que la v2 rompería primero
   * si alguien la reescribiera de memoria.
   */
  await expect(page.getByText(/no está atado a tu cuenta/i)).toBeVisible();
  await expect(page.getByText(/entrás con un código que te mandamos por correo/i)).toBeVisible();
  await expect(page.getByText(/todavía no hay cuentas en la tienda/i)).toHaveCount(0);
  await expect(page.getByText(/no se cruza con tus datos de cliente/i)).toHaveCount(0);

  expect(problemasDe(page)).toEqual([]);
});
