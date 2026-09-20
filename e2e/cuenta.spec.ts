import { existsSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { clienteDeBrowser, clienteDeServidor } from '@pick/adapter-supabase';

/**
 * La cuenta del comprador, en un navegador de verdad.
 *
 * **Lo que esta suite agrega y ninguna otra prueba puede dar**: que el HTML que
 * llega al browser diga lo que tiene que decir. El login por código y el
 * aislamiento entre compradores ya están medidos contra el proyecto real
 * —`pnpm rls:verificar` lo hace con JWTs firmados—, pero el checkout **no se
 * renderiza en el servidor**: su formulario aparece recién al hidratarse, porque
 * el carrito vive en `localStorage`. Así que «el correo de la sesión no se puede
 * editar» sólo se puede comprobar acá.
 *
 * La sesión se arma con el cliente de Supabase y se deja en la cookie, en vez de
 * pedir un código: el preview del e2e corre **sin** `RESEND_API_KEY` para no
 * mandarle correos a nadie, y sin proveedor de correo `/api/cuenta/codigo`
 * responde 503 a propósito (ADR-123). Ver `global-setup.ts`.
 */

if (existsSync('.env')) process.loadEnvFile('.env');

const url = process.env.SUPABASE_URL!;
const secretKey = process.env.SUPABASE_SECRET_KEY!;
const publishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;

/** La tienda de la demo, la misma que sirve el preview del 4321. */
const TIENDA = '5eed0000-0000-4000-8000-000000000002';

/** Marcador propio, como el `@rls.test` del verificador: se borra al terminar. */
const EMAIL = 'compradora@e2e.test';
const PASSWORD = 'e2e-cuenta-2026-Pick!';

const admin = clienteDeServidor({ url, secretKey });

let userId: string | undefined;
let pedidoId: string | undefined;
let pedidoNumero: number | undefined;
let tokens: { access: string; refresh: string } | undefined;

/** Deja la cookie de sesión como la deja `/api/cuenta/entrar`. */
async function conSesion(context: BrowserContext): Promise<void> {
  await context.addCookies([
    {
      name: 'pick_cuenta',
      /*
       * Codificada, como la escribe Astro. No es ceremonia: el valor es JSON y
       * lleva **comas**, que en la gramática de una cookie separan valores.
       * Puesta en crudo, el servidor recibe `pick_cuenta={"accessToken":"…"` y
       * lo que llega no es JSON. `cookies.set` de Astro codifica por defecto, así
       * que la cookie de verdad viaja escapada; esto la imita.
       */
      value: encodeURIComponent(
        JSON.stringify({ accessToken: tokens!.access, refreshToken: tokens!.refresh }),
      ),
      url: 'http://127.0.0.1:4321',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

test.beforeAll(async () => {
  await limpiar();

  const { data: creado } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  userId = creado?.user?.id;
  expect(userId, 'no se pudo crear la compradora de prueba').toBeTruthy();

  /*
   * Una compra como invitada, por el mismo camino que el checkout.
   *
   * La variante se elige **con stock**, y no es un detalle: la demo tiene una
   * remera agotada a propósito —para enseñar la insignia— y tomar «la primera»
   * caía justo ahí. `create_order` devolvía `issues` en vez de un pedido, y el
   * fallo se leía como «no se pudo crear el pedido de prueba», que no dice nada
   * de la causa.
   */
  const { data: variantes } = await admin
    .from('inventory_levels')
    .select('variant_id, available, product_variants!inner(products!inner(store_id))')
    .eq('product_variants.products.store_id', TIENDA)
    .gt('available', 1)
    .limit(1);

  const variantId = variantes?.[0]?.variant_id;
  expect(variantId, 'la tienda de la demo no tiene ninguna variante con stock').toBeTruthy();

  const { data: creadoPedido } = await admin.rpc('create_order', {
    p_store_id: TIENDA,
    p_idempotency_key: crypto.randomUUID(),
    p_input: {
      customer: { name: 'Compradora E2E', email: EMAIL, phone: '0981000000' },
      address: { street: 'Calle E2E', city: 'Asunción' },
      paymentMethod: 'bank_transfer',
      lines: [{ variantId, quantity: 1 }],
    } as never,
  });

  const pedido = (creadoPedido as { order?: { id: string; number: number } } | null)?.order;
  pedidoId = pedido?.id;
  pedidoNumero = pedido?.number;
  expect(pedidoId, 'no se pudo crear el pedido de prueba').toBeTruthy();

  await admin.rpc('link_customer_account', {
    p_store_id: TIENDA,
    p_user_id: userId!,
    p_email: EMAIL,
  });

  const sesion = clienteDeBrowser({ url, publishableKey });
  const { data: entrada } = await sesion.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  expect(entrada.session, 'no se pudo abrir la sesión de prueba').toBeTruthy();
  tokens = {
    access: entrada.session!.access_token,
    refresh: entrada.session!.refresh_token,
  };

  /*
   * **Sin `signOut()` acá.** Lo tenía por prolijidad y rompía toda la suite:
   * `signOut` revoca las sesiones del usuario del lado de Supabase, así que los
   * tokens que se acaban de guardar dejan de valer y el Worker ve a alguien sin
   * sesión. Se veía como «la página muestra el formulario de ingreso», que no se
   * parece en nada a la causa. El usuario se borra entero en `afterAll`.
   */
});

test.afterAll(async () => {
  await limpiar();
});

async function limpiar(): Promise<void> {
  const { data: cliente } = await admin
    .from('customers')
    .select('id')
    .eq('email', EMAIL)
    .maybeSingle();

  if (cliente?.id) {
    const { data: pedidos } = await admin.from('orders').select('id').eq('customer_id', cliente.id);
    for (const p of pedidos ?? []) {
      await admin.from('order_items').delete().eq('order_id', p.id);
      await admin.from('order_events').delete().eq('order_id', p.id);
      await admin.from('notification_outbox').delete().eq('order_id', p.id);
    }
    await admin.from('orders').delete().eq('customer_id', cliente.id);
    await admin.from('customer_addresses').delete().eq('customer_id', cliente.id);
    await admin.from('customer_accounts').delete().eq('customer_id', cliente.id);
    await admin.from('customers').delete().eq('id', cliente.id);
  }

  await admin.from('notification_outbox').delete().eq('recipient', EMAIL);

  const { data: usuarios } = await admin.auth.admin.listUsers();
  const existente = usuarios?.users.find((u) => u.email === EMAIL);
  if (existente) await admin.auth.admin.deleteUser(existente.id);
}

/**
 * Una unidad en el carrito, con el producto que ya usa `checkout.spec.ts`.
 *
 * Es necesario para ver el formulario: el carrito vive en `localStorage`, así
 * que con el carrito vacío la island del checkout dibuja su estado vacío y no
 * hay campo de correo que mirar.
 */
async function ponerAlgoEnElCarrito(page: Page): Promise<void> {
  await page.goto('/productos/zapatilla-urbana/');
  /*
   * Esperar la hidratación antes de tocar: el botón existe en el HTML del
   * servidor y el handler llega después, así que un click temprano no abre nada.
   * Es la misma espera que usa `navegacion.spec.ts`; acá faltaba y la corrida en
   * paralelo la ponía en rojo cada tanto.
   */
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await page.getByRole('button', { name: /agregar al carrito/i }).click();
  await expect(page.locator('dialog[open]')).toBeVisible();
}

test('sin sesión, /cuenta pide el correo y no muestra pedidos', async ({ page }) => {
  await page.goto('/cuenta');

  await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible();
  await expect(page.getByLabel('Tu correo')).toBeVisible();
  await expect(page.getByText(/Pedido #/)).toHaveCount(0);
});

test('pedir el código lleva al segundo paso sin decir si la cuenta existe', async ({ page }) => {
  await page.goto('/cuenta');

  /*
   * Sin `RESEND_API_KEY` la ruta contesta 503, así que acá no se puede llegar al
   * segundo paso de verdad. Lo que sí se comprueba —y es lo único que un
   * navegador aporta— es que el error se **muestra**: una island que falla en
   * silencio deja a la persona tocando un botón que no hace nada, y ese es el
   * modo de fallo que este repo persigue.
   */
  /*
   * Esperar a que la island hidrate antes de escribir. Sin esto, `fill` le gana a
   * la hidratación: el valor se pierde, el click no dispara nada y la prueba
   * falla diciendo que no hay alerta —vista una vez, con el campo vacío y la
   * página todavía en el primer paso—.
   */
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);

  await page.getByLabel('Tu correo').fill('alguien@ejemplo.test');
  await page.getByRole('button', { name: /mandarme el código/i }).click();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: /mandarme el código/i })).toBeEnabled();
});

test('con sesión se ven los pedidos propios y el detalle', async ({ page, context }) => {
  await conSesion(context);
  await page.goto('/cuenta');

  await expect(page.getByText(`Pedido #${pedidoNumero}`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible();

  await page.getByText(`Pedido #${pedidoNumero}`).click();
  await expect(page.getByRole('heading', { name: `Pedido #${pedidoNumero}` })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lo que pediste' })).toBeVisible();
  await expect(page.getByText('Calle E2E')).toBeVisible();
});

test('un pedido ajeno por id no se abre', async ({ page, context }) => {
  await conSesion(context);

  // Uno real de la misma tienda, que no es suyo. Es el caso que la numeración
  // secuencial volvía tentador y que RLS —no esta página— impide.
  const { data: ajeno } = await admin
    .from('orders')
    .select('id')
    .eq('store_id', TIENDA)
    .neq('id', pedidoId!)
    .limit(1)
    .maybeSingle();

  test.skip(!ajeno?.id, 'la tienda no tiene otro pedido con el que probar');

  const respuesta = await page.goto(`/cuenta/pedidos/${ajeno!.id}`);
  expect(respuesta?.status()).toBe(404);
});

test('una dirección guardada aparece y se puede borrar', async ({ page, context }) => {
  await conSesion(context);
  await page.goto('/cuenta/direcciones');

  await page.getByLabel('Nombre (opcional)').fill('Casa');
  await page.getByLabel('Dirección', { exact: true }).fill('Av. Siempreviva 742');
  await page.getByLabel('Ciudad').fill('Asunción');
  await page.getByRole('button', { name: /guardar dirección/i }).click();

  await expect(page.getByText('Dirección guardada.')).toBeVisible();
  await expect(page.getByText('Av. Siempreviva 742')).toBeVisible();

  await page.getByRole('button', { name: 'Borrar' }).click();
  await expect(page.getByText('Dirección borrada.')).toBeVisible();
  await expect(page.getByText('Av. Siempreviva 742')).toHaveCount(0);
});

test('el checkout con sesión trae el correo y no deja cambiarlo', async ({ page, context }) => {
  await conSesion(context);

  // El carrito vive en `localStorage`, así que hay que agregar algo para que el
  // formulario se dibuje: con el carrito vacío la island muestra su estado vacío.
  await ponerAlgoEnElCarrito(page);
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: /confirmá tu pedido/i })).toBeVisible();

  const correo = page.getByLabel('Correo');
  await expect(correo).toHaveValue(EMAIL);
  await expect(correo).toHaveAttribute('readonly', '');
  await expect(page.getByText(/para comprar con otro, salí de la cuenta/i)).toBeVisible();
});

test('sin sesión el checkout sigue siendo el de invitada', async ({ page }) => {
  await ponerAlgoEnElCarrito(page);
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: /confirmá tu pedido/i })).toBeVisible();

  const correo = page.getByLabel('Correo');
  await expect(correo).toHaveValue('');
  await expect(correo).not.toHaveAttribute('readonly', '');
});
