import { expect, test } from '@playwright/test';
import { ADMIN } from './_admin.ts';

/**
 * Entrar y recuperar la contraseña (ADR-157). Entrar bien lo prueban todos los
 * specs del Admin; acá va lo que ninguno toca: el error y el pedido del enlace.
 *
 * El pedido del enlace se intercepta. Un correo de recuperación por corrida a una
 * dirección que no existe le baja la reputación al dominio que manda los correos
 * de verdad, y lo que se prueba es la pantalla: que pida el correo, que lo mande
 * y que diga lo mismo exista o no la cuenta.
 */

test('una contraseña equivocada se dice sin decir cuál de las dos falló', async ({ page }) => {
  await page.goto(ADMIN);
  await page.locator('#email').fill('nadie@ejemplo.test');
  await page.locator('#password').fill('no-es-esta');
  await page.getByRole('button', { name: 'Ingresar' }).click();

  await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos', {
    timeout: 15_000,
  });
  await expect(page.getByRole('button', { name: 'Ingresar' })).toBeEnabled();
});

test('recuperar pide el enlace y responde lo mismo, exista o no la cuenta', async ({ page }) => {
  let pedido: unknown = null;
  await page.route('**/auth/v1/recover**', async (ruta) => {
    pedido = ruta.request().postDataJSON();
    await ruta.fulfill({ json: {} });
  });

  await page.goto(ADMIN);
  await page.getByRole('button', { name: '¿La olvidaste?' }).click();
  await expect(page.getByRole('heading', { name: 'Recuperar contraseña' })).toBeVisible();

  const enviar = page.getByRole('button', { name: 'Enviar enlace' });
  await expect(enviar).toBeDisabled();
  await page.locator('#email-recuperar').fill('nadie@ejemplo.test');
  await enviar.click();

  await expect(
    page.getByRole('status').filter({ hasText: 'Si nadie@ejemplo.test tiene una cuenta' }),
  ).toContainText('te llega un enlace');
  expect(pedido).toMatchObject({ email: 'nadie@ejemplo.test' });

  await page.getByRole('button', { name: 'Volver a ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Ingresá al Admin' })).toBeVisible();
});
