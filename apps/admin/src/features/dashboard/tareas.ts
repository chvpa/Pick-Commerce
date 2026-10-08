import type { PasosDeAlta, TareasDeLaTienda } from '@pick/commerce-core';
import type { Tono } from '@/components/ui/badge';

/**
 * Qué se le pide al comercio al entrar, y en qué orden.
 *
 * Vive aparte de la pantalla para poder probarlo: decidir qué tareas aparecen,
 * cuál va primero y cómo se dice cada una es la parte que puede equivocarse sin
 * que nada falle a la vista.
 *
 * El orden es el de la urgencia, como el handoff (ADR-143): primero lo que ya le
 * está fallando a un cliente —un aviso que no salió—, después la plata —pagos por
 * confirmar—, después lo que hay que despachar, y al final lo que mejora la
 * vitrina. Sólo aparece lo que tiene algo pendiente.
 */

export type IconoDeTarea = 'aviso' | 'cobrar' | 'preparar' | 'foto' | 'resena' | 'ia';

export interface Tarea {
  readonly clave: string;
  readonly tono: Tono;
  readonly icono: IconoDeTarea;
  readonly titulo: string;
  readonly detalle?: string;
  readonly accion: string;
  readonly to: string;
  readonly params?: Readonly<Record<string, string>>;
  /** La pestaña de la lista a la que lleva: `/pedidos?tab=cobrar`. */
  readonly search?: { readonly tab: 'cobrar' | 'preparar' };
}

function plural(n: number, uno: string, varios: string): string {
  return n === 1 ? uno : varios.replace('{n}', String(n));
}

/** «hace 5 días», «hace 3 horas», «ayer». En el idioma de la tienda. */
export function haceCuanto(desde: string, ahora: Date, locale: string): string {
  const minutos = Math.max(0, Math.round((ahora.getTime() - new Date(desde).getTime()) / 60_000));
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (minutos < 60) return rtf.format(-minutos, 'minute');
  if (minutos < 24 * 60) return rtf.format(-Math.round(minutos / 60), 'hour');
  return rtf.format(-Math.round(minutos / (24 * 60)), 'day');
}

export function listaDeTareas(
  t: TareasDeLaTienda,
  opciones: {
    readonly ahora: Date;
    readonly locale: string;
    /** Si ve las propuestas de la IA: revisarlas gasta y decide, como Configuración. */
    readonly veIA: boolean;
  },
): Tarea[] {
  const { ahora, locale, veIA } = opciones;
  const viejo = (desde: string | null) =>
    desde ? `El más viejo es de ${haceCuanto(desde, ahora, locale)}` : undefined;
  const tareas: Tarea[] = [];

  if (t.avisosFallidos.n > 0) {
    const { n, pedido } = t.avisosFallidos;
    const uno = n === 1 && pedido;
    tareas.push({
      clave: 'aviso',
      tono: 'red',
      icono: 'aviso',
      titulo: plural(
        n,
        'Un correo a un cliente no se pudo enviar',
        '{n} correos a clientes no se pudieron enviar',
      ),
      ...(pedido
        ? {
            detalle: `Pedido #${pedido.number}${
              pedido.customerName ? ` · ${pedido.customerName}` : ''
            } no recibió el aviso`,
          }
        : {}),
      accion: uno ? 'Ver pedido' : 'Ver pedidos',
      ...(uno ? { to: '/pedidos/$id', params: { id: pedido.id } } : { to: '/pedidos' }),
    });
  }

  if (t.porCobrar.n > 0) {
    const detalle = viejo(t.porCobrar.desde);
    tareas.push({
      clave: 'cobrar',
      tono: 'amber',
      icono: 'cobrar',
      titulo: plural(
        t.porCobrar.n,
        'Un pedido espera que confirmes el pago',
        '{n} pedidos esperan que confirmes el pago',
      ),
      ...(detalle ? { detalle } : {}),
      accion: 'Revisar pagos',
      to: '/pedidos',
      search: { tab: 'cobrar' },
    });
  }

  if (t.paraPreparar.n > 0) {
    const detalle = viejo(t.paraPreparar.desde);
    tareas.push({
      clave: 'preparar',
      tono: 'blue',
      icono: 'preparar',
      titulo: plural(
        t.paraPreparar.n,
        'Un pedido pago para preparar',
        '{n} pedidos pagos para preparar',
      ),
      ...(detalle ? { detalle } : {}),
      accion: 'Preparar',
      to: '/pedidos',
      search: { tab: 'preparar' },
    });
  }

  if (t.sinFoto.n > 0) {
    const { n, ocultos } = t.sinFoto;
    tareas.push({
      clave: 'foto',
      tono: 'gray',
      icono: 'foto',
      titulo: ocultos
        ? plural(
            n,
            'Un producto sin foto no se ve en la tienda',
            '{n} productos sin foto no se ven en la tienda',
          )
        : plural(n, 'Un producto se muestra sin foto', '{n} productos se muestran sin foto'),
      detalle: ocultos
        ? 'La tienda oculta lo que no tiene foto'
        : 'Se le puede sacar una desde el teléfono',
      accion: 'Fotografiar',
      to: '/productos/sin-foto',
    });
  }

  if (t.resenas.n > 0) {
    const { n, ultima } = t.resenas;
    tareas.push({
      clave: 'resena',
      tono: 'gray',
      icono: 'resena',
      titulo: plural(n, 'Una reseña espera moderación', '{n} reseñas esperan moderación'),
      ...(ultima
        ? {
            detalle: `La más reciente: ${ultima.producto} · ${plural(
              ultima.rating,
              '1 estrella',
              '{n} estrellas',
            )}`,
          }
        : {}),
      accion: 'Moderar',
      to: '/productos/resenas',
    });
  }

  if (veIA && t.propuestas.descripciones > 0) {
    tareas.push({
      clave: 'descripciones',
      tono: 'violet',
      icono: 'ia',
      titulo: plural(
        t.propuestas.descripciones,
        'Una descripción escrita por IA para revisar',
        '{n} descripciones escritas por IA para revisar',
      ),
      detalle: 'No se publica nada hasta que la apruebes',
      accion: 'Revisar',
      to: '/productos/descripciones',
    });
  }

  if (veIA && t.propuestas.fotos > 0) {
    tareas.push({
      clave: 'fotos',
      tono: 'violet',
      icono: 'ia',
      titulo: plural(
        t.propuestas.fotos,
        'Una foto con fondo limpio para revisar',
        '{n} fotos con fondo limpio para revisar',
      ),
      detalle: 'No se publica nada hasta que la apruebes',
      accion: 'Revisar',
      to: '/productos/fotos',
    });
  }

  return tareas;
}

