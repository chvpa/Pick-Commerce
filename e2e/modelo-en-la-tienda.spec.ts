import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { clienteDeServidor } from '@pick/adapter-supabase';
import { IDS, PRODUCTOS } from '../scripts/seed-data.ts';

/**
 * Un modelo en la tienda (ADR-163): una sola tarjeta en el catálogo y los otros
 * productos del modelo como enlaces en la ficha.
 *
 * El modelo se arma acá y se desarma al terminar, en vez de vivir en el seed:
 * agrupar dos productos de la demo le saca una tarjeta al catálogo, y los tests
 * de navegación cuentan tarjetas. Corre con un solo worker, así que nadie más
 * mira el catálogo mientras el modelo existe.
 */

if (existsSync('.env')) process.loadEnvFile('.env');
const admin = clienteDeServidor({
  url: process.env.SUPABASE_URL!,
  secretKey: process.env.SUPABASE_SECRET_KEY!,
});

const NOMBRE = 'Modelo del e2e de la tienda';
const [zapatilla, mochila] = ['zapatilla-urbana', 'mochila-tecnica'].map((h) =>
  PRODUCTOS.find((p) => p.handle === h)!,
);

async function desarmar() {
  await admin
    .from('products')
    .update({ product_group_id: null, group_position: 0 })
    .in('id', [zapatilla!.id, mochila!.id]);
  await admin.from('product_groups').delete().eq('store_id', IDS.store).eq('name', NOMBRE);
}

test.beforeAll(async () => {
  await desarmar();
  const { data: grupo, error } = await admin
    .from('product_groups')
    .insert({
      tenant_id: IDS.tenant,
      store_id: IDS.store,
      name: NOMBRE,
      axis: 'color',
      display: 'swatch',
    })
    .select('id')
    .single();
  expect(error, error?.message).toBeNull();
  for (const [i, p] of [zapatilla!, mochila!].entries()) {
    await admin
      .from('products')
      .update({ product_group_id: grupo!.id, group_position: i })
      .eq('id', p.id);
  }
});

test.afterAll(desarmar);

test('el catálogo muestra el modelo una vez y la ficha ofrece los otros', async ({ page }) => {
  await page.goto('/catalogo');
  await expect(page.getByRole('link', { name: zapatilla!.title }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: mochila!.title })).toHaveCount(0);

  await page.goto(`/productos/${zapatilla!.handle}`);
  const modelo = page.getByRole('navigation', { name: 'Color' });
  await expect(modelo).toContainText('Color: Negro');
  await expect(modelo.getByRole('link', { name: 'Negro' })).toHaveAttribute('aria-current', 'page');

  await modelo.getByRole('link', { name: 'Verde' }).click();
  await expect(page).toHaveURL(new RegExp(`/productos/${mochila!.handle}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(mochila!.title);
  await expect(
    page.getByRole('navigation', { name: 'Color' }).getByRole('link', { name: 'Verde' }),
  ).toHaveAttribute('aria-current', 'page');
});
