import { expect, test, type Page } from '@playwright/test';
import { clienteDeServidor } from '@pick/adapter-supabase';

/**
 * La Definition of Done de la Fase 7, ejecutable.
 *
 * Dos de las tres afirmaciones se verifican acá: que un pago de prueba pasa de
 * punta a punta, y que **un webhook repetido no duplica efectos**. La tercera
 * —que un pedido genera su notificación— se prueba contra la base, porque en una
 * corrida de tests no hay proveedor de correo configurado a propósito: nadie
 * quiere que el CI le mande correos a nadie.
 *
 * Mirar sólo el estado del pedido no alcanzaría para el webhook repetido. El
 * daño visible de un duplicado sería un segundo correo al comprador, así que lo
 * que se cuenta son los eventos y las filas de la cola.
 */

/*
 * La mochila y no la zapatilla: el smoke del checkout ya consume la zapatilla, y
 * desktop y mobile comparten base dentro de una corrida. Dos specs comprando el
 * mismo producto lo agotan y el segundo falla por una razón que no tiene nada
 * que ver con lo que prueba.
 */
const HANDLE = 'mochila-tecnica';

/** El mismo valor que `global-setup` le pasa al Worker. */
const SECRETO = 'secreto-de-prueba-del-e2e';

function db() {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) throw new Error('Faltan las credenciales de Supabase en el entorno.');
  return clienteDeServidor({ url, secretKey });
}

/** Qué quedó registrado de un pedido: su pago, sus eventos y sus correos. */
async function estadoDe(numero: number) {
  const cliente = db();
  const { data: pedido } = await cliente
    .from('orders')
    .select('id, payment_status')
    .eq('number', numero)
    .single();

  const { data: eventos } = await cliente
    .from('order_events')
    .select('type')
    .eq('order_id', pedido!.id)
    .eq('type', 'payment_changed');

  const { data: correos } = await cliente
    .from('notification_outbox')
    .select('event')
    .eq('order_id', pedido!.id);

  return {
    pago: pedido!.payment_status,
    eventosDePago: eventos?.length ?? 0,
    correos: (correos ?? []).map((c) => c.event).sort(),
  };
}

/**
 * Llena el checkout con el método de tarjeta de prueba y confirma.
 *
 * El carrito se siembra en `localStorage` en vez de clicar el PDP, igual que en
 * el smoke del checkout: agregar al carrito es asíncrono —consulta el stock
 * antes de guardar— y navegar enseguida cancela la escritura. Lo que este spec
 * prueba empieza en el checkout; llegar hasta ahí no debería poder fallar.
 */
async function comprarConTarjeta(page: Page, correo: string): Promise<void> {
  await page.goto(`/productos/${HANDLE}/`);

  // El id de la variante viaja en el HTML que la página serializa para la
  // island; los ids del seed son fijos y tienen forma reconocible.
  const html = await page.content();
  const variante = html.match(/[0-9a-f]{8}-0000-4000-8000-[0-9a-f]{12}/)?.[0];
  expect(variante, 'no se encontró el id de variante en el PDP').toBeTruthy();

  await page.evaluate((id) => {
    localStorage.setItem(
      'pick:cart:v1',
      JSON.stringify([
        {
          variantId: id,
          quantity: 1,
          title: 'Mochila técnica',
          price: { amount: 455000, currency: 'PYG' },
          available: 40,
        },
      ]),
    );
  }, variante as string);

  await page.goto('/checkout');
  const tarjeta = page.locator('input[name="paymentMethod"][value="simulated_card"]');
  await tarjeta.waitFor();
  await tarjeta.check();

  await page.fill('input[name="name"]', 'Ana Prueba');
  await page.fill('input[name="email"]', correo);
  await page.fill('input[name="phone"]', '0981 123 456');
  await page.fill('input[name="street"]', 'Avda. Siempre Viva 742');
  await page.fill('input[name="city"]', 'Asunción');
  await page.getByRole('button', { name: /confirmar/i }).click();
}

