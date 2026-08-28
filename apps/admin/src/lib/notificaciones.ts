/**
 * Avisarle al storefront que hay correos por mandar.
 *
 * La cola de avisos vive en la base y la vacía el storefront, que es donde están
 * la clave de Resend y las plantillas. Cuando un operador marca un pedido como
 * enviado, el correo queda encolado y sin este empujón esperaría a la próxima
 * compra para salir.
 *
 * Es un GET y no un POST porque **ningún POST del browser podría llegar**: la
 * comprobación de origen de Astro rechaza los de otro origen salvo que traigan
 * un `content-type` que no sea de formulario, y `no-cors` —el único modo que no
 * exige preflight— sólo puede mandar justamente esos tres. Los métodos seguros
 * no pasan por esa comprobación. El endpoint no recibe parámetros y es
 * idempotente, así que no hay nada que un GET rompa.
 *
 * Fracasa en silencio a propósito: el cambio de estado ya se guardó. Que el
 * correo salga cinco minutos más tarde no es un error que valga interrumpirle la
 * tarea a nadie.
 */
export function avisarStorefront(dominio: string | undefined): void {
  if (!dominio) return;

  void fetch(`https://${dominio}/api/notificaciones/drenar`, {
    mode: 'no-cors',
    // Sobrevive a que la persona navegue a otra pantalla enseguida.
    keepalive: true,
  }).catch(() => {
    // Sin red, o el storefront caído. La cola sigue ahí para el próximo intento.
  });
}
