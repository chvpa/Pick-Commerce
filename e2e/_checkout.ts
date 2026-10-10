import { expect, type Page } from '@playwright/test';

/**
 * El checkout en tres pasos (ADR-166), para los specs que compran.
 *
 * Cada spec llenaba los campos a su manera y apretaba «Confirmar pedido». Con
 * los pasos eso ya no alcanza —cada uno valida antes de dejar pasar al
 * siguiente— y repetir el recorrido en cinco archivos sería cinco lugares para
 * olvidarse de un paso.
 */

export interface DatosDeCompra {
  readonly nombre?: string;
  /** Sin correo, se deja el que haya: con sesión es de sólo lectura. */
  readonly correo?: string;
  readonly telefono?: string;
  readonly documento?: string;
  readonly calle?: string;
  readonly ciudad?: string;
  /** El value de la forma de pago: `bank_transfer`, `simulated_card`. */
  readonly metodo?: string;
}

/** El checkout terminó de cargar: el resumen vino del servidor y el primer paso está a la vista. */
export async function checkoutListo(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Continuar a la entrega' })).toBeEnabled();
}

/** Los tres pasos, hasta dejar el pedido listo para confirmar. */
export async function completarCheckout(page: Page, datos: DatosDeCompra = {}): Promise<void> {
  await checkoutListo(page);

  await page.fill('input[name="name"]', datos.nombre ?? 'Ana Prueba');
  if (datos.correo !== undefined) await page.fill('input[name="email"]', datos.correo);
  else if (!(await page.locator('input[name="email"]').getAttribute('readonly'))) {
    await page.fill('input[name="email"]', `ana-${Date.now()}@e2e.test`);
  }
  await page.fill('input[name="phone"]', datos.telefono ?? '0981 123 456');
  await page.fill('input[name="taxId"]', datos.documento ?? '4512873');
  await page.getByRole('button', { name: 'Continuar a la entrega' }).click();

  await page.fill('input[name="street"]', datos.calle ?? 'Avda. de Prueba 123');
  await page.fill('input[name="city"]', datos.ciudad ?? 'Asunción');
  await page.getByRole('button', { name: 'Continuar al pago' }).click();

  if (datos.metodo) {
    await page.locator(`input[name="paymentMethod"][value="${datos.metodo}"]`).check();
  }
  await expect(page.getByRole('button', { name: 'Confirmar el pedido' })).toBeVisible();
}

export function botonDeConfirmar(page: Page) {
  return page.getByRole('button', { name: 'Confirmar el pedido' });
}

/**
 * En el teléfono el resumen está plegado arriba, como el handoff. Lo abre si
 * hace falta, para afirmar sobre lo que dice.
 */
export async function verResumen(page: Page): Promise<void> {
  // Primero que cargue: antes de hidratarse el botón todavía no está.
  await checkoutListo(page);
  const boton = page.getByRole('button', { name: 'Ver el resumen' });
  if (await boton.isVisible()) await boton.click();
}
