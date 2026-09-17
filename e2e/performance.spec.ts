import { gzipSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';

/**
 * Presupuesto de peso del storefront, medido sobre la red real.
 *
 * Hasta la Fase 12 esto convivía con `pnpm budget`, que leía el build en disco y
 * era el único que medía **comprimido**. Dejó de tener qué medir: el nombre de
 * la tienda pasó a salir de la base, así que las dos últimas páginas
 * prerenderizadas se volvieron on-demand y `dist/client` ya no contiene HTML.
 *
 * El control no se perdió, se mudó acá y cubre más que antes: las mismas cifras
 * en gzip, sobre **todas** las páginas —incluidas home, catálogo y PDP, que
 * nunca dejaron HTML en disco— y sobre lo que el navegador descarga de verdad en
 * vez de sobre lo que el build dejó escrito.
 *
 * El preview local no comprime, así que se comprime acá: es la misma cuenta que
 * hacía `budget.mjs` —gzip por archivo y suma— y da el mismo número.
 */

/** Gzip, que es lo que viaja por la red. */
const CSS = 20 * 1024;

/**
 * Lo que descarga una página, comprimido.
 *
 * Se cuenta por respuesta y no por recurso único: si el navegador pide algo dos
 * veces, se pagó dos veces.
 */
async function pesoGzip(page: Page, ruta: string): Promise<{ js: number; css: number }> {
  const porTipo = { js: 0, css: 0 };
  const pendientes: Promise<void>[] = [];

  page.on('response', (res) => {
    const url = res.url();
    if (!url.includes('/_astro/') && !url.endsWith('.js') && !url.endsWith('.css')) return;
    pendientes.push(
      res
        .body()
        .then((cuerpo) => {
          const tipo = url.endsWith('.css') ? 'css' : 'js';
          porTipo[tipo] += gzipSync(cuerpo).length;
        })
        // Respuesta sin cuerpo accesible —una precarga cancelada, por ejemplo—:
        // no suma. Ignorarla es correcto; hacer fallar el test, no.
        .catch(() => {}),
    );
  });

  await page.goto(ruta, { waitUntil: 'networkidle' });
  await Promise.all(pendientes);
  return porTipo;
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Las páginas con presupuesto, y por qué cada una tiene el suyo.
 *
 * `/politicas` es la referencia del layout: no tiene nada propio, así que su
 * peso **es** el del encabezado, el pie y el carrito. Si sube, subió para todo
 * el sitio.
 *
 * El catálogo tiene un presupuesto mayor, y no es una concesión: es el único que
 * carga `ClientRouter`, que son unos 5,6 KB gzip y que se compró a propósito
 * para que filtrar no recargue la página entera. Los 25 KB del proyecto se
 * escribieron cuando lo único que se medía eran las páginas de contenido —el
 * catálogo no dejaba HTML en disco, así que `pnpm budget` nunca lo pesó—. Al
 * medirlo por primera vez dio 26,6 KB. El número va declarado con su motivo, que
 * es mejor que aflojar el presupuesto de todo el sitio para que entre uno.
 */
/*
 * **Estos números son una señal, no una compuerta** (ADR-106, corregido el
 * 2026-09-14). Cuando uno bloquea algo que vale la pena, se sube el número y se
 * escribe el motivo; lo que no se hace es torcer un diseño para entrar por
 * ciento cincuenta bytes. Para lo que sirven es para avisar que una página
 * engordó sin que nadie lo decidiera.
 */
const PAGINAS = [
  { ruta: '/politicas', que: 'una página de contenido', js: 25 * 1024 },
  { ruta: '/', que: 'la home', js: 25 * 1024 },
  { ruta: '/productos/campera-cortaviento', que: 'el PDP', js: 25 * 1024 },
  /*
   * 29 y no 28 desde la v2 Fase 4: la tira de recomendados del carrito son unos
   * 300 bytes en el island del drawer, que viaja en todas las páginas. Se sube
   * el número con el motivo, que es lo que ADR-106 pide hacer cuando el
   * presupuesto avisa de algo que vale la pena.
   */
  { ruta: '/catalogo', que: 'el catálogo', js: 29 * 1024 },
];

for (const { ruta, que, js } of PAGINAS) {
  test(`${que} entra en el presupuesto de peso`, async ({ page }) => {
    const peso = await pesoGzip(page, ruta);

    expect(peso.js, `${que} descargó ${kb(peso.js)} de JS`).toBeLessThan(js);
    expect(peso.css, `${que} descargó ${kb(peso.css)} de CSS`).toBeLessThan(CSS);
    // Cero significa que no se midió nada: un cambio de rutas dejaría el
    // presupuesto en verde sin haber pesado una sola página.
    expect(peso.js, `${que} no descargó JavaScript: ¿se midió algo?`).toBeGreaterThan(0);
  });
}

test('la home carga menos JavaScript que el catálogo', async ({ page }) => {
  const home = (await pesoGzip(page, '/')).js;

  const otra = await page.context().newPage();
  const plp = (await pesoGzip(otra, '/catalogo')).js;
  await otra.close();

  // ClientRouter sólo lo paga el catálogo: si la home lo carga, se coló al
  // layout y toda página del sitio está pagando 5,6 KB gzip de más.
  expect(home, `home=${kb(home)} plp=${kb(plp)}`).toBeLessThan(plp);
});

test('las páginas de contenido no cargan islands innecesarias', async ({ page }) => {
  await page.goto('/politicas');
  // Sólo el carrito del header hidrata: políticas no tiene nada interactivo.
  const islands = await page.locator('astro-island').count();
  expect(islands).toBeLessThanOrEqual(2);
});
