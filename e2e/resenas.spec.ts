import { expect, test } from '@playwright/test';

/**
 * Las reseñas en el PDP (ADR-140).
 *
 * Lo que este smoke cuida es el cableado y una regla de producto: **a quien no
 * compró no se le ofrece escribir**. El resto —quién puede reseñar qué, que el
 * texto no se edite, que el promedio no cuente las pendientes— lo prueba la suite
 * de PGlite con nueve casos, que es donde vive la regla.
 *
 * Sin sesión, que es el caso de cualquiera que llega: la sección existe, dice por
 * qué está vacía, y no hay formulario.
 */

const PRODUCTO = '/productos/campera-cortaviento';

test('la sección de reseñas se ve, y sin haber comprado no se ofrece escribir', async ({
  page,
}) => {
  const errores: string[] = [];
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('response', (r) => r.status() >= 400 && errores.push(`HTTP ${r.status()} ${r.url()}`));

  await page.goto(PRODUCTO);

  const seccion = page.locator('#resenas');
  await expect(seccion.getByRole('heading', { name: 'Reseñas' })).toBeVisible();

  // El promedio siempre se dice con palabras: cinco caracteres repetidos no son un
  // número para un lector de pantalla.
  await expect(seccion).toContainText(/Todavía no tiene reseñas|de 5, sobre/);

  // Y lo que no está: el formulario. Ofrecerlo a quien no compró termina en un
  // rechazo de la base, o sea en un error para alguien que no hizo nada mal.
  await expect(seccion.getByRole('button', { name: 'Publicar reseña' })).toHaveCount(0);

  expect(errores).toEqual([]);
});

test('un POST sin sesión vuelve al producto y lo dice, en vez de romperse', async ({ page }) => {
  await page.goto(PRODUCTO);

  /*
   * El formulario no está, así que se manda el POST a mano: es exactamente lo que
   * haría alguien curioso, y la respuesta tiene que ser una página y no un 500.
   * `fetch` desde la página para que viaje el mismo origen.
   */
  const destino = await page.evaluate(async (ruta) => {
    const cuerpo = new URLSearchParams({
      productId: '5eed0000-0000-4000-8000-000000000001',
      rating: '5',
      volverA: ruta,
    });
    const r = await fetch('/api/resenas', { method: 'POST', body: cuerpo });
    return r.url;
  }, PRODUCTO);

  expect(destino).toContain('resena=error');
});
