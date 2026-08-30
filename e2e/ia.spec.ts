import { expect, test, type Page } from '@playwright/test';
import { ADMIN_E2E } from '../scripts/datos-admin-e2e.ts';

/**
 * BYOK: lo que ve una tienda **sin** credencial de OpenAI.
 *
 * Es el primer punto del Definition of Done de la fase —«un tenant sin OpenAI
 * sigue funcionando normalmente»— y la única forma de comprobarlo de verdad es
 * abrir el Admin y usarlo: el enriquecimiento tiene que explicar qué falta, no
 * romperse ni desaparecer.
 *
 * De paso es el test que atraviesa la cadena entera del Worker nuevo: el
 * navegador manda el JWT a `/api/ia/enriquecer`, el Worker lo reenvía a un RPC
 * `security definer`, y el 409 vuelve hasta la pantalla.
 *
 * Lo que este test **no** cubre, y conviene que quede escrito: la configuración
 * de `run_worker_first`. Se comprobó quitándola, y la suite siguió en verde —
 * `wrangler dev` ejecuta el Worker para una ruta sin asset la declare o no. En
 * producción, con Workers Assets, la documentación dice que sin ella `/api/*`
 * caería en el `index.html` del SPA. Es una divergencia dev/producción y se
 * verifica desplegando, no desde acá.
 *
 * Lo que **no** está acá: guardar una credencial de verdad. El Worker la valida
 * contra OpenAI antes de guardarla, así que una key falsa nunca se guarda y una
 * de verdad no puede vivir en el repositorio. Probar con una falsa mediría que
 * api.openai.com contesta, que no es lo que este smoke tiene que cuidar.
 */

const ADMIN = 'http://127.0.0.1:4322';

async function entrar(page: Page): Promise<void> {
  await page.goto(ADMIN);
  await page.locator('#email').fill(ADMIN_E2E.email);
  await page.locator('#password').fill(ADMIN_E2E.password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.locator('[data-slot="sidebar-trigger"]')).toBeVisible({ timeout: 30_000 });
}

test.describe('Inteligencia artificial', () => {
  test('sin credencial, el enriquecimiento explica qué falta en vez de fallar', async ({
    page,
  }) => {
    await entrar(page);
    await page.goto(`${ADMIN}/productos/nuevo`);

    const sugerencias = page.getByRole('button', { name: 'Sugerir con IA' });
    await expect(sugerencias).toBeVisible({ timeout: 30_000 });
    await sugerencias.click();

    /*
     * El mensaje del 409, con su enlace. Que sea un enlace y no una frase suelta
     * es el punto: quien acaba de descubrir la función tiene que poder ir a
     * cargar la clave desde donde está.
     */
    const aviso = page.getByRole('alert');
    await expect(aviso).toContainText('no tiene una clave de OpenAI', { timeout: 30_000 });
    await expect(aviso.getByRole('link', { name: /Configuración/ })).toBeVisible();

    // Y el producto se sigue pudiendo cargar: la IA es un accesorio, no un paso.
    await expect(page.getByRole('button', { name: 'Guardar' })).toBeEnabled();
  });

  test('la configuración ofrece cargar la clave, y nada más hasta que exista', async ({ page }) => {
    await entrar(page);
    await page.goto(`${ADMIN}/configuracion`);

    await expect(page.getByLabel('Clave de OpenAI')).toBeVisible({ timeout: 30_000 });

    /*
     * Acotado a su propio formulario: la pantalla tiene tres tarjetas y cada una
     * tiene su «Guardar». Sin el filtro, el localizador encuentra los tres y el
     * test falla por ambigüedad en vez de por lo que quiere afirmar.
     */
    const tarjeta = page.locator('form').filter({ has: page.getByLabel('Clave de OpenAI') });

    await expect(tarjeta.getByLabel('Modelo')).toBeVisible();

    /*
     * Probar y quitar sólo aparecen con una credencial guardada. Es lo que
     * separa «todavía no configuraste esto» de «esto dejó de andar»: sin la
     * distinción, un botón «Probar conexión» sobre la nada falla siempre y
     * parece un error del sistema.
     */
    await expect(tarjeta.getByRole('button', { name: 'Probar conexión' })).toHaveCount(0);
    await expect(tarjeta.getByRole('button', { name: 'Quitar' })).toHaveCount(0);

    // Sin clave escrita no se puede guardar: un submit vacío sería un viaje al
    // servidor para que conteste lo que la pantalla ya sabe.
    await expect(tarjeta.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });
});
