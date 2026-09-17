import { expect, test } from '@playwright/test';
import { ADMIN_E2E, TIENDA_E2E } from '../scripts/datos-admin-e2e.ts';
import {
  ADMIN,
  abrirSidebar,
  desplegable,
  elegir,
  entrar,
  irAContenido,
  vigilar,
} from './_admin.ts';

/**
 * Smoke del Admin: entrar, moverse por el sidebar y salir.
 *
 * Existe por un fallo concreto. El menú de usuario y el selector de tiendas
 * lanzaban una excepción de Base UI **al abrirse** —un `Menu.GroupLabel` fuera
 * de su `Menu.Group`— y se llevaban la pantalla puesta. No lo detectaba nada:
 * el typecheck pasa, el lint pasa, y el control se ve perfecto hasta que se le
 * hace clic. Es la clase de fallo que sólo encuentra un navegador.
 *
 * Por eso los tests afirman que el menú **abre**, no que el botón existe:
 * contar botones habría dado verde con la aplicación rota.
 *
 * El Admin corre en 4322, aparte del storefront: es otra aplicación y otro
 * build. La URL va explícita porque el `baseURL` de la configuración apunta al
 * storefront.
 */

test.describe('Admin', () => {
  test('el menú de usuario abre y deja cerrar sesión', async ({ page }) => {
    const problemas = vigilar(page);
    await entrar(page);
    await abrirSidebar(page);

    await page.locator('[data-slot="sidebar-footer"] button').first().click();

    // Que el menú **abra** es la aserción: antes reventaba justo acá.
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByText(ADMIN_E2E.email)).toBeVisible();

    await menu.getByRole('menuitem', { name: 'Salir' }).click();

    // Cerrar sesión devuelve al login.
    await expect(page.locator('#email')).toBeVisible({ timeout: 15_000 });
    expect(problemas, problemas.join('\n')).toEqual([]);
  });

  test('el selector de tiendas abre y cambia de tienda', async ({ page }) => {
    const problemas = vigilar(page);
    await entrar(page);
    await abrirSidebar(page);

    await page.locator('[data-slot="sidebar-header"] button').first().click();

    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();

    // Las dos tiendas de la organización: la del seed y la que crea el setup.
    // Sin la segunda, el componente dibuja una variante inerte y este test no
    // probaría nada.
    await expect(menu.getByRole('menuitem')).toHaveCount(2);

    await menu.getByRole('menuitem', { name: TIENDA_E2E.name }).click();

    // La cabecera del sidebar pasa a nombrar la tienda elegida.
    await expect(page.locator('[data-slot="sidebar-header"]')).toContainText(TIENDA_E2E.name);
    expect(problemas, problemas.join('\n')).toEqual([]);
  });

  test('la navegación del sidebar llega a las secciones', async ({ page }) => {
    const problemas = vigilar(page);
    await entrar(page);
    await abrirSidebar(page);

    for (const seccion of ['Productos', 'Pedidos', 'Promociones', 'Clientes']) {
      await page.getByRole('link', { name: seccion }).click();
      await expect(page.getByRole('heading', { name: seccion, level: 1 })).toBeVisible({
        timeout: 15_000,
      });
      await abrirSidebar(page);
    }

    // Contenido no es una pantalla sino un grupo, así que se prueba lo que hace:
    // desplegar tres entradas que llevan cada una a la suya.
    for (const sub of ['Secciones', 'Colecciones', 'Categorías'] as const) {
      await irAContenido(page, sub);
      await expect(page.getByRole('heading', { name: sub, level: 1 })).toBeVisible({
        timeout: 15_000,
      });
    }

    /*
     * Y se vuelve a plegar. Va aparte porque `irAContenido` sólo lo toca cuando
     * está cerrado: sin esta comprobación, cambiar el toggle por un
     * `setAbierto(true)` dejaba la suite entera en verde.
     */
    await abrirSidebar(page);
    const grupo = page.getByRole('button', { name: 'Contenido' });
    await expect(grupo).toHaveAttribute('aria-expanded', 'true');
    await grupo.click();
    await expect(grupo).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('[data-slot="sidebar-menu-sub"]')).toHaveCount(0);

    expect(problemas, problemas.join('\n')).toEqual([]);
  });

  test('las URLs de contenido aguantan entrar por la barra del navegador', async ({ page }) => {
    /*
     * Dos cosas que el sidebar no puede probar, porque el sidebar es justamente
     * el camino que no se usa acá.
     *
     * `/contenido` dejó de ser una pantalla, pero sigue viva en marcadores y en
     * el historial de quien ya la usaba: tiene que redirigir, no dar 404. Y
     * entrar directo a una subpantalla tiene que dejar el grupo desplegado —si
     * no, el menú diría que estás en otro lado que donde estás—.
     */
    const problemas = vigilar(page);
    await entrar(page);

    await page.goto(`${ADMIN}/contenido`);
    await expect(page).toHaveURL(/\/contenido\/secciones$/);
    await expect(page.getByRole('heading', { name: 'Secciones', level: 1 })).toBeVisible({
      timeout: 15_000,
    });

    /*
     * Y una URL vieja con su pestaña llega a la pantalla que nombraba, no a la
     * primera. La pantalla vieja ponía `?tab=` en la URL a propósito, para poder
     * compartirla: los marcadores que apuntan a otra cosa que Secciones son
     * exactamente los que esta ruta existe para no romper, así que mandarlos a
     * todos al mismo lado sería conservar la ruta sin conservar lo que decía.
     */
    await page.goto(`${ADMIN}/contenido?tab=categorias`);
    await expect(page).toHaveURL(/\/contenido\/categorias$/);

    await page.goto(`${ADMIN}/contenido/categorias`);
    await expect(page.getByRole('heading', { name: 'Categorías', level: 1 })).toBeVisible({
      timeout: 15_000,
    });

    await abrirSidebar(page);
    await expect(page.getByRole('button', { name: 'Contenido' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    expect(problemas, problemas.join('\n')).toEqual([]);
  });

  test('crear una campaña de descuento no exige escribir código', async ({ page }) => {
    /*
     * Es el Definition of Done de la Fase 9 en un test. Y como el de los menús,
     * afirma sobre lo que **pasa** y no sobre lo que se ve: que el preview diga
     * a cuántos productos alcanza sólo puede salir de una consulta que llegó a
     * la base con el alcance elegido.
     */
    const problemas = vigilar(page);
    await entrar(page);
    await abrirSidebar(page);

    await page.getByRole('link', { name: 'Promociones' }).click();
    await page.getByRole('link', { name: 'Nueva promoción' }).click();

    const titulo = `Rebaja del smoke ${Date.now()}`;
    await page.locator('#title').fill(titulo);
    await page.locator('#discountValue').fill('20');

    // El preview responde con el alcance real del catálogo de la tienda.
    await expect(page.getByText(/Alcanza \d+ productos?\./)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Crear promoción' }).click();

    // Vuelve a la lista, y la promoción está con su descuento y su estado.
    const fila = page.getByRole('row', { name: new RegExp(titulo) });
    await expect(fila).toBeVisible({ timeout: 15_000 });
    await expect(fila).toContainText('20 %');
    // El estado se lee del interruptor y no de una etiqueta: la promoción nace
    // en borrador, así que tiene que estar apagado. La etiqueta de al lado se
    // sacó porque decía lo mismo dos veces.
    await expect(fila.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    // Sin cupón ni mínimos, se ve en la vidriera además del carrito.
    await expect(fila).toContainText('Catálogo y carrito');

    expect(problemas, problemas.join('\n')).toEqual([]);
  });

  test('una sección de la home se arma sin escribir código', async ({ page }) => {
    /*
     * La otra mitad del Definition of Done. Se crea una colección **dinámica**
     * a propósito: es la que no tiene lista de productos y se resuelve como
     * consulta guardada, así que si `rules` no llegara a la base la colección
     * quedaría manual y vacía sin que nada avisara.
     */
    const problemas = vigilar(page);
    await entrar(page);
    await abrirSidebar(page);

    await irAContenido(page, 'Colecciones');
    await page.getByRole('link', { name: 'Nueva colección' }).click();

    const titulo = `Novedades del smoke ${Date.now()}`;
    await page.locator('#title').fill(titulo);
    await elegir(
      page,
      desplegable(page, '[aria-label="Cómo se arma la colección"]'),
      'Se arma sola, con una regla',
    );
    await elegir(page, desplegable(page, '#sort'), 'Novedades (lo último que entró)');
    await page.getByRole('switch').first().click();

    await page.getByRole('button', { name: 'Crear colección' }).click();

    const fila = page.getByRole('listitem').filter({ hasText: titulo });
    await expect(fila).toBeVisible({ timeout: 15_000 });
    await expect(fila).toContainText('Se arma sola, por novedades');
    // Mismo criterio que en promociones: el interruptor **es** el estado.
    await expect(fila.getByRole('switch')).toHaveAttribute('aria-checked', 'true');

    expect(problemas, problemas.join('\n')).toEqual([]);
  });

  test('el orden «Tendencia» se elige como cualquier otro y dice qué pasa sin datos', async ({
    page,
  }) => {
    /*
     * Un orden que se arma solo es el primero que el comercio va a mirar con
     * desconfianza: la línea de ayuda existe para que no tenga que preguntar qué
     * ve alguien cuando la tienda todavía no tiene tráfico (v2 Fase 4).
     */
    const problemas = vigilar(page);
    await entrar(page);
    await abrirSidebar(page);

    await irAContenido(page, 'Colecciones');
    await page.getByRole('link', { name: 'Nueva colección' }).click();

    const titulo = `Tendencia del smoke ${Date.now()}`;
    await page.locator('#title').fill(titulo);
    await elegir(
      page,
      desplegable(page, '[aria-label="Cómo se arma la colección"]'),
      'Se arma sola, con una regla',
    );
    await elegir(page, desplegable(page, '#sort'), 'Tendencia (lo que se está moviendo)');

    await expect(page.getByText(/se muestra el orden del catálogo/i)).toBeVisible();

    await page.getByRole('button', { name: 'Crear colección' }).click();

    const fila = page.getByRole('listitem').filter({ hasText: titulo });
    await expect(fila).toBeVisible({ timeout: 15_000 });
    await expect(fila).toContainText('tendencia');

    expect(problemas, problemas.join('\n')).toEqual([]);
  });

  test('las migas devuelven a la lista desde una pantalla de detalle', async ({ page }) => {
    /*
     * Existen por un problema concreto: al entrar a editar no había forma de
     * volver salvo el botón del navegador, que en mobile ni está a la vista. Se
     * afirma que el enlace **funciona**, no que se dibuja: unas migas que
     * apunten a una ruta inexistente se ven igual de bien y no llevan a ningún
     * lado.
     */
    const problemas = vigilar(page);
    await entrar(page);
    await abrirSidebar(page);

    await irAContenido(page, 'Colecciones');
    await page.getByRole('link', { name: 'Nueva colección' }).click();

    const migas = page.getByRole('navigation', { name: 'Migas de pan' });
    // Arrancan en la subpantalla y no en «Contenido»: ése dejó de ser una
    // pantalla, y enlazarlo daría dos migas seguidas al mismo lugar.
    await expect(migas).toContainText('Colecciones');
    await expect(migas).toContainText('Nueva colección');

    await migas.getByRole('link', { name: 'Colecciones' }).click();
    await expect(page).toHaveURL(/\/contenido\/colecciones$/);
    await expect(page.getByRole('link', { name: 'Nueva colección' })).toBeVisible();

    expect(problemas, problemas.join('\n')).toEqual([]);
  });

  test('las secciones se reordenan con las flechas', async ({ page }) => {
    // El orden sale de la lista y no de un número escrito a mano: lo que se ve
    // arriba tiene que quedar arriba después de recargar, no sólo en pantalla.
    const problemas = vigilar(page);
    await entrar(page);
    await abrirSidebar(page);

    await irAContenido(page, 'Secciones');

    // Acotado a la lista de secciones: `getByRole('listitem')` a secas agarra
    // también los ítems del menú lateral, que también son una lista.
    const lista = page.getByRole('list', { name: 'Secciones de la portada' });
    const filas = lista.getByRole('listitem');
    await expect(filas.first()).toBeVisible({ timeout: 15_000 });

    const cuantas = await filas.count();
    test.skip(cuantas < 2, 'la tienda del smoke no tiene dos secciones que intercambiar');

    /*
     * Se compara la secuencia entera, no un nombre suelto: dos secciones pueden
     * llamarse igual —dos bloques de avisos, por ejemplo— y entonces «la primera
     * se llama X» sería cierto antes y después de mover sin probar nada.
     */
    const titulos = async () =>
      page
        .getByRole('list', { name: 'Secciones de la portada' })
        .getByRole('button', { name: /^Subir / })
        .evaluateAll((botones) => botones.map((b) => b.getAttribute('title') ?? ''));

    const antes = await titulos();
    const esperado = [antes[1], antes[0], ...antes.slice(2)];

    await filas
      .nth(1)
      .getByRole('button', { name: /^Subir / })
      .click();

    /*
     * Primero se espera a que la pantalla lo refleje, y **recién después** se
     * recarga.
     *
     * `click()` vuelve apenas despacha el clic, no cuando la petición terminó:
     * recargar en el acto abortaba el pedido en vuelo, y el test fallaba
     * culpando al reordenamiento, que funcionaba.
     */
    await expect.poll(titulos, { timeout: 15_000 }).toEqual(esperado);

    // Y ahora sí: si el orden hubiera cambiado sólo en pantalla y no en la base,
    // acá volvería al anterior.
    await page.reload();
    await expect(filas.first()).toBeVisible({ timeout: 15_000 });
    await expect.poll(titulos, { timeout: 15_000 }).toEqual(esperado);

    expect(problemas, problemas.join('\n')).toEqual([]);
  });

  test('borrar pide confirmación y se puede arrepentir', async ({ page }) => {
    /*
     * Antes el tacho borraba de un clic. Se prueban las dos mitades: que
     * cancelar **no** borre —que es la que importa y la que un test descuidado
     * no cubre— y que confirmar sí.
     */
    const problemas = vigilar(page);
    await entrar(page);
    await abrirSidebar(page);

    await irAContenido(page, 'Colecciones');
    await page.getByRole('link', { name: 'Nueva colección' }).click();

    const titulo = `Novedades del smoke ${Date.now()}`;
    await page.locator('#title').fill(titulo);
    await page.getByRole('button', { name: 'Crear colección' }).click();

    const fila = page.getByRole('listitem').filter({ hasText: titulo });
    await expect(fila).toBeVisible({ timeout: 15_000 });

    // Primero cancelar: la colección tiene que seguir ahí.
    await fila.getByRole('button', { name: `Borrar ${titulo}` }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(fila).toBeVisible();

    // Ahora confirmar.
    await fila.getByRole('button', { name: `Borrar ${titulo}` }).click();
    await page.getByRole('button', { name: 'Borrar', exact: true }).click();
    await expect(fila).toHaveCount(0, { timeout: 15_000 });

    expect(problemas, problemas.join('\n')).toEqual([]);
  });

  test('cambiar de tienda cambia el contenido que se lista', async ({ page }) => {
    // Se usa una colección y no un banner porque el banner exige subir una
    // imagen, y lo que se prueba acá es el alcance por tienda, no la subida.
    const problemas = vigilar(page);
    await entrar(page);
    await abrirSidebar(page);

    await irAContenido(page, 'Colecciones');
    await page.getByRole('link', { name: 'Nueva colección' }).click();

    const titulo = `Novedades del smoke ${Date.now()}`;
    await page.locator('#title').fill(titulo);
    await page.getByRole('button', { name: 'Crear colección' }).click();

    const fila = page.getByRole('listitem').filter({ hasText: titulo });
    await expect(fila).toBeVisible({ timeout: 15_000 });

    // A la otra tienda de la organización.
    await abrirSidebar(page);
    await page.locator('[data-slot="sidebar-header"] button').first().click();
    await page.getByRole('menu').getByRole('menuitem', { name: TIENDA_E2E.name }).click();
    await expect(page.locator('[data-slot="sidebar-header"]')).toContainText(TIENDA_E2E.name);

    // La colección es de la otra tienda: acá no puede estar.
    await expect(fila).toHaveCount(0, { timeout: 15_000 });

    expect(problemas, problemas.join('\n')).toEqual([]);
  });

  test('cambiar de tienda descarta el borrador del formulario', async ({ page }) => {
    /*
     * El editor de categorías vive en estado local, y ese estado no sabe de qué
     * tienda es. Con un borrador escrito y un cambio de tienda, seguía mostrando
     * lo de la anterior —que se lee como «me cambié y sigo viendo lo de la
     * otra»— y guardarlo lo habría escrito en la tienda nueva.
     *
     * Desde que el editor es un panel modal, el selector de tiendas no se puede
     * tocar con él abierto: ése es el primer cierre. El segundo, que es el que
     * se prueba acá, es que el borrador tampoco sobrevive al cambio.
     */
    const problemas = vigilar(page);
    await entrar(page);
    await abrirSidebar(page);

    await irAContenido(page, 'Categorías');

    await page.getByRole('button', { name: 'Nueva categoría' }).click();
    const nombre = `Categoría del smoke ${Date.now()}`;
    await page.locator('#c-name').fill(nombre);
    await expect(page.locator('#c-name')).toHaveValue(nombre);

    // Cerrar es lo único que se puede hacer sin guardar: el panel es modal.
    await page.keyboard.press('Escape');
    await expect(page.locator('#c-name')).toHaveCount(0);

    await abrirSidebar(page);
    await page.locator('[data-slot="sidebar-header"] button').first().click();
    await page.getByRole('menu').getByRole('menuitem', { name: TIENDA_E2E.name }).click();
    await expect(page.locator('[data-slot="sidebar-header"]')).toContainText(TIENDA_E2E.name);

    // En mobile el sidebar es un sheet y cambiar de tienda no navega, así que
    // queda abierto tapando la pantalla. En desktop no hay sheet y esto no hace
    // nada.
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);

    // `first()`: la tienda del smoke no tiene categorías, así que el estado
    // vacío ofrece su propio botón además del de la cabecera.
    await page.getByRole('button', { name: 'Nueva categoría' }).first().click();
    await expect(page.locator('#c-name')).toHaveValue('');

    expect(problemas, problemas.join('\n')).toEqual([]);
  });
});
