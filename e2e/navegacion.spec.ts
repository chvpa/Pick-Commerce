import { expect, test } from '@playwright/test';

/**
 * Critical path del storefront: Home → PLP → PDP, filtrado y carrito.
 *
 * Falla el test si aparece un error de consola o una respuesta HTTP >= 400
 * durante la navegación: es lo que faltaba para poder afirmar "no hay errores
 * al navegar" sin estar adivinando.
 */
test.beforeEach(async ({ page }) => {
  const problemas: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') problemas.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (error) => problemas.push(`excepción: ${error.message}`));
  page.on('response', (res) => {
    if (res.status() >= 400) problemas.push(`HTTP ${res.status()} en ${res.url()}`);
  });

  // Se expone al test para que cada uno lo revise al final.
  (page as unknown as { problemas: string[] }).problemas = problemas;
});

/**
 * Abre el panel de filtros (en mobile está colapsado) y expande una faceta.
 * Los acordeones arrancan cerrados por ADR-023, así que llegar a un checkbox
 * son dos pasos, igual que para un usuario.
 */
async function abrirFaceta(page: import('@playwright/test').Page, etiqueta: string) {
  const toggle = page.locator('#plp-toggle');
  if (await toggle.isVisible()) await toggle.click();
  await page
    .locator('#plp-panel details', { hasText: etiqueta })
    .first()
    .locator('summary')
    .first()
    .click();
}

function problemasDe(page: unknown): string[] {
  return (page as { problemas: string[] }).problemas;
}

test('Home → PLP → PDP y vuelta, sin errores', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /ropa técnica/i })).toBeVisible();

  await page.getByRole('link', { name: 'Catálogo', exact: true }).first().click();
  await expect(page).toHaveURL(/\/catalogo/);
  await expect(page.getByRole('heading', { name: 'Catálogo', level: 1 })).toBeVisible();

  await page.getByRole('link', { name: 'Campera cortaviento' }).click();
  await expect(page).toHaveURL(/\/productos\/campera-cortaviento/);
  await expect(page.getByRole('heading', { name: 'Campera cortaviento', level: 1 })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/catalogo/);

  expect(problemasDe(page)).toEqual([]);
});

test('filtrar no recarga la página y conserva el scroll', async ({ page }) => {
  await page.goto('/catalogo');

  // Marca el documento: si hubiera recarga completa, la marca desaparece.
  await page.evaluate(() => {
    (window as unknown as { __sinRecarga: boolean }).__sinRecarga = true;
  });

  await abrirFaceta(page, 'Color');
  await page.getByRole('checkbox', { name: /Negro/ }).first().check();
  await expect(page).toHaveURL(/color=Negro/);
  await expect(page.getByText(/2 productos/)).toBeVisible();

  const sobrevivio = await page.evaluate(
    () => (window as unknown as { __sinRecarga?: boolean }).__sinRecarga === true,
  );
  expect(sobrevivio, 'hubo recarga completa al filtrar').toBe(true);

  expect(problemasDe(page)).toEqual([]);
});

test('los filtros funcionan sin JavaScript', async ({ browser }) => {
  const contexto = await browser.newContext({ javaScriptEnabled: false });
  const page = await contexto.newPage();

  await page.goto('/catalogo');
  // Sin JavaScript el panel queda visible: el atributo hidden lo pone el script.
  await expect(page.locator('#plp-panel')).toBeVisible();
  await abrirFaceta(page, 'Color');
  await page.getByRole('checkbox', { name: /Negro/ }).first().check();
  await page.getByRole('button', { name: 'Aplicar' }).click();

  await expect(page).toHaveURL(/color=Negro/);
  await expect(page.getByText(/2 productos/)).toBeVisible();

  await contexto.close();
});

test('agregar al carrito abre el drawer y persiste al navegar', async ({ page }) => {
  await page.goto('/productos/campera-cortaviento');

  await page.getByRole('button', { name: 'Agregar al carrito' }).click();

  const drawer = page.getByRole('dialog', { name: 'Carrito' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText(/Campera cortaviento/)).toBeVisible();

  // Escape lo cierra: lo aporta <dialog> nativo, no código propio.
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();

  // El carrito es un MPA: sin persistencia se vaciaría acá (ADR-039).
  await page.goto('/catalogo');
  await expect(page.getByRole('button', { name: /Carrito/ })).toContainText('1');

  expect(problemasDe(page)).toEqual([]);
});

test('cambiar de variante actualiza precio y stock', async ({ page }) => {
  await page.goto('/productos/campera-cortaviento');

  await expect(page.getByText('Gs. 389.000')).toBeVisible();

  // Negro cuesta distinto que Azul en el catálogo mock.
  await page.getByRole('button', { name: 'Negro' }).click();
  await expect(page.getByText('Gs. 410.000')).toBeVisible();

  expect(problemasDe(page)).toEqual([]);
});

test('el panel de filtros se ve en desktop y se colapsa en mobile', async ({ page }, info) => {
  await page.goto('/catalogo');

  const panel = page.locator('#plp-panel');
  const toggle = page.locator('#plp-toggle');
  const esMobile = info.project.name === 'mobile';

  if (esMobile) {
    // Colapsado, pero alcanzable con un disparador que declara su estado.
    await expect(panel).toBeHidden();
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).toBeVisible();
  } else {
    // En desktop es un sidebar: siempre visible y sin disparador.
    await expect(panel).toBeVisible();
    await expect(toggle).toBeHidden();
    await expect(page.getByRole('button', { name: 'Aplicar' })).toBeVisible();
  }

  expect(problemasDe(page)).toEqual([]);
});