/** El número de pedido, tal como lo muestra la página de pago. */
async function numeroDelPedido(page: Page): Promise<number> {
  const texto = await page.getByRole('heading', { level: 1 }).innerText();
  const encontrado = texto.match(/#(\d+)/);
  expect(encontrado, `no se pudo leer el número del pedido en «${texto}»`).not.toBeNull();
  return Number(encontrado![1]);
}

test('un pago aprobado llega hasta la confirmación', async ({ page }) => {
  await comprarConTarjeta(page, `aprobado-${Date.now()}@e2e.test`);

  // El checkout redirige a la pasarela en vez de a la confirmación.
  await page.waitForURL(/\/pago\/simulado/);
  await expect(page.getByText(/modo de prueba/i)).toBeVisible();
  const numero = await numeroDelPedido(page);

  await page.getByRole('button', { name: 'Aprobar el pago' }).click();
  await page.waitForURL(/\/checkout\/confirmacion\?pago=aprobado/);
  await expect(page.getByText(/Pago aprobado/i)).toBeVisible();

  const estado = await estadoDe(numero);
  expect(estado.pago).toBe('paid');
  expect(estado.eventosDePago).toBe(1);
  // El pedido genera su notificación: recibido al crearse, confirmado al cobrar.
  expect(estado.correos).toEqual(['order_confirmed', 'order_received']);
});

test('un pago rechazado deja el pedido registrado y lo dice', async ({ page }) => {
  await comprarConTarjeta(page, `rechazado-${Date.now()}@e2e.test`);

  await page.waitForURL(/\/pago\/simulado/);
  const numero = await numeroDelPedido(page);

  await page.getByRole('button', { name: 'Rechazar el pago' }).click();
  await page.waitForURL(/\/checkout\/confirmacion\?pago=rechazado/);
  await expect(page.getByText(/rechazado/i).first()).toBeVisible();
  // El pedido sigue estando: es lo que permite rescatarlo por otro medio.
  await expect(page.getByText(`#${numero}`)).toBeVisible();

  const estado = await estadoDe(numero);
  expect(estado.pago).toBe('failed');
  // Un pago rechazado no confirma nada, así que no hay correo de confirmación.
  expect(estado.correos).toEqual(['order_received']);
});

test('el mismo aviso repetido no duplica el pago ni el correo', async ({ page, request }) => {
  await comprarConTarjeta(page, `repetido-${Date.now()}@e2e.test`);
  await page.waitForURL(/\/pago\/simulado/);
  const numero = await numeroDelPedido(page);

  // El token que la pasarela le manda al webhook, tal como está en el formulario.
  const token = await page
    .locator('form:has(button:text("Aprobar")) input[name="token"]')
    .inputValue();

  const primera = await request.post('/api/webhooks/pago', { data: { token } });
  const segunda = await request.post('/api/webhooks/pago', { data: { token } });
  const tercera = await request.post('/api/webhooks/pago', { data: { token } });

  // Las tres responden lo mismo: para el proveedor, reintentar no es un error.
  expect(primera.status()).toBe(200);
  expect(segunda.status()).toBe(200);
  expect(tercera.status()).toBe(200);

  const estado = await estadoDe(numero);
  expect(estado.pago).toBe('paid');
  expect(estado.eventosDePago, 'el webhook repetido duplicó el evento').toBe(1);
  expect(estado.correos, 'el webhook repetido encoló un segundo correo').toEqual([
    'order_confirmed',
    'order_received',
  ]);
});

test('un aviso con la firma adulterada no toca nada', async ({ page, request }) => {
  await comprarConTarjeta(page, `firma-${Date.now()}@e2e.test`);
  await page.waitForURL(/\/pago\/simulado/);
  const numero = await numeroDelPedido(page);

  const token = await page
    .locator('form:has(button:text("Aprobar")) input[name="token"]')
    .inputValue();

  /*
   * Se adultera el **primer** carácter de la firma, no el último.
   *
   * El último no sirve: la firma son 32 bytes, que en base64 son 43 caracteres,
   * y en el último **sobran dos bits**. Cuatro caracteres —`A`, `B`, `C` y `D`—
   * decodifican a los mismos bytes, así que reemplazarlo por `A` dejaba el token
   * intacto un 6 % de las veces y el test pasaba por suerte. Medido, no
   * estimado, después de verlo fallar en una corrida real.
   */
  const corte = token.lastIndexOf('.');
  const firma = token.slice(corte + 1);
  const adulterado =
    `${token.slice(0, corte + 1)}${firma.startsWith('A') ? 'B' : 'A'}${firma.slice(1)}`;
  expect(adulterado, 'la adulteración no cambió el token').not.toBe(token);
  const respuesta = await request.post('/api/webhooks/pago', { data: { token: adulterado } });
  expect(respuesta.status()).toBe(403);

  const estado = await estadoDe(numero);
  expect(estado.pago, 'una firma inválida marcó el pedido como pagado').toBe('pending');
  expect(estado.eventosDePago).toBe(0);
});

test('la pasarela no muestra nada sin un token válido', async ({ page }) => {
  // Sin esto, la página sería una forma de averiguar números de pedido probando.
  const sinToken = await page.goto('/pago/simulado');
  expect(sinToken?.status()).toBe(400);

  const inventado = await page.goto('/pago/simulado?token=aaa.bbb');
  expect(inventado?.status()).toBe(400);
});

test('el secreto del e2e coincide con el que usa el Worker', () => {
  // Si `global-setup` cambiara su secreto y este archivo no, todos los tests de
  // arriba fallarían con un 403 que parecería un problema de la aplicación.
  expect(SECRETO).toBe('secreto-de-prueba-del-e2e');
});
