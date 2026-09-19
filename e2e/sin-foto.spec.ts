import { expect, test, type Page } from '@playwright/test';
import { PRODUCTO_SIN_FOTO_E2E } from '../scripts/datos-admin-e2e.ts';
import { ADMIN, entrar, irALaTiendaDelSmoke } from './_admin.ts';

/**
 * Recuperar un producto oculto desde el teléfono (v2 Fase 5).
 *
 * Es el primer punto del Definition of Done —«el comercio fotografía y publica
 * un producto oculto desde el teléfono, sin ayuda»— hasta donde se puede
 * automatizar: la cámara de verdad no se emula, así que la foto entra por el
 * mismo input que la cámara usa. Lo que sí se ejercita entero es lo que pasa
 * después: achicarla en el navegador, subirla a Storage y colgarla del producto.
 *
 * Corre sobre la segunda tienda, la que el setup crea y el teardown borra, y
 * **sólo en el proyecto móvil**: el producto se fotografía una vez por corrida,
 * y en el proyecto de escritorio ya no quedaría nada que fotografiar.
 */

/**
 * Una foto generada en el navegador: 3000 × 2000, más grande que el lado
 * máximo, para comprobar que se achica antes de subir.
 */
async function fotoDePrueba(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 3000;
    canvas.height = 2000;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#e8e2d6';
    ctx.fillRect(0, 0, 3000, 2000);
    ctx.fillStyle = '#2b4c7e';
    ctx.fillRect(900, 400, 1200, 1200);
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/jpeg', 0.9));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binario = '';
    for (const b of bytes) binario += String.fromCharCode(b);
    return btoa(binario);
  });
  return Buffer.from(base64, 'base64');
}

/** El lado largo de una imagen, medido en el navegador después de bajarla. */
function ladoLargo(page: Page, src: string): Promise<number> {
  return page.evaluate(
    (url) =>
      new Promise<number>((resolver, rechazar) => {
        const imagen = new Image();
        imagen.onload = () => resolver(Math.max(imagen.naturalWidth, imagen.naturalHeight));
        imagen.onerror = () => rechazar(new Error(`no cargó ${url}`));
        imagen.src = url;
      }),
    src,
  );
}

test('un producto sin foto se fotografía desde el teléfono y vuelve a la vitrina', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'el flujo es del teléfono; se corre una vez');

  await entrar(page);
  await irALaTiendaDelSmoke(page);
  await page.goto(`${ADMIN}/productos/sin-foto`);

  const tarjeta = page
    .getByRole('list', { name: 'Productos sin foto' })
    .getByRole('listitem')
    .filter({ hasText: PRODUCTO_SIN_FOTO_E2E.title });
  await expect(tarjeta).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/con stock esperando/)).toBeVisible();

  // El input de la cámara pide la de atrás.
  const input = tarjeta.locator('input[type="file"]');
  await expect(input).toHaveAttribute('capture', 'environment');

  await input.setInputFiles({
    name: 'foto.jpg',
    mimeType: 'image/jpeg',
    buffer: await fotoDePrueba(page),
  });

  // Recuperado: sale de la cola.
  await expect(tarjeta).toHaveCount(0, { timeout: 30_000 });

  /*
   * Y se comprueba el artefacto, no la intención: la foto que quedó colgada del
   * producto existe en Storage, pesa menos que el tope del bucket y llegó
   * achicada —3000 px de entrada, 2048 como mucho de salida—.
   */
  await page.goto(`${ADMIN}/productos`);
  await page.getByPlaceholder('Título, marca o SKU').fill(PRODUCTO_SIN_FOTO_E2E.title);
  const miniatura = page
    .getByRole('row')
    .filter({ hasText: PRODUCTO_SIN_FOTO_E2E.title })
    .locator('img')
    .first();
  await expect(miniatura).toBeVisible({ timeout: 15_000 });

  const src = await miniatura.getAttribute('src');
  expect(src, 'la fila no trae la foto').toBeTruthy();

  const respuesta = await page.request.get(src!);
  expect(respuesta.ok()).toBe(true);
  expect(respuesta.headers()['content-type']).toMatch(/image\/(webp|jpeg)/);
  expect((await respuesta.body()).byteLength).toBeLessThan(5 * 1024 * 1024);
  expect(await ladoLargo(page, src!)).toBeLessThanOrEqual(2048);
});