export interface PasoDeAlta {
  readonly clave: keyof PasosDeAlta | 'tienda';
  readonly titulo: string;
  readonly detalle: string;
  readonly hecho: boolean;
  readonly accion: string;
  readonly to: string;
}

/**
 * Los pasos de una tienda nueva, leídos de lo que la tienda ya hizo.
 *
 * El handoff los dibuja como casillas que se tildan a mano; acá salen de los
 * datos, porque una casilla tildada a mano puede mentir y una tienda sin datos
 * de cobro no vende aunque alguien la haya marcado.
 */
export function pasosDeAlta(alta: PasosDeAlta): PasoDeAlta[] {
  return [
    {
      clave: 'tienda',
      titulo: 'Crear la tienda',
      detalle: 'Nombre, dominio y moneda',
      hecho: true,
      accion: 'Ver',
      to: '/configuracion',
    },
    {
      clave: 'productos',
      titulo: 'Cargar los primeros productos',
      detalle: 'Desde una planilla, con la cámara o uno por uno',
      hecho: alta.productos,
      accion: 'Cargar',
      to: '/productos/importar',
    },
    {
      clave: 'pagos',
      titulo: 'Elegir cómo te pagan',
      detalle: 'Los datos de la transferencia, o una pasarela',
      hecho: alta.pagos,
      accion: 'Configurar',
      to: '/configuracion',
    },
    {
      clave: 'envio',
      titulo: 'Definir el envío',
      detalle: 'Tarifa única, por zona, o sin cobrar',
      hecho: alta.envio,
      accion: 'Configurar',
      to: '/configuracion',
    },
    {
      clave: 'portada',
      titulo: 'Armar la portada',
      detalle: 'Banner, categorías y un carrusel de productos',
      hecho: alta.portada,
      accion: 'Armar',
      to: '/contenido/secciones',
    },
    {
      clave: 'equipo',
      titulo: 'Invitar a tu equipo',
      detalle: 'Quien despacha pedidos o carga el catálogo',
      hecho: alta.equipo,
      accion: 'Invitar',
      to: '/equipo',
    },
  ];
}

/** Nueva: sin un solo pedido y con algún paso pendiente. */
export function esTiendaNueva(t: TareasDeLaTienda): boolean {
  return t.pedidos === 0 && pasosDeAlta(t.alta).some((p) => !p.hecho);
}
