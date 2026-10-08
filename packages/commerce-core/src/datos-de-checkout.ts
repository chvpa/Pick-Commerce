import type { OrderAddress, OrderCustomer } from '@pick/commerce-types';

/**
 * Los datos de quien compra: validarlos, y su teléfono.
 *
 * Vivía en `checkout.ts` junto a las cuentas del carrito, y esa vecindad costaba:
 * el carrito está en todas las páginas, y el bundler junta en un mismo chunk lo
 * que sale del mismo módulo, así que cada página descargaba la validación del
 * formulario de checkout para sumar dos líneas. Separados, la validación viaja
 * sólo con el formulario (ADR-152).
 *
 * Corre en el island y en el endpoint, igual que antes: que corra en los dos es el
 * punto, porque el servidor no puede confiar en que el browser validó.
 */

// ---------------------------------------------------------------------------
// Datos del checkout
// ---------------------------------------------------------------------------

/**
 * Un teléfono como lo escribe la gente, llevado a su forma local: `0981123456`.
 *
 * Paraguay: 10 dígitos con el 0 inicial. Se aceptan espacios, guiones y
 * paréntesis, y el prefijo +595, porque así es como la gente escribe su número.
 * `null` si no tiene esa forma.
 */
export function telefonoLocal(telefono: string): string | null {
  const local = telefono.replace(/[\s()-]/g, '').replace(/^\+?595/, '0');
  return /^0\d{8,9}$/.test(local) ? local : null;
}

/**
 * El enlace que abre una conversación de WhatsApp con el cliente.
 *
 * El mensaje lo manda la persona desde su teléfono, no la tienda: no hay API de
 * por medio (ADR-143). `wa.me` pide el número internacional sin `+` ni ceros,
 * así que el 0 local pasa a 595. `null` si el teléfono no sirve.
 */
export function enlaceDeWhatsApp(telefono: string, mensaje?: string): string | null {
  const local = telefonoLocal(telefono);
  if (!local) return null;
  const numero = `595${local.slice(1)}`;
  return mensaje
    ? `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`
    : `https://wa.me/${numero}`;
}

/** Cómo se nombra cada forma de pago. Las que no están, por su clave. */
export const ETIQUETA_METODO_DE_PAGO: Readonly<Record<string, string>> = {
  bank_transfer: 'Transferencia bancaria',
  bancard: 'Tarjeta (Bancard)',
  simulated_card: 'Tarjeta (pago de prueba)',
};

export interface DatosDeCheckout {
  readonly customer: OrderCustomer;
  readonly address: OrderAddress;
  readonly paymentMethod: string;
  readonly notes?: string;
}

/**
 * Valida lo que la persona escribió.
 *
 * Sin Zod a propósito: el core no tiene dependencias de runtime (ADR-029), y
 * este mismo módulo corre en el island y en el endpoint. Que corra en los dos es
 * el punto — el servidor no puede confiar en que el browser validó.
 *
 * Los mensajes son los que ve el comprador, así que están en español y dicen qué
 * hacer, no qué falló.
 */
export function validarDatosDeCheckout(entrada: unknown): {
  readonly datos?: DatosDeCheckout;
  readonly errores: Readonly<Record<string, string>>;
} {
  const errores: Record<string, string> = {};
  const bruto = (entrada ?? {}) as Record<string, unknown>;
  const cliente = (bruto.customer ?? {}) as Record<string, unknown>;
  const direccion = (bruto.address ?? {}) as Record<string, unknown>;

  const texto = (valor: unknown): string => (typeof valor === 'string' ? valor.trim() : '');

  const name = texto(cliente.name);
  const email = texto(cliente.email).toLowerCase();
  const phone = texto(cliente.phone);
  const street = texto(direccion.street);
  const city = texto(direccion.city);
  const paymentMethod = texto(bruto.paymentMethod);

  if (name.length < 2) errores.name = 'Escribí tu nombre y apellido.';

  // Deliberadamente laxa: exige la forma mínima de un email y nada más. Una
  // expresión estricta rechaza direcciones válidas, y quien se equivoca de mail
  // no se entera igual —lo que confirma una dirección es un mensaje que llega—.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errores.email = 'Revisá el correo.';

  const telefono = telefonoLocal(phone);
  if (!telefono) errores.phone = 'Revisá el teléfono, por ejemplo 0981 123 456.';

  if (street.length < 4) errores.street = 'Escribí la dirección de entrega.';
  if (city.length < 2) errores.city = 'Escribí la ciudad.';
  if (!paymentMethod) errores.paymentMethod = 'Elegí una forma de pago.';

  if (Object.keys(errores).length > 0 || !telefono) return { errores };

  const taxId = texto(cliente.taxId);
  const taxName = texto(cliente.taxName);
  const reference = texto(direccion.reference);
  // La zona se valida contra la tabla de la tienda en el servidor, que es
  // quien la conoce; acá sólo se limpia y se deja pasar.
  const zone = texto(direccion.zone);
  const notes = texto(bruto.notes);

  return {
    errores,
    datos: {
      // Los opcionales se omiten en vez de mandarse vacíos: la base guarda
      // ausencia, no cadena vacía (ADR-059).
      customer: {
        name,
        email,
        phone: telefono,
        ...(taxId ? { taxId } : {}),
        ...(taxName ? { taxName } : {}),
      },
      address: { street, city, ...(zone ? { zone } : {}), ...(reference ? { reference } : {}) },
      paymentMethod,
      ...(notes ? { notes } : {}),
    },
  };
}
