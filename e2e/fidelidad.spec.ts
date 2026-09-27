import { expect, test } from '@playwright/test';
import { ADMIN, entrar, irALaTiendaDelSmoke } from './_admin.ts';

/**
 * El programa de puntos (ADR-141).
 *
 * Dos cosas, y las dos son de cableado: que la pantalla del comercio encienda el
 * programa y publique un premio, y que la ruta de canje del storefront exista. Las
 * reglas —qué paga, qué no se puede canjear, qué vence— las prueban los diecisiete
 * casos de PGlite, que es donde vive el libro.
 *
 * Lo que sí se afirma acá y no allá es **el tipo de cambio implícito**: es una frase
 * en una pantalla, y es lo único que impide publicar un premio que sale más barato que
 * la compra que lo genera.
 */

const SOLO_ESCRITORIO = 'enciende el programa de la tienda del smoke, una sola vez';

test('el comercio enciende el programa y publica un premio, con el tipo de cambio a la vista', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', SOLO_ESCRITORIO);
  await entrar(page);
  await irALaTiendaDelSmoke(page);
  await page.goto(`${ADMIN}/clientes/fidelidad`);

  // Arranca apagado: una tienda que no lo pidió no emite un pasivo.
  await expect(page.getByText('Nadie gana puntos hasta que lo enciendas.')).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole('switch', { name: 'Programa de puntos' }).click();
  await expect(
    page.getByText('Cada compra cobrada y cada reseña publicada suman puntos.'),
  ).toBeVisible({ timeout: 15_000 });

  // El premio, y la frase que importa: 20 por compra y 10 de costo alcanza para dos.
  await page.getByRole('button', { name: 'Nuevo premio' }).click();
  await page.getByLabel('Nombre del premio').fill('Diez por ciento del smoke');
  await page.getByLabel('Cuesta').fill('10');
  await expect(page.getByText(/alcanza para 2 canjes/)).toBeVisible();

  // Y con un costo alto, la frase se da vuelta: son cinco compras por canje.
  await page.getByLabel('Cuesta').fill('100');
  await expect(page.getByText(/hacen falta 5 compras/)).toBeVisible();

  await page.getByRole('switch', { name: 'Activo' }).click();
  await page.getByRole('button', { name: 'Guardar premio' }).click();

  const premio = page
    .getByRole('list', { name: 'Premios' })
    .getByRole('listitem')
    .filter({ hasText: 'Diez por ciento del smoke' });
  await expect(premio).toBeVisible({ timeout: 15_000 });
  await expect(premio).toContainText('100 puntos');
  await expect(premio).toContainText('Activo');
});

test('la ruta de canje existe y sin sesión manda a entrar', async ({ page }) => {
  await page.goto('/cuenta');

  const estado = await page.evaluate(async () => {
    const cuerpo = new URLSearchParams({ rewardId: '5eed0000-0000-4000-8000-000000000001' });
    // `redirect: manual` para ver el 302 y no la página a la que lleva.
    const r = await fetch('/api/canjear', { method: 'POST', body: cuerpo, redirect: 'manual' });
    return r.status;
  });

  // 302 u opaco —`manual` devuelve 0 en algunos motores—, nunca un 404 ni un 500.
  expect([0, 302, 303]).toContain(estado);
});
