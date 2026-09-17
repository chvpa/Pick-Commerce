import { expect, test, type Page } from '@playwright/test';
import { ADMIN_E2E } from '../scripts/datos-admin-e2e.ts';

/**
 * La tubería de eventos, de punta a punta.
 *
 * Es el Definition of Done de la Fase 10 en un test: alguien navega la tienda,
 * busca, compra, y el panel del Admin lo muestra. Nada de esto se puede afirmar
 * con un unitario — la captura vive en el middleware y en los endpoints, y lo que
 * hay que probar es que **el recorrido real** deja rastro.
 *
 * Corre contra el build servido por workerd, que es lo que importa acá más que en
 * ningún otro spec: en `astro dev` todas las rutas son SSR, así que un
 * `page_view` de una página estática se vería igual de bien y no existiría en
 * producción.
 */

const ADMIN = 'http://127.0.0.1:4322';
const HANDLE = 'zapatilla-urbana';

/** Un término que el catálogo de la demo no tiene, para el caso sin resultados. */
const SIN_RESULTADOS = 'tractor amarillo';

function vigilar(page: Page): string[] {
  const problemas: string[] = [];
  page.on('pageerror', (error) => problemas.push(`excepción: ${error.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') problemas.push(`console.error: ${msg.text()}`);
  });
  return problemas;
}

async function entrarAlAdmin(page: Page): Promise<void> {
  await page.goto(ADMIN);
  await page.locator('#email').fill(ADMIN_E2E.email);
  await page.locator('#password').fill(ADMIN_E2E.password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.locator('[data-slot="sidebar-trigger"]')).toBeVisible({ timeout: 30_000 });
}

/** El número de una tarjeta del panel, por su rótulo. */
async function metrica(page: Page, rotulo: string): Promise<number> {
  const texto = await page
    .locator('p', { hasText: new RegExp(`^${rotulo}$`) })
    .first()
    .locator('xpath=following-sibling::p[1]')
    .innerText();
  return Number(texto.replace(/\D/g, ''));
}

test('la navegación de la tienda llega al panel del Admin', async ({ page }) => {
  const problemas = vigilar(page);

  /*
   * El recorrido completo, con el buscador incluido: la PLP acepta `?q=` desde
   * antes de esta fase, así que los términos miden desde el primer día.
   */
  await page.goto('/');
  await page.goto(`/catalogo?q=${encodeURIComponent(SIN_RESULTADOS)}`);
  await expect(page.getByText(/no encontramos resultados/i).first()).toBeVisible();

  await page.goto('/catalogo?q=zapatilla');
  await page.goto(`/productos/${HANDLE}/`);
  await page.getByRole('button', { name: /agregar al carrito/i }).click();
  await expect(page.locator('dialog[open]')).toBeVisible();

  await page.goto('/carrito');
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: /confirmá tu pedido/i })).toBeVisible();

  await page.fill('input[name="name"]', 'Ana Analytics');
  await page.fill('input[name="email"]', `analytics-${Date.now()}@e2e.test`);
  await page.fill('input[name="phone"]', '0981 123 456');
  await page.fill('input[name="street"]', 'Avda. de Prueba 123');
  await page.fill('input[name="city"]', 'Asunción');
  await expect(page.getByRole('button', { name: /confirmar pedido/i })).toBeEnabled();
  await page.getByRole('button', { name: /confirmar pedido/i }).click();
  await expect(page).toHaveURL(/\/checkout\/confirmacion/);

  // --- Y ahora el panel ------------------------------------------------------

  await entrarAlAdmin(page);
  await page.goto(`${ADMIN}/analytics`);
  await expect(page.getByRole('heading', { name: 'Analytics', level: 1 })).toBeVisible({
    timeout: 15_000,
  });

  /*
   * Que haya **alguna** sesión, no exactamente una.
   *
   * La tienda de la demo es compartida: otros specs de la misma corrida navegan
   * y compran ahí, y afirmar un número exacto haría que este test dependiera del
   * orden en que corran los demás. Lo que se prueba es que la tubería entera
   * —cookie, captura, volcado en `waitUntil`, insert, RPC y pantalla— funciona.
   */
  await expect.poll(async () => metrica(page, 'Sesiones'), { timeout: 15_000 }).toBeGreaterThan(0);

  expect(await metrica(page, 'Páginas vistas')).toBeGreaterThan(0);
  expect(await metrica(page, 'Productos vistos')).toBeGreaterThan(0);

  // El embudo tiene los tres escalones, y el último sale de los pedidos.
  const embudo = page.getByRole('heading', { name: 'El embudo' }).locator('xpath=../..');
  await expect(embudo.getByText('Agregaron al carrito')).toBeVisible();
  await expect(embudo.getByText('Empezaron el checkout')).toBeVisible();
  await expect(embudo.getByText('Compraron')).toBeVisible();

  // El término que no encontró nada tiene que estar, y marcado.
  await expect(page.getByRole('cell', { name: SIN_RESULTADOS })).toBeVisible();

  expect(problemas, problemas.join('\n')).toEqual([]);
});

test('todas las páginas del sitio abren sesión, incluidas las de contenido', async ({ page }) => {
  /*
   * Hasta la Fase 12 esto afirmaba lo contrario: Políticas y Preguntas
   * frecuentes eran prerenderizadas y, con Workers Assets, una página que existe
   * en disco se sirve **sin ejecutar el Worker** — sin middleware, sin vista y
   * sin cookie. Era un hueco declarado en el panel.
   *
   * Dejaron de serlo porque su encabezado lleva el nombre de la tienda, que sale
   * de la base. El efecto secundario es que el hueco se cerró: ya no queda
   * ninguna página del sitio fuera de la medición.
   *
   * El test corre contra el build, que es donde esto se decide: en desarrollo
   * todo es SSR y la diferencia no se vería.
   */
  await page.context().clearCookies();

  for (const ruta of ['/politicas', '/preguntas-frecuentes', '/carrito']) {
    await page.context().clearCookies();
    await page.goto(ruta);
    const cookies = await page.context().cookies();
    expect(
      cookies.map((c) => c.name),
      `${ruta} no abrió sesión`,
    ).toContain('pick_sid');
  }
});

test('el 404 de un producto inexistente no cuenta dos veces', async ({ page }) => {
  /*
   * El PDP hace `Astro.rewrite('/404')`, y un rewrite vuelve a correr la cadena
   * de middleware **dentro del mismo request**. Con el buffer de eventos leído en
   * vez de vaciado, eso insertaba todo dos veces.
   *
   * Acá se comprueba lo observable: que la respuesta es una sola, con 404, y que
   * la sesión no cambia. El conteo exacto lo cubre el `splice(0)` y su comentario;
   * afirmarlo desde afuera exigiría leer la base desde el test, que es más
   * frágil que lo que probaría.
   */
  await page.context().clearCookies();
  await page.goto('/catalogo');
  const antes = (await page.context().cookies()).find((c) => c.name === 'pick_sid')?.value;
  expect(antes).toBeTruthy();

  const respuesta = await page.goto('/productos/no-existe-este-handle/');
  expect(respuesta?.status()).toBe(404);

  const despues = (await page.context().cookies()).find((c) => c.name === 'pick_sid')?.value;
  expect(despues, 'la sesión no puede cambiar por un 404').toBe(antes);
});
