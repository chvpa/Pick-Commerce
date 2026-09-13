import type { APIRoute } from 'astro';
import { faltaParaLasCuentas, pedirCodigo } from '../../../lib/cuenta.ts';
import { drenarNotificaciones, proveedorDeCorreo } from '../../../lib/notificaciones.ts';
import { demasiadasPeticiones, dentroDelLimite } from '../../../lib/limite.ts';
import { cuerpoJson, falla, json } from '../_respuesta.ts';
import { EMAIL_VALIDO, emailRecibido } from './_email.ts';

export const prerender = false;

/**
 * Manda el código para entrar.
 *
 * **Responde lo mismo exista o no la cuenta**, y no es cortesía: hay un solo
 * proyecto de Supabase para todos los comercios, así que un `auth.users`
 * compartido. Una respuesta distinta para un email conocido dejaría preguntarle
 * a la tienda A si una persona compró en la B. Por eso el 200 es fijo y lo único
 * que puede fallar acá es la forma del email o el correo.
 *
 * **Drena la cola en esta misma petición.** El comprador está mirando la
 * pantalla esperando el código: hacerlo esperar al próximo visitante del sitio
 * —que es cómo sale el resto de los correos— convertiría un login en algo que
 * tarda minutos. Es lo que hacía ver a la cola como inviable para esto, y se
 * resuelve con un `await` en el único momento en que hay alguien esperando.
 */
export const POST: APIRoute = async ({ request }) => {
  if (!(await dentroDelLimite(request, 'CODIGO_LIMITE'))) return demasiadasPeticiones();

  const email = emailRecibido(await cuerpoJson(request));
  if (!EMAIL_VALIDO.test(email)) {
    return json({ error: 'bad_request', message: 'Revisá el correo.' }, 400);
  }

  // Sin correo no hay código y sin código no hay login: acá la degradación que
  // el resto del sistema se permite —el pedido se crea igual aunque el aviso no
  // salga— no existe. Es la consecuencia de ADR-123 y por eso se dice.
  const falta = faltaParaLasCuentas();
  if (falta || !proveedorDeCorreo()) {
    console.error(
      `[cuenta-codigo] las cuentas no están configuradas: falta ${falta ?? 'el correo'}`,
    );
    return json(
      { error: 'unavailable', message: 'Las cuentas no están disponibles en esta tienda.' },
      503,
    );
  }

  try {
    await pedirCodigo(email);
    // ponytail: drena la tanda entera (hasta 20), así que una cola atrasada le
    // cuesta latencia a quien pide el código. Si molesta, drenar sólo su fila.
    await drenarNotificaciones();
    return json({ ok: true });
  } catch (error) {
    return falla('cuenta-codigo', error);
  }
};
