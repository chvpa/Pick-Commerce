import { expect, test } from '@playwright/test';

/**
 * Presupuesto de performance medido sobre la red real.
 *
 * `pnpm budget` cubre las páginas prerenderizadas leyendo el build, pero no
 * `/catalogo`, que es on-demand y no deja HTML en disco — y es justo la más
 * pesada, porque es la única que carga ClientRouter. Acá se mide lo que el
 * navegador descarga de verdad, incluidas las rutas dinámicas.
 */
const PRESUPUESTO_JS = 30 * 1024;

async function pesoDescargado(page: import('@playwright/test').Page, ruta: string) {
  const porTipo = new Map<string, number>();

  page.on('response', async (res) => {
    const url = res.url();
    if (!url.includes('/_astro/') && !url.endsWith('.js') && !url.endsWith('.css')) return;
    try {
      const cuerpo = await res.body();
      const tipo = url.endsWith('.css') ? 'css' : 'js';
      porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + cuerpo.length);
    } catch {
      // Respuesta sin cuerpo accesible: no suma.
    }
  });

  await page.goto(ruta, { waitUntil: 'networkidle' });
  return porTipo;
}

test('el catálogo no excede el presupuesto de JavaScript', async ({ page }) => {
  const peso = await pesoDescargado(page, '/catalogo');
  const js = peso.get('js') ?? 0;

  // Sin comprimir: el preview local no aplica gzip. El presupuesto contempla
  // ese margen; `pnpm budget` mide el peso comprimido real del build.
  expect(js, `el catálogo descargó ${(js / 1024).toFixed(1)} KB de JS`).toBeLessThan(
    PRESUPUESTO_JS * 3,
  );
  expect(js).toBeGreaterThan(0);
});

test('la home carga menos JavaScript que el catálogo', async ({ page }) => {
  const home = (await pesoDescargado(page, '/')).get('js') ?? 0;

  const page2 = await page.context().newPage();
  const plp = (await pesoDescargado(page2, '/catalogo')).get('js') ?? 0;
  await page2.close();

  // ClientRouter sólo lo paga el catálogo: si la home lo carga, se coló al
  // layout y toda página del sitio está pagando 5,6 KB gzip de más.
  expect(home, `home=${home} plp=${plp}`).toBeLessThan(plp);
});

test('la home y el PDP también entran en el presupuesto de red', async ({ page }) => {
  /*
   * `pnpm budget` mide el build en disco, y desde ADR-057 estas dos rutas no
   * dejan HTML ahí: se resuelven en el Worker. Sin este test dejarían de tener
   * presupuesto sin que nadie lo note.
   */
  const home = (await pesoDescargado(page, '/')).get('js') ?? 0;

  const otra = await page.context().newPage();
  const pdp = (await pesoDescargado(otra, '/productos/campera-cortaviento')).get('js') ?? 0;
  await otra.close();

  expect(home, `la home descargó ${(home / 1024).toFixed(1)} KB de JS`).toBeLessThan(
    PRESUPUESTO_JS * 3,
  );
  expect(pdp, `el PDP descargó ${(pdp / 1024).toFixed(1)} KB de JS`).toBeLessThan(
    PRESUPUESTO_JS * 3,
  );
});

test('las páginas de contenido no cargan islands innecesarias', async ({ page }) => {
  await page.goto('/politicas');
  // Sólo el carrito del header hidrata: políticas no tiene nada interactivo.
  const islands = await page.locator('astro-island').count();
  expect(islands).toBeLessThanOrEqual(2);
});
