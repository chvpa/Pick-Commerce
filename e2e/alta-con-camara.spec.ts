import { expect, test, type Page } from '@playwright/test';
import { ADMIN, entrar, irALaTiendaDelSmoke } from './_admin.ts';

/**
 * Cargar mercadería nueva con la cámara (v2 Fase 6, ADR-131).
 *
 * La tienda del smoke **no tiene credencial de OpenAI** y no puede tenerla: una
 * de verdad no vive en el repositorio. Eso deja afuera la lectura de la ficha,
 * que se prueba con `fetch` simulado en los unitarios, y deja adentro lo que
 * importa igual: que sin IA la pantalla siga sirviendo —el caso de un comercio
 * que no cargó su clave—, que la foto suba, y que lo que se guarda sea un
 * producto completo, con una variante por talle.
 *
 * Sólo en el proyecto móvil: es el flujo del teléfono, y correrlo dos veces
 * crearía dos productos.
 */

const NOMBRE = `Vestido del alta ${Date.now()}`;

/** Una foto de 3000 px, para que el achique antes de subir se ejercite. */
async function fotoDePrueba(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 3000;
    canvas.height = 2000;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#f3efe7';
    ctx.fillRect(0, 0, 3000, 2000);
    ctx.fillStyle = '#7e2b4c';
    ctx.fillRect(1000, 300, 1000, 1400);
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/jpeg', 0.9));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binario = '';
    for (const b of bytes) binario += String.fromCharCode(b);
    return btoa(binario);
  });
  return Buffer.from(base64, 'base64');
}

test('sin credencial de IA, el alta con la cámara igual carga el producto', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'es el flujo del teléfono; se corre una vez');

  await entrar(page);
  await irALaTiendaDelSmoke(page);
  await page.goto(`${ADMIN}/productos/camara`);

  /*
   * La miga dice dónde está. Sin su patrón propio, `/productos/camara` cae en el
   * de `/productos/$id` y el encabezado dice «Editar producto»: lo encontró esta
   * misma prueba, mirando la página cuando falló por otra cosa.
   */
  await expect(page.getByRole('navigation', { name: 'Migas de pan' })).toContainText(
    'Cargar con la cámara',
  );

  // Paso 1: la foto entra por el mismo input que usa la cámara de atrás.
  const entrada = page.locator('input[type="file"]');
  await expect(entrada).toHaveAttribute('capture', 'environment');
  await entrada.setInputFiles({
    name: 'vestido.jpg',
    mimeType: 'image/jpeg',
    buffer: await fotoDePrueba(page),
  });

  await expect(page.getByRole('list', { name: 'Fotos tomadas' }).getByRole('listitem')).toHaveCount(
    1,
  );
  const continuar = page.getByRole('button', { name: 'Continuar' });
  await expect(continuar).toBeEnabled({ timeout: 30_000 });
  await continuar.click();

  /*
   * Paso 2: sin credencial no hay versión limpia, y la original queda elegida.
   * Es exactamente el caso del comercio que todavía no cargó su clave: la
   * pantalla no se rompe, sigue.
   */
  await expect(page.getByRole('button', { name: /Original/ })).toHaveAttribute(
    'aria-pressed',
    'true',
    { timeout: 60_000 },
  );
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Paso 3: a mano, que es lo que queda cuando la IA no está.
  await page.getByLabel('Nombre del producto').fill(NOMBRE);
  await page.getByLabel('Agregar un talle').fill('M');
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  await page.getByLabel('Agregar un talle').fill('L');
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(page.getByText('2 variantes, una por talle.')).toBeVisible();

  await page.getByLabel('Precio').fill('250000');
  await page.getByRole('button', { name: 'Guardar producto' }).click();

  await expect(page.getByText(`«${NOMBRE}» quedó cargado`)).toBeVisible({ timeout: 30_000 });

  /*
   * Y se comprueba el artefacto: el producto está en el catálogo, con su foto y
   * con las dos variantes que se pidieron —no la intención de haberlas creado—.
   */
  await page.getByRole('button', { name: 'Ir al listado' }).click();
  await page.getByPlaceholder('Título, marca o SKU').fill(NOMBRE);

  const fila = page.getByRole('row').filter({ hasText: NOMBRE });
  await expect(fila).toBeVisible({ timeout: 15_000 });
  await expect(fila.locator('img').first()).toBeVisible();

  await fila.getByRole('link').first().click();
  await expect(page.getByRole('heading', { name: 'Editar producto' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('textbox', { name: 'SKU' })).toHaveCount(2);
});
