import { expect, test, type Page } from '@playwright/test';

/**
 * El buscador que encuentra (v2, Fase 3): tipeos, acentos, cero resultados que
 * no son una página vacía y sugerencias navegables con el teclado.
 *
 * Contra el catálogo de la demo, que siembra `pnpm seed`: «Mochila técnica 28 L»
 * es la que tiene acento, y ninguna otra se le parece.
 */

const MOCHILA = /mochila técnica 28 l/i;

/** Errores de consola y respuestas >= 400: una búsqueda que «anda» con un 500 de fondo no anda. */
function vigilar(page: Page): string[] {
  const problemas: string[] = [];
  page.on('console', (m) => m.type() === 'error' && problemas.push(`consola: ${m.text()}`));
  page.on('pageerror', (e) => problemas.push(`excepción: ${e.message}`));
  page.on('response', (r) => r.status() >= 400 && problemas.push(`HTTP ${r.status()} ${r.url()}`));
  return problemas;
}

function resultados(page: Page) {
  return page.locator('#plp-resultados');
}

test('un tipeo y un acento de menos encuentran lo mismo', async ({ page }) => {
  const problemas = vigilar(page);

  await page.goto('/catalogo?q=mochla');
  await expect(resultados(page).getByRole('link', { name: MOCHILA })).toBeVisible();

  await page.goto('/catalogo?q=TECNICA');
  await expect(resultados(page).getByRole('link', { name: MOCHILA })).toBeVisible();

  expect(problemas).toEqual([]);
});

test('cero resultados propone una corrección y productos para seguir', async ({ page }) => {
  const problemas = vigilar(page);

  // «cmpra» se parece a «campera» lo justo para sugerirla y no para encontrarla.
  await page.goto('/catalogo?q=cmpra');
  await expect(page.getByText('No encontramos resultados para «cmpra»')).toBeVisible();
  await expect(page.getByRole('heading', { name: /lo más vendido|novedades/i })).toBeVisible();
  await expect(resultados(page).locator('a[href^="/productos/"]').first()).toBeVisible();

  const correccion = page.getByText('¿Quisiste decir').getByRole('link');
  await expect(correccion).toBeVisible();
  await correccion.click();
  await expect(page).toHaveURL(/q=/);
  await expect(page.getByText(/no encontramos resultados/i)).toHaveCount(0);

  expect(problemas).toEqual([]);
});

test('las sugerencias se eligen con el teclado', async ({ page }) => {
  const problemas = vigilar(page);
  await page.goto('/catalogo');

  const campo = page.getByRole('combobox', { name: 'Buscar productos' }).first();
  await campo.click();
  await campo.pressSequentially('tecnic', { delay: 30 });

  const lista = page.getByRole('listbox', { name: 'Sugerencias' });
  await expect(lista.getByRole('option', { name: MOCHILA })).toBeVisible();
  await expect(campo).toHaveAttribute('aria-expanded', 'true');

  // Escape cierra la lista sin borrar lo escrito.
  await campo.press('Escape');
  await expect(lista).toBeHidden();
  await expect(campo).toHaveValue('tecnic');

  await campo.pressSequentially('a', { delay: 30 });
  await expect(lista.getByRole('option', { name: MOCHILA })).toBeVisible();
  await campo.press('ArrowDown');
  await expect(campo).toHaveAttribute('aria-activedescendant', /sugerencias-0$/);
  await expect(lista.getByRole('option', { name: MOCHILA })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await campo.press('Enter');
  await expect(page).toHaveURL(/q=Mochila/);
  await expect(resultados(page).getByRole('link', { name: MOCHILA })).toBeVisible();

  expect(problemas).toEqual([]);
});

/*
 * El precio escrito en la frase (ADR-137).
 *
 * Los dos casos que distinguen el arreglo de no hacer nada. Con un techo enorme
 * tiene que encontrar **lo mismo** que sin él: si «hasta» y el número siguieran
 * entrando como palabras a buscar, la página saldría vacía porque el buscador
 * exige todos los términos. Y con un techo de un guaraní no encuentra nada, que
 * es la prueba de que el número se convirtió en filtro y no en ruido.
 */
test('«hasta» en la frase filtra por precio en vez de buscar la palabra', async ({ page }) => {
  const problemas = vigilar(page);

  await page.goto('/catalogo?q=mochila');
  await expect(resultados(page).getByRole('link', { name: MOCHILA })).toBeVisible();

  await page.goto('/catalogo?q=mochila+hasta+100000000');
  await expect(resultados(page).getByRole('link', { name: MOCHILA })).toBeVisible();

  await page.goto('/catalogo?q=mochila+hasta+1');
  await expect(page.getByText(/no encontramos resultados/i)).toBeVisible();

  expect(problemas).toEqual([]);
});
