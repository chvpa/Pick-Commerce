import { expect, test } from '@playwright/test';
import { PROPUESTA_E2E } from '../scripts/datos-admin-e2e.ts';
import { ADMIN, entrar, irALaTiendaDelSmoke } from './_admin.ts';

/**
 * Revisar y publicar lo que propuso la IA (v2 Fase 5, ADR-130).
 *
 * Lo que se prueba es la promesa: **nada se publica sin que una persona lo
 * apruebe**, y cuando aprueba, se publica. La propuesta se siembra: llamar a
 * OpenAI en cada corrida gastaría la clave del comercio y mediría que su API
 * contesta, que no es lo que este smoke tiene que cuidar —el mismo criterio que
 * `ia.spec.ts`—.
 *
 * Corre sobre la segunda tienda, que el teardown borra.
 */

/*
 * Sólo en escritorio: la propuesta sembrada es **una**, y el primer proyecto que
 * la apruebe deja al otro sin nada que revisar. Además es la pantalla que se usa
 * sentado, comparando dos fotos; la del teléfono es «Sin foto».
 */
const SOLO_ESCRITORIO = 'se revisa una vez, en escritorio';

test.describe('Fotos con fondo limpio', () => {
  /*
   * Sólo en escritorio: la propuesta sembrada es **una**, y el primer proyecto
   * que la apruebe deja al otro sin nada que revisar. Además es la pantalla que
   * se usa sentado, comparando dos fotos; la del teléfono es «Sin foto».
   */
  test('la propuesta se ve al lado de la original y no se publica sola', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', SOLO_ESCRITORIO);
    await entrar(page);
    await irALaTiendaDelSmoke(page);
    await page.goto(`${ADMIN}/productos/fotos`);

    const tarjeta = page
      .getByRole('list', { name: 'Fotos propuestas' })
      .getByRole('listitem')
      .filter({ hasText: PROPUESTA_E2E.title });
    await expect(tarjeta).toBeVisible({ timeout: 15_000 });

    // Las dos fotos, y las dos cargan: comparar es lo único que hace honesta la
    // aprobación.
    const original = tarjeta.getByRole('img', { name: /foto original/i });
    const propuesta = tarjeta.getByRole('img', { name: /propuesta de la ia/i });
    await expect(original).toBeVisible();
    await expect(propuesta).toBeVisible();
    for (const imagen of [original, propuesta]) {
      await expect
        .poll(() => imagen.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 15_000 })
        .toBeGreaterThan(0);
    }

    // Y mientras nadie apruebe, el producto sigue mostrando la original.
    await page.goto(`${ADMIN}/productos`);
    await page.getByPlaceholder('Título, marca o SKU').fill(PROPUESTA_E2E.title);
    const miniatura = page
      .getByRole('row')
      .filter({ hasText: PROPUESTA_E2E.title })
      .locator('img')
      .first();
    await expect(miniatura).toBeVisible({ timeout: 15_000 });
    expect(await miniatura.getAttribute('src')).toBe(PROPUESTA_E2E.original);
  });

  test('publicar una propuesta cambia la foto del producto', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', SOLO_ESCRITORIO);
    await entrar(page);
    await irALaTiendaDelSmoke(page);
    await page.goto(`${ADMIN}/productos/fotos`);

    const tarjeta = page
      .getByRole('list', { name: 'Fotos propuestas' })
      .getByRole('listitem')
      .filter({ hasText: PROPUESTA_E2E.title });
    await expect(tarjeta).toBeVisible({ timeout: 15_000 });
    await tarjeta.getByRole('button', { name: 'Publicar' }).click();

    // Sale de la cola de revisión: ya se decidió.
    await expect(tarjeta).toHaveCount(0, { timeout: 15_000 });

    await page.goto(`${ADMIN}/productos`);
    await page.getByPlaceholder('Título, marca o SKU').fill(PROPUESTA_E2E.title);
    const miniatura = page
      .getByRole('row')
      .filter({ hasText: PROPUESTA_E2E.title })
      .locator('img')
      .first();
    await expect(miniatura).toBeVisible({ timeout: 15_000 });
    expect(await miniatura.getAttribute('src')).toBe(PROPUESTA_E2E.propuesta);
  });

  test('sin credencial, pedir la limpieza explica qué falta', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', SOLO_ESCRITORIO);
    /*
     * La tienda del smoke no tiene clave de OpenAI, y no puede tenerla: una de
     * verdad no vive en el repositorio. Lo que se comprueba es la cadena entera
     * —navegador, Worker, RPC `security definer`— y que el 409 llegue como una
     * frase que se entiende, no como un 500.
     */
    await entrar(page);
    await irALaTiendaDelSmoke(page);
    await page.goto(`${ADMIN}/productos`);

    await page.getByPlaceholder('Título, marca o SKU').fill(PROPUESTA_E2E.title);
    const fila = page.getByRole('row').filter({ hasText: PROPUESTA_E2E.title });
    await expect(fila).toBeVisible({ timeout: 15_000 });
    await fila.getByRole('checkbox').check();

    await page.getByRole('button', { name: 'Limpiar fondo con IA' }).click();
    await expect(page.getByText(/se paga en esa cuenta/i)).toBeVisible();
    await page.getByRole('button', { name: 'Limpiar fondo' }).click();

    await expect(page.getByText(/no tiene una credencial de OpenAI/i)).toBeVisible({
      timeout: 30_000,
    });
  });
});
