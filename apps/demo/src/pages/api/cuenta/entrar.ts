import type { APIRoute } from 'astro';
import { canjearCodigo, faltaParaLasCuentas, vincularCuenta } from '../../../lib/cuenta.ts';
import { demasiadasPeticiones, dentroDelLimite } from '../../../lib/limite.ts';
import { guardarSesion } from '../../../lib/sesion.ts';
import { cuerpoJson, falla, json } from '../_respuesta.ts';
import { EMAIL_VALIDO, emailRecibido } from './_email.ts';

export const prerender = false;

/**
 * Canjea el código por una sesión.
 *
 * El largo no se fija en 6: `mailer_otp_length` es configuración del proyecto de
 * Supabase y el día que cambie, un `\d{6}` acá rechazaría códigos buenos sin que
 * nada lo explique. Lo que valida el código es Supabase; esto sólo descarta lo
 * que no puede ser uno.
 */
const CODIGO_VALIDO = /^\d{4,12}$/;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!(await dentroDelLimite(request, 'ENTRAR_LIMITE'))) return demasiadasPeticiones();

  const cuerpo = await cuerpoJson(request);
  const email = emailRecibido(cuerpo);
  // Los espacios se sacan de adentro también: pegar «123 456» desde el correo es
  // lo más normal del mundo y rechazarlo sería inventarse un error.
  const codigo = String((cuerpo as { codigo?: unknown })?.codigo ?? '')
    .replace(/\s+/g, '')
    .slice(0, 12);

  if (!EMAIL_VALIDO.test(email) || !CODIGO_VALIDO.test(codigo)) {
    return json({ error: 'bad_request', message: 'Revisá el correo y el código.' }, 400);
  }

  const falta = faltaParaLasCuentas();
  if (falta) {
    console.error(`[cuenta-entrar] las cuentas no están configuradas: falta ${falta}`);
    return json(
      { error: 'unavailable', message: 'Las cuentas no están disponibles en esta tienda.' },
      503,
    );
  }

  try {
    const canje = await canjearCodigo(email, codigo);

    // Un código que no verifica y uno vencido dan la misma respuesta, que es
    // además la única que se puede dar: Supabase tampoco los distingue.
    if (!canje) {
      return json(
        { error: 'invalid_code', message: 'Ese código no es válido o ya venció. Pedí uno nuevo.' },
        401,
      );
    }

    /*
     * Acá y no antes: el vínculo con lo que compró como invitada exige el email
     * **verificado**, porque engancha la cuenta a la ficha de cliente que lleva
     * ese correo. Registrarse con el correo de otra persona le entregaría sus
     * pedidos. El que se pasa es el que devolvió Supabase, no el del formulario.
     */
    await vincularCuenta(canje.userId, canje.email);

    guardarSesion(cookies, canje.sesion);
    return json({ ok: true });
  } catch (error) {
    return falla('cuenta-entrar', error);
  }
};
