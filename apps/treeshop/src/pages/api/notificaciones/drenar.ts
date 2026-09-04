import type { APIRoute } from 'astro';
import { drenarNotificaciones, proveedorDeCorreo } from '../../../lib/notificaciones.ts';
import { falla, json } from '../_respuesta.ts';

export const prerender = false;

/**
 * Empuja la cola de correos de esta tienda.
 *
 * Existe para el Admin, que vive en otro dominio y no puede llamar a
 * `drenarNotificaciones()` como función. Cuando un operador marca un pedido como
 * enviado, el correo queda encolado; el middleware lo va a sacar con la próxima
 * visita a la tienda, pero una tienda con poco tráfico podría tardar horas.
 *
 * **Es un GET, y la razón no es pereza.** La comprobación de origen de Astro
 * rechaza todo POST de otro origen salvo que traiga un `content-type` que no sea
 * de formulario; y un `fetch` en modo `no-cors` —el único que no exige que el
 * storefront responda un preflight— sólo puede mandar justamente los tres
 * content-types que se consideran de formulario. O sea que **ningún POST desde
 * el browser del Admin puede pasar** sin montar CORS de verdad. Los métodos
 * seguros no pasan por esa comprobación.
 *
 * Que sea GET es defendible acá: no recibe parámetros, es idempotente, y su
 * único efecto es mandar correos que iban a salir igual. Un prefetch o un
 * crawler que lo toque adelanta un envío, nada más.
 *
 * **Sin autenticación, a propósito.** Sólo vacía la cola de la tienda de este
 * despliegue, cada fila se manda una vez y el contenido no se devuelve. Lo peor
 * que puede hacer un extraño es adelantar un envío. Lo que sí podría, con
 * insistencia y el proveedor caído, es quemar los cinco intentos de una fila:
 * está anotado, y si pasa, un secreto compartido es una línea de cada lado.
 */
export const GET: APIRoute = async () => {
  if (!proveedorDeCorreo()) {
    return json({ error: 'unavailable', message: 'El correo no está configurado.' }, 503);
  }

  try {
    const procesadas = await drenarNotificaciones();
    return json({ procesadas });
  } catch (error) {
    return falla('drenar-notificaciones', error);
  }
};
