import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { ADMIN, entrar, vigilar } from './_admin.ts';

/**
 * Pedidos por bandeja y en lote (ADR-146), y el detalle con su próxima acción
 * (ADR-147).
 *
 * Qué cae en cada pestaña lo prueba `supabase/tests/pedidos-por-bandeja.test.ts`.
 * Esto prueba lo que ese test no ve: que la pestaña está en la URL, que elegir
 * varios y marcarlos pasa por la sesión del Admin, y que un pedido que se cobra
 * se va de «Por cobrar» y aparece en «Para preparar».
 *
 * Los pedidos se crean por el checkout de la demo, con un correo `@e2e.test`
 * que el teardown borra, y se encuentran por un sello que sólo tienen ellos: la
 * tienda de la demo tiene otros pedidos y no se puede contar con cuántos.
 */

/*
 * La mochila y no la zapatilla, como `pago-simulado.spec.ts`: el checkout y
 * Treeshop compran la zapatilla —doce unidades—, desktop y mobile comparten base
 * dentro de una corrida, y estos tests crean cinco pedidos por proyecto. Con la
 * zapatilla, el mobile del checkout fallaba por falta de stock.
 */
const HANDLE = 'mochila-tecnica';

async function crearPedidos(
  page: Page,
  request: APIRequestContext,
  sello: string,
  cuantos: number,
): Promise<number[]> {
  // El id de la variante, del mismo lugar que lo saca `checkout.spec.ts`.
  await page.goto(`/productos/${HANDLE}/`);
  const html = await page.content();
  const variantId = html.match(/&quot;id&quot;:\[0,&quot;([0-9a-f-]{36})&quot;/)?.[1];
  expect(variantId, 'no se encontró el id de variante en el PDP').toBeTruthy();

  const numeros: number[] = [];
  for (let i = 0; i < cuantos; i += 1) {
    const respuesta = await request.post('/api/checkout', {
      data: {
        customer: {
          name: `Lote ${sello}`,
          email: `lote-${sello}-${i}@e2e.test`,
          phone: '0981 123 456',
        },
        address: { street: 'Calle 1', city: 'Asunción' },
        paymentMethod: 'bank_transfer',
        lines: [{ variantId, quantity: 1 }],
        idempotencyKey: crypto.randomUUID(),
      },
    });
    expect(respuesta.status()).toBe(201);
    numeros.push(((await respuesta.json()) as { order: { number: number } }).order.number);
  }
  return numeros;
}

/** Abre una pestaña de Pedidos con la búsqueda puesta. */
async function abrirBandeja(page: Page, tab: string, sello: string): Promise<void> {
  await page.goto(`${ADMIN}/pedidos?tab=${tab}`);
  await page.getByRole('searchbox', { name: 'Buscar pedidos', exact: true }).fill(sello);
}

test('elegir varios los marca pagados y los pasa a preparación de una vez', async ({
  page,
  request,
}) => {
  const sello = String(Date.now());
  const numeros = await crearPedidos(page, request, sello, 2);

  const problemas = vigilar(page);
  await entrar(page);
  await abrirBandeja(page, 'cobrar', sello);

  const filas = page.getByRole('listitem').filter({ hasText: `Lote ${sello}` });
  /*
   * Todas las filas de la lista, no sólo las del sello: las dos también están en
   * la lista sin filtrar, y elegir todos antes de que la búsqueda se aplique
   * —espera 300 ms— elegía los pedidos de otros.
   */
  const casillas = page.getByRole('checkbox', { name: /^Elegir el pedido #/ });
  await expect(casillas).toHaveCount(2, { timeout: 15_000 });
  await expect(filas.getByText('Sin cobrar')).toHaveCount(2);

  await page.getByRole('checkbox', { name: 'Elegir todos los pedidos de esta página' }).click();
  const barra = page.getByRole('toolbar', { name: 'Acciones sobre los pedidos elegidos' });
  await expect(barra).toContainText('2 elegidos');
  // «Pagados» en el teléfono, «Marcar pagados» en la computadora.
  await barra.getByRole('button', { name: /pagados$/i }).click();

  await expect(page.getByText('2 pedidos quedaron pagados')).toBeVisible();
  // Cobrados, ya no son de esta pestaña.
  await expect(page.getByText('Ningún pedido coincide')).toBeVisible();
  await expect(barra).toHaveCount(0);

  // La búsqueda sobrevive al cambio de pestaña, y la pestaña queda en la URL.
  await page.getByRole('link', { name: /^Para preparar/ }).click();
  await expect(page).toHaveURL(/tab=preparar/);
  await expect(casillas).toHaveCount(2);
  await expect(filas).toHaveCount(2);
  await expect(filas.getByText('Sin cobrar')).toHaveCount(0);

  await page.getByRole('checkbox', { name: 'Elegir todos los pedidos de esta página' }).click();
  await barra.getByRole('button', { name: /^(Preparar|Pasar a En preparación)$/ }).click();
  await expect(page.getByText('2 pedidos pasaron a En preparación')).toBeVisible();
  // Siguen en «Para preparar»: preparando también es de esa cola.
  for (const n of numeros) {
    await expect(filas.filter({ hasText: `#${n}` })).toContainText('En preparación');
  }

  expect(problemas).toEqual([]);
});

test('el estado y el pago se cambian desde la fila', async ({ page, request, isMobile }) => {
  // En el teléfono la fila muestra el estado y no el menú: se cambia en lote o
  // desde el detalle.
  test.skip(isMobile, 'el menú de estado de la fila es de escritorio');

  const sello = String(Date.now());
  const [numero] = await crearPedidos(page, request, sello, 1);

  const problemas = vigilar(page);
  await entrar(page);
  await abrirBandeja(page, 'cobrar', sello);

  const estado = page.getByRole('button', { name: new RegExp(`^Estado del pedido #${numero}`) });
  await estado.click();
  await page.getByRole('menuitem', { name: 'Marcar como pagado' }).click();
  await expect(page.getByText(`#${numero} quedó pagado`)).toBeVisible();
  await expect(page.getByText('Ningún pedido coincide')).toBeVisible();

  await abrirBandeja(page, 'preparar', sello);
  await estado.click();
  await page.getByRole('menuitem', { name: 'Enviado' }).click();
  await expect(page.getByText(`#${numero} pasó a Enviado`)).toBeVisible();

  // Enviado ya no es para preparar: está en camino.
  await expect(page.getByText('Ningún pedido coincide')).toBeVisible();
  await page.getByRole('link', { name: /^En camino/ }).click();
  await expect(estado).toContainText('Enviado');

  expect(problemas).toEqual([]);
});

test('el detalle lleva el pedido de a un paso, guarda notas y pasa al siguiente', async ({
  page,
  request,
}) => {
  const sello = String(Date.now());
  // Dos, para que haya un siguiente: la lista los muestra del más nuevo al más viejo.
  const [primero, segundo] = await crearPedidos(page, request, sello, 2);

  const problemas = vigilar(page);
  await entrar(page);
  await abrirBandeja(page, 'cobrar', sello);
  await expect(page.getByRole('checkbox', { name: /^Elegir el pedido #/ })).toHaveCount(2, {
    timeout: 15_000,
  });
  await page
    .getByRole('link', { name: `Lote ${sello}` })
    .first()
    .click();

  await expect(page.getByRole('heading', { name: `#${segundo}` })).toBeVisible();
  await expect(page.getByText('Esperando la transferencia')).toBeVisible();
  // WhatsApp al número internacional, con el saludo armado.
  await expect(
    page.getByRole('link', { name: 'Escribirle a Lote ' + sello + ' por WhatsApp' }),
  ).toHaveAttribute('href', /^https:\/\/wa\.me\/595981123456\?text=Hola%20Lote/);

  // Cobrar, y después un paso por vez.
  await page.getByRole('button', { name: 'Marcar como pagado' }).click();
  await expect(page.getByText(`#${segundo} quedó pagado`)).toBeVisible();
  await expect(page.getByText('Este paso no le escribe al cliente.')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar pedido' }).click();
  await expect(page.getByText(`#${segundo} pasó a Confirmado`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Empezar a preparar' })).toBeVisible();
  await expect(page.getByText('Confirmado · paso 2 de 6')).toBeVisible();

  // El registro anotó los dos pasos, y la franja los muestra sin recargar (ADR-159).
  await page.getByRole('button', { name: /^Ver cambios/ }).click();
  const cambios = page.getByRole('dialog', { name: 'Historial de cambios' });
  await expect(cambios).toContainText('cambió el pago');
  await expect(cambios).toContainText('cambió el estado');
  await page.keyboard.press('Escape');
  await expect(cambios).toBeHidden();

  // Una nota suelta, sin cambiar nada del pedido.
  await page.getByRole('button', { name: /^Ver historial/ }).click();
  const nota = page.getByRole('textbox', { name: 'Agregar una nota al pedido' });
  await nota.fill('Retira el sábado por la tarde');
  await nota.press('Enter');
  await expect(page.getByText('Nota agregada')).toBeVisible();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Retira el sábado por la tarde' }),
  ).toBeVisible();
  await expect(nota).toHaveValue('');

  // El siguiente de la página que se estaba mirando, sin volver a la lista.
  await expect(page.getByRole('button', { name: 'Pedido anterior' })).toBeDisabled();
  await page.getByRole('link', { name: 'Pedido siguiente' }).click();
  await expect(page.getByRole('heading', { name: `#${primero}` })).toBeVisible();
  // El historial abierto era del anterior: este arranca plegado.
  await expect(page.getByRole('button', { name: /^Ver historial/ })).toBeVisible();

  expect(problemas).toEqual([]);
});
