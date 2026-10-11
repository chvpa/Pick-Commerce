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

/**
 * Si un documento es un RUC: termina en guion y dígito verificador
 * —`80012345-6`—. Una CI son sólo números. Es la regla del handoff (ADR-166), y
 * de ella depende que se pida la razón social.
 */
export function esRuc(documento: string): boolean {
  return /-\s*\d\s*$/.test(documento);
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

/** Con qué se le escribe a quien compra: lo que guarda la sesión del checkout (ADR-167). */
export interface Contacto {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
}

const texto = (valor: unknown): string => (typeof valor === 'string' ? valor.trim() : '');

/**
 * El nombre, el correo y el teléfono, con las mismas reglas del pedido.
 *
 * Existe aparte porque la sesión del checkout se guarda al pasar el primer paso,
 * antes de que haya dirección o forma de pago: validar el formulario entero no
 * daría nunca el contacto.
 */
export function validarContacto(entrada: unknown): {
  readonly contacto?: Contacto;
  readonly errores: Readonly<Record<string, string>>;
} {
  const errores: Record<string, string> = {};
  const cliente = (((entrada ?? {}) as Record<string, unknown>).customer ?? {}) as Record<
    string,
    unknown
  >;

  const name = texto(cliente.name);
  const email = texto(cliente.email).toLowerCase();

  if (name.length < 2) errores.name = 'Escribí tu nombre y apellido.';

  // Deliberadamente laxa: exige la forma mínima de un email y nada más. Una
  // expresión estricta rechaza direcciones válidas, y quien se equivoca de mail
  // no se entera igual —lo que confirma una dirección es un mensaje que llega—.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errores.email = 'Revisá el correo.';

  const phone = telefonoLocal(texto(cliente.phone));
  if (!phone) errores.phone = 'Revisá el teléfono, por ejemplo 0981 123 456.';

  if (Object.keys(errores).length > 0 || !phone) return { errores };
  return { errores, contacto: { name, email, phone } };
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
  const { contacto, errores: delContacto } = validarContacto(entrada);
  const errores: Record<string, string> = { ...delContacto };
  const bruto = (entrada ?? {}) as Record<string, unknown>;
  const cliente = (bruto.customer ?? {}) as Record<string, unknown>;
  const direccion = (bruto.address ?? {}) as Record<string, unknown>;

  const street = texto(direccion.street);
  const city = texto(direccion.city);
  const paymentMethod = texto(bruto.paymentMethod);

  /*
   * El documento es obligatorio, y con RUC también la razón social (ADR-166). Es
   * lo que el handoff pide en «Tus datos»: la factura la emite el comercio, fuera
   * del core, pero el dato lo junta el checkout, y uno que falta se descubre
   * recién al facturar.
   */
  const taxId = texto(cliente.taxId);
  const taxName = texto(cliente.taxName);
  if (!taxId) errores.taxId = 'Lo necesitamos para la factura.';
  else if (esRuc(taxId) && !taxName) errores.taxName = 'Falta la razón social.';

  if (street.length < 4) errores.street = 'Escribí la dirección de entrega.';
  if (city.length < 2) errores.city = 'Escribí la ciudad.';
  if (!paymentMethod) errores.paymentMethod = 'Elegí una forma de pago.';

  if (Object.keys(errores).length > 0 || !contacto) return { errores };

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
        ...contacto,
        taxId,
        // Sólo con RUC: con una CI no hay factura a nombre de nadie más.
        ...(esRuc(taxId) ? { taxName } : {}),
      },
      address: { street, city, ...(zone ? { zone } : {}), ...(reference ? { reference } : {}) },
      paymentMethod,
      ...(notes ? { notes } : {}),
    },
  };
}
