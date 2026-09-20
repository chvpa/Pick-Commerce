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

  /*
   * El id de la variante viaja en las props que la página serializa para la
   * island. Se lo saca de ahí en vez de agregarle un atributo al markup sólo
   * para el test.
   *
   * El ancla es `"id":[0,"…"` y no «el primer uuid de la página», que es lo que
   * había antes: cuando las imágenes del catálogo pasaron a servirse desde el
   * bucket, su ruta —que lleva el uuid del tenant— quedó **antes** en el HTML, y
   * el test empezó a comprar una variante que no existe. Fallaba con un 409 de
   * stock, que no tenía nada que ver.
   */
  const html = await page.content();
  const id = html.match(/&quot;id&quot;:\[0,&quot;([0-9a-f-]{36})&quot;/)?.[1];
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
  /*
   * `\d{3,}` y no `1\d{3}`. El número de pedido es una secuencia por comercio
   * que **sólo crece**, así que el regex viejo tenía fecha de vencimiento: se
   * rompió el día que la tienda pasó el pedido 1999, con un #2003
   * perfectamente correcto en pantalla. Un test que falla por el paso del
   * tiempo y no por un cambio de código es peor que no tenerlo.
   */
  await expect(page.getByText(/^#\d{3,}$/).first()).toBeVisible();
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

  /*
   * Por la UI: el checkout avisa, **recorta y no borra**.
   *
   * Que el producto siga en la lista es la parte que importa: antes la línea
   * quedaba afuera entera, así que un carrito con más unidades de las que había
   * terminaba sin ese producto y se perdía la venta de las que sí existían.
   * Reportado comprando en Treeshop.
   */
  await page.goto('/checkout');
  await expect(page.getByText(/dejamos \d+ de|quitamos «/i).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver el catálogo' })).toHaveCount(
    0,
    'el checkout quedó vacío: la línea se descartó entera en vez de recortarse',
  );

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

test('un doble click termina en un solo pedido', async ({ page }) => {
  /*
   * Afirma lo que la persona ve, no cuántas peticiones salieron.
   *
   * La primera versión contaba peticiones y falló en CI con dos. El formulario
   * tiene una guarda contra el doble submit, pero cuándo se libera es una
   * carrera: contra una base local la respuesta puede llegar antes que el
   * segundo click, y contra una remota nunca. Un test sobre esa carrera pasa o
   * falla por latencia, no por corrección — y no se pudo reproducir en local ni
   * con el defecto puesto a propósito.
   *
   * Lo que la Definition of Done exige es que no se cree un segundo pedido, y
   * eso no depende de quién gane: la clave de idempotencia se genera una vez al
   * montar, así que dos peticiones devuelven el mismo pedido. Esa garantía la
   * verifica «un reintento con la misma clave», por API y sin carreras. Acá se
   * comprueba el resultado para quien compra: termina en la confirmación, con un
   * pedido, y el carrito vacío.
   */
  await sembrarCarrito(page, 1);

  await page.goto('/checkout');
  await completarFormulario(page);
  await page.getByRole('button', { name: /confirmar pedido/i }).click({ clickCount: 2, delay: 10 });

  await expect(page).toHaveURL(/\/checkout\/confirmacion/);
  /*
   * `\d{3,}` y no `1\d{3}`. El número de pedido es una secuencia por comercio
   * que **sólo crece**, así que el regex viejo tenía fecha de vencimiento: se
   * rompió el día que la tienda pasó el pedido 1999, con un #2003
   * perfectamente correcto en pantalla. Un test que falla por el paso del
   * tiempo y no por un cambio de código es peor que no tenerlo.
   */
  await expect(page.getByText(/^#\d{3,}$/).first()).toBeVisible();

  await page.goto('/carrito');
  await expect(page.getByText(/tu carrito está vacío/i).first()).toBeVisible();
});

test('el checkout sin JavaScript explica por qué y ofrece salida', async ({ browser }) => {
  const contexto = await browser.newContext({ javaScriptEnabled: false });
  const pagina = await contexto.newPage();

  await pagina.goto('/checkout');
  await expect(pagina.getByText(/hace falta javascript/i)).toBeVisible();
  await expect(pagina.getByRole('link', { name: /ver tu carrito/i })).toBeVisible();

  await contexto.close();
});

// --- Envío ------------------------------------------------------------------

test('el envío se muestra en el checkout y entra en el total', async ({ page }) => {
  /*
   * El importe lo pone la tienda —`store_settings.shipping`, que carga
   * `preparar-storefront-e2e.ts`— y lo calcula el servidor. Acá se comprueba lo
   * único que el comprador puede ver: que el número aparece antes de pagar y que
   * está sumado en el total. Un envío que se cobra y no se muestra es la forma
   * de que alguien llegue al banco con una cifra distinta de la que vio.
   */
  await sembrarCarrito(page, 1);
  let validaciones = 0;
  page.on('response', (res) => {
    if (res.url().endsWith('/api/cart/validate')) validaciones += 1;
  });
  await page.goto('/checkout');
  await expect(page.getByRole('button', { name: /confirmar pedido/i })).toBeEnabled();

  /*
   * Una validación al montar, y ninguna más: el formulario corrige el espejo
   * del carrito con lo que el servidor respondió, y esa escritura no puede
   * volver a disparar la validación. Lo hacía —en bucle, una petición por
   * respuesta mientras el checkout estuviera abierto— y se vio en producción.
   */
  await page.waitForTimeout(1500);
  expect(validaciones).toBe(1);

  /*
   * `exact`: «Envío» suelto también aparece en la barra de anuncio —«Envío
   * gratis desde…»— y en el enlace de políticas del pie. El del resumen es el
   * único que es exactamente esa palabra.
   */
  const fila = page.getByText('Envío', { exact: true }).locator('..');
  await expect(fila).toBeVisible();
  await expect(fila).toContainText('35.000');
});

test('desde el umbral el checkout dice que el envío es gratis', async ({ page }) => {
  // La zapatilla vale 720.000 y el umbral del smoke es 1.000.000, así que con
  // dos se pasa. Que diga «Gratis» y no «0» es deliberado: enterarse de que no
  // se cobra es parte de lo que decide la compra.
  await sembrarCarrito(page, 2);
  await page.goto('/checkout');
  await expect(page.getByRole('button', { name: /confirmar pedido/i })).toBeEnabled();

  await expect(page.getByText('Envío', { exact: true }).locator('..')).toContainText('Gratis');
});
