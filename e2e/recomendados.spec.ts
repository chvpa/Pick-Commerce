import { expect, test, type Page } from '@playwright/test';
import { RELACIONADOS_E2E } from '../scripts/preparar-storefront-e2e.ts';

/**
 * «Quien vio esto, vio»: la tira del PDP (v2 Fase 4, ADR-127).
 *
 * La relación entre los dos productos la siembra `preparar-storefront-e2e.ts`
 * con una co-vista y el recálculo corrido, así que el caso no depende del
 * tráfico que haya quedado de otra corrida.
 */

const [ANCLA, RELACIONADO] = RELACIONADOS_E2E;

function vigilar(page: Page): string[] {
  const problemas: string[] = [];
  page.on('console', (m) => m.type() === 'error' && problemas.push(`consola: ${m.text()}`));
  page.on('pageerror', (e) => problemas.push(`excepción: ${e.message}`));
  page.on('response', (r) => r.status() >= 400 && problemas.push(`HTTP ${r.status()} ${r.url()}`));
  return problemas;
}

test('el PDP muestra lo que miró quien miró esto, con precio', async ({ page }) => {
  const problemas = vigilar(page);
  await page.goto(`/productos/${ANCLA}/`);

  const tira = page.locator('#pista-relacionados');
  await expect(tira).toBeVisible();
  await expect(tira.getByRole('link', { name: /campera cortaviento/i })).toBeVisible();

  // Con precio, al revés que «Seguí viendo»: es una vitrina, no un atajo.
  await expect(tira.getByText(/^Gs\./).first()).toBeVisible();

  // Y nunca se recomienda a sí mismo.
  await expect(tira.locator(`a[href="/productos/${ANCLA}"]`)).toHaveCount(0);

  expect(problemas).toEqual([]);
});

test('la tira lleva al producto recomendado', async ({ page }) => {
  await page.goto(`/productos/${ANCLA}/`);
  await page.locator('#pista-relacionados').getByRole('link').first().click();
  await expect(page).toHaveURL(/\/productos\//);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('sin relacionados no hay tira: ni título ni carrusel vacío', async ({ page }) => {
  /*
   * Un producto que nadie miró junto a otro. Es la mitad de los casos de una
   * tienda recién abierta, y un carrusel vacío con su título es peor que no
   * tenerlo: promete algo que no hay.
   */
  await page.goto(`/productos/${RELACIONADO}/`);
  const tira = page.locator('#pista-relacionados');

  if ((await tira.count()) === 0) {
    await expect(page.getByText(/quien vio esto/i)).toHaveCount(0);
    return;
  }

  // Si el fixture le dejó relacionados, al menos no puede estar vacía.
  await expect(tira.getByRole('link')).not.toHaveCount(0);
});
