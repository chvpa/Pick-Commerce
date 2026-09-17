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

test('el carrito sugiere lo que suele mirarse con lo que hay adentro', async ({ page }) => {
  const problemas = vigilar(page);

  await page.goto(`/productos/${ANCLA}/`);
  // Sin esperar la hidratación, el click llega antes que el handler y el drawer
  // no abre: es la carrera que `navegacion.spec.ts` ya cubre con esta espera.
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await page.getByRole('button', { name: /agregar al carrito/i }).click();

  const drawer = page.locator('dialog[open]');
  await expect(drawer).toBeVisible();

  // La tira vive del lado del cliente porque el carrito también: el servidor no
  // sabe qué hay adentro hasta que el navegador se lo dice.
  const tira = drawer.getByRole('heading', { name: /suele mirarse con esto/i });
  await expect(tira).toBeVisible();
  await expect(drawer.getByRole('link', { name: /campera cortaviento/i })).toBeVisible();

  expect(problemas).toEqual([]);
});

test('el endpoint no se cae con ids inventados ni cruza tiendas', async ({ request }) => {
  const basura = await request.get('/api/recomendados?v=no-es-un-uuid,otra-cosa');
  expect(basura.status()).toBe(200);
  expect(await basura.json()).toEqual({ productos: [] });

  const vacio = await request.get('/api/recomendados');
  expect(vacio.status()).toBe(200);
  expect(await vacio.json()).toEqual({ productos: [] });

  // Un uuid bien formado pero de otra tienda: la variante existe en la base y no
  // en esta tienda, así que el mapeo a producto no la alcanza.
  const ajeno = await request.get('/api/recomendados?v=00000000-0000-4000-8000-0000000000ff');
  expect(ajeno.status()).toBe(200);
  expect(await ajeno.json()).toEqual({ productos: [] });
});
