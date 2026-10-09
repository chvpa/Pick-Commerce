import { expect, test } from '@playwright/test';
import { ADMIN, entrar } from './_admin.ts';

/**
 * Configuración › Registro de actividad (ADR-160). Lo que se prueba es que lo que
 * alguien hace en el Admin aparece, con su antes y su después, y que el filtro de
 * lo sensible filtra. Lo que entra y lo que no lo prueba la suite de la base.
 */
test('un cambio hecho en el Admin aparece en el registro, y lo sensible se filtra', async ({
  page,
}) => {
  await entrar(page);

  // Un cambio propio, por la pantalla: prender y apagar el aviso de pedidos.
  await page.goto(`${ADMIN}/configuracion/cuenta`);
  const aviso = page.getByRole('switch', { name: 'Pedido nuevo' });
  await expect(aviso).toBeEnabled({ timeout: 15_000 });
  const estaba = await aviso.isChecked();
  await aviso.click();
  await expect(aviso).toBeChecked({ checked: !estaba, timeout: 15_000 });
  await expect(aviso).toBeEnabled({ timeout: 15_000 });
  await aviso.click();
  await expect(aviso).toBeChecked({ checked: estaba, timeout: 15_000 });
  await expect(aviso).toBeEnabled({ timeout: 15_000 });

  await page.goto(`${ADMIN}/configuracion/actividad`);
  const lista = page.getByRole('list', { name: 'Actividad' });
  await expect(lista.getByRole('listitem').first()).toContainText('cambió sus avisos', {
    timeout: 15_000,
  });
  await expect(lista.getByRole('listitem').first()).toContainText('Aviso de pedido nuevo');

  // Prender el propio aviso no es sensible (ADR-158): con el filtro, no está arriba.
  await page.getByRole('button', { name: 'Sensibles' }).click();
  await expect(page.getByRole('button', { name: 'Sensibles' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const filas = lista.getByRole('listitem');
  await expect(async () => {
    const n = await filas.count();
    for (let i = 0; i < Math.min(n, 5); i++) {
      await expect(filas.nth(i)).toContainText('Sensible');
    }
  }).toPass({ timeout: 15_000 });
});

test('el aviso de lo sensible se prende, queda prendido y se apaga', async ({ page }) => {
  await entrar(page);
  await page.goto(`${ADMIN}/configuracion/actividad`);
  const aviso = () => page.getByRole('switch', { name: 'Avisarme de los cambios sensibles' });
  await expect(aviso()).toBeEnabled({ timeout: 15_000 });
  const estaba = await aviso().isChecked();

  await aviso().click();
  await expect(aviso()).toBeChecked({ checked: !estaba, timeout: 15_000 });
  await page.reload();
  await expect(aviso()).toBeChecked({ checked: !estaba, timeout: 15_000 });

  // Como estaba: la tienda de la demo es compartida.
  await aviso().click();
  await expect(aviso()).toBeChecked({ checked: estaba, timeout: 15_000 });
  await expect(aviso()).toBeEnabled({ timeout: 15_000 });
});
