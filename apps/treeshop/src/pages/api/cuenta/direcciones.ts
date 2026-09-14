import type { APIRoute } from 'astro';
import { borrarDireccion, guardarDireccion } from '../../../lib/cuenta.ts';
import { hayCuentas } from '../../../lib/db.ts';
import { tokenDelComprador } from '../../../lib/sesion.ts';

export const prerender = false;

/**
 * Guarda o borra una dirección de la cuenta.
 *
 * **Recibe un formulario y contesta una redirección**, no JSON: la página de
 * direcciones no tiene una línea de JavaScript, y no la necesita. Dos campos y
 * un botón de borrar no justifican una island.
 *
 * Sin rate limit propio. Escribe, pero sólo sobre la cuenta de quien ya tiene
 * una sesión válida y sólo en su propia fila —lo garantiza el `with check` de la
 * política, no este código—: no es una superficie que un extraño pueda tocar.
 */
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  if (!(await hayCuentas())) return new Response(null, { status: 404 });

  const token = await tokenDelComprador(cookies);
  if (!token) return redirect('/cuenta', 303);

  const volver = (aviso: string) => redirect(`/cuenta/direcciones?aviso=${aviso}`, 303);

  try {
    const form = await request.formData();
    const texto = (campo: string, tope: number): string =>
      String(form.get(campo) ?? '')
        .trim()
        .slice(0, tope);

    if (form.get('accion') === 'borrar') {
      const id = texto('id', 64);
      if (!id) return volver('error');
      await borrarDireccion(token, id);
      return volver('borrada');
    }

    const street = texto('street', 200);
    const city = texto('city', 120);
    if (!street || !city) return volver('error');

    const zone = texto('zone', 120);
    const reference = texto('reference', 200);
    const label = texto('label', 60);

    await guardarDireccion(token, {
      label: label || null,
      // Las opcionales se omiten en vez de ir vacías: es la misma forma que
      // guarda `create_order` y la que lee el envío por zona (ADR-114). Una
      // `zone: ''` no es una zona, es ruido que después hay que filtrar.
      address: { street, city, ...(zone ? { zone } : {}), ...(reference ? { reference } : {}) },
      porDefecto: form.get('porDefecto') === '1',
    });

    return volver('guardada');
  } catch (error) {
    // El mensaje del adapter no sale de acá: nombra tablas y restricciones.
    console.error('[cuenta-direcciones]', error);
    return volver('error');
  }
};
