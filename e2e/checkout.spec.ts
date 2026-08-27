import { expect, test, type Page } from '@playwright/test';

/**
 * La Definition of Done de la Fase 5, ejecutable.
 *
 * Tres afirmaciones y no una: el flujo completo, que un reintento no cree un
 * segundo pedido, y que el stock se revalide en el checkout. Las tres corren
 * contra el build servido por workerd, que es el artefacto que se despliega.
 *
 * El producto que consume es el más surtido del seed, y a propósito no es la
 * campera: los tests de navegación afirman «Gs. 389.000» sobre ella y sus
 * unidades. El seed del `global-setup` restituye el stock en cada corrida, pero
 * dentro de una misma corrida desktop y mobile comparten base.
 */

const HANDLE = 'zapatilla-urbana';

interface Respuesta {
  status: number;
  body: { order?: { id: string; number: number }; error?: string; issues?: { type: string }[] };
}

test.beforeEach(async ({ page }) => {
  const problemas: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') problemas.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (error) => problemas.push(`excepción: ${error.message}`));
  page.on('response', (res) => {
    // 409 es una respuesta esperada del checkout cuando el stock cambió.
    if (res.status() >= 400 && res.status() !== 409) {
      problemas.push(`HTTP ${res.status()} en ${res.url()}`);
    }
  });
  (page as unknown as { problemas: string[] }).problemas = problemas;
});

function problemasDe(page: unknown): string[] {
  return (page as { problemas: string[] }).problemas;
}

/** Deja el carrito con una unidad, sin depender de la UI del PDP. */
async function sembrarCarrito(page: Page, quantity: number): Promise<string> {
  await page.goto(`/productos/${HANDLE}/`);

  // El id de la variante viaja en el HTML que la página serializa para la
  // island. Se lo saca de ahí en vez de agregarle un atributo al markup sólo
  // para el test: los ids del seed son fijos y tienen forma reconocible.
  const html = await page.content();
  const id = html.match(/[0-9a-f]{8}-0000-4000-8000-[0-9a-f]{12}/)?.[0];
  expect(id, 'no se encontró el id de variante en el PDP').toBeTruthy();

  await page.evaluate(
    ([variante, cantidad]) => {
      localStorage.setItem(
        'pick:cart:v1',
        JSON.stringify([
          {
            variantId: variante,
            quantity: cantidad,
            title: 'Zapatilla urbana',
            price: { amount: 100, currency: 'PYG' },
            available: 99,
          },
        ]),
      );
    },
    [id as string, quantity] as const,
  );

  return id as string;
}

async function completarFormulario(page: Page): Promise<void> {
  await page.fill('input[name="name"]', 'Ana Prueba');
  await page.fill('input[name="email"]', `ana-${Date.now()}@e2e.test`);
  await page.fill('input[name="phone"]', '0981 123 456');
  await page.fill('input[name="street"]', 'Avda. de Prueba 123');
  await page.fill('input[name="city"]', 'Asunción');
}

test('Home → PDP → carrito → checkout → pedido', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('link', { name: /catálogo/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/catalogo/);

  await page.goto(`/productos/${HANDLE}/`);
  await page.getByRole('button', { name: /agregar al carrito/i }).click();

  // El drawer se abre con lo que se agregó.
  const drawer = page.locator('dialog[open]');
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText(/zapatilla/i).first()).toBeVisible();

  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: /confirmá tu pedido/i })).toBeVisible();

  // El resumen lo arma el servidor: hasta que responde hay un skeleton.
  await expect(page.getByRole('button', { name: /confirmar pedido/i })).toBeEnabled();

  await completarFormulario(page);
  await page.getByRole('button', { name: /confirmar pedido/i }).click();

  await expect(page).toHaveURL(/\/checkout\/confirmacion/);
  await expect(page.getByText(/^#1\d{3}$/).first()).toBeVisible();
  await expect(page.getByText(/cómo pagar/i)).toBeVisible();

  // El carrito quedó vacío: el contador del header ya no muestra unidades.
  await page.goto('/carrito');
  await expect(page.getByText(/tu carrito está vacío/i).first()).toBeVisible();

  expect(problemasDe(page)).toEqual([]);
});

test('un reintento con la misma clave no crea un segundo pedido', async ({ page, request }) => {
  const variantId = await sembrarCarrito(page, 1);

  const cuerpo = {
    customer: { name: 'Reintento', email: `retry-${Date.now()}@e2e.test`, phone: '0981 123 456' },
    address: { street: 'Calle 1', city: 'Asunción' },
    paymentMethod: 'bank_transfer',
    lines: [{ variantId, quantity: 1 }],
    idempotencyKey: crypto.randomUUID(),
  };

  const primero = await request.post('/api/checkout', { data: cuerpo });
  const segundo = await request.post('/api/checkout', { data: cuerpo });

  const uno = (await primero.json()) as Respuesta['body'];
  const dos = (await segundo.json()) as Respuesta['body'];

  expect(primero.status()).toBe(201);
  expect(uno.order?.number).toBeGreaterThan(1000);
  expect(dos.order?.id, 'el reintento creó un pedido nuevo').toBe(uno.order?.id);
  expect(dos.order?.number).toBe(uno.order?.number);
});

test('el checkout revalida el stock y corrige el carrito', async ({ page, request }) => {
  const variantId = await sembrarCarrito(page, 500);

  // Por la UI: el checkout avisa y ajusta.
  await page.goto('/checkout');
  await expect(
    page.getByText(/ajustamos tu carrito|ya no tiene el stock|quitamos de tu carrito/i).first(),
  ).toBeVisible();

  // Y por la API, sin pasar por la pantalla: el pedido se rechaza.
  const respuesta = await request.post('/api/checkout', {
    data: {
      customer: {
        name: 'Sin stock',
        email: `nostock-${Date.now()}@e2e.test`,
        phone: '0981 123 456',
      },
      address: { street: 'Calle 1', city: 'Asunción' },
      paymentMethod: 'bank_transfer',
      lines: [{ variantId, quantity: 500 }],
      idempotencyKey: crypto.randomUUID(),
    },
  });

  expect(respuesta.status()).toBe(409);
  const cuerpo = (await respuesta.json()) as Respuesta['body'];
  expect(cuerpo.error).toBe('invalid_cart');
  expect(cuerpo.issues?.[0]?.type).toBe('insufficient_stock');
});

test('doble click en confirmar manda una sola petición', async ({ page }) => {
  await sembrarCarrito(page, 1);

  let peticiones = 0;
  page.on('request', (r) => {
    if (r.url().includes('/api/checkout') && r.method() === 'POST') peticiones += 1;
  });

  await page.goto('/checkout');
  await completarFormulario(page);

  const boton = page.getByRole('button', { name: /confirmar pedido/i });
  await boton.click({ clickCount: 2, delay: 10 });

  await expect(page).toHaveURL(/\/checkout\/confirmacion/);
  expect(peticiones, 'el doble click creó dos peticiones').toBe(1);
});

test('el checkout sin JavaScript explica por qué y ofrece salida', async ({ browser }) => {
  const contexto = await browser.newContext({ javaScriptEnabled: false });
  const pagina = await contexto.newPage();

  await pagina.goto('/checkout');
  await expect(pagina.getByText(/hace falta javascript/i)).toBeVisible();
  await expect(pagina.getByRole('link', { name: /ver tu carrito/i })).toBeVisible();

  await contexto.close();
});
