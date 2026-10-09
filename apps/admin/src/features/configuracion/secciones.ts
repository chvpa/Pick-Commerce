import type { Permission } from '@pick/commerce-types';
import {
  BankIcon,
  DeliveryTruckIcon,
  EyeIcon,
  HourglassIcon,
  MoneyIcon,
  SparklesIcon,
  StoreIcon,
  SwitchIcon,
  UserCircleIcon,
  UserGroupIcon,
  UsersRoundIcon,
} from '@/components/iconos';

/**
 * Las secciones de Configuración, en los grupos del handoff (ADR-155).
 *
 * Una lista y no una pantalla larga: con ocho tarjetas una debajo de otra había
 * que leer todas para encontrar la que se vino a tocar, y cada una tenía su
 * propio «Guardar». Cada sección tiene su dirección, así que se puede enlazar
 * desde el Inicio o la paleta.
 *
 * Lo que el handoff agrupa acá y todavía no existe —el uso de la IA,
 * las conexiones— no aparece hasta que exista: una entrada que lleva
 * a «próximamente» es una promesa, no una sección.
 */
export const SECCIONES = [
  'cuenta',
  'pagos',
  'envio',
  'sucursales',
  'moneda',
  'catalogo',
  'cuentas',
  'ia',
  'demo',
  'equipo',
  'actividad',
] as const;

export type SeccionDeConfiguracion = (typeof SECCIONES)[number];

export interface Seccion {
  readonly id: SeccionDeConfiguracion;
  readonly titulo: string;
  readonly descripcion: string;
  readonly icono: (props: { className?: string }) => React.ReactNode;
  /** Sin permiso, la sección es de cualquiera que entra: «Mi cuenta». */
  readonly permiso?: Permission;
}

export const GRUPOS: readonly {
  readonly titulo: string;
  readonly secciones: readonly Seccion[];
}[] = [
  {
    titulo: 'Tu cuenta',
    secciones: [
      {
        id: 'cuenta',
        titulo: 'Mi cuenta',
        descripcion: 'Tus datos, tu contraseña y dónde tenés la cuenta abierta.',
        icono: UserCircleIcon,
      },
    ],
  },
  {
    titulo: 'Tienda',
    secciones: [
      {
        id: 'pagos',
        titulo: 'Medios de pago',
        descripcion: 'Con qué puede pagar quien compra, y qué le decís para que lo haga.',
        icono: BankIcon,
        permiso: 'settings.write',
      },
      {
        id: 'envio',
        titulo: 'Envío',
        descripcion: 'Cuánto se cobra por despachar, y desde qué monto no se cobra.',
        icono: DeliveryTruckIcon,
        permiso: 'settings.write',
      },
      {
        id: 'sucursales',
        titulo: 'Sucursales',
        descripcion:
          'Dónde está el stock. Con más de una, cargar mercadería pregunta a cuál entra.',
        icono: StoreIcon,
        permiso: 'settings.write',
      },
      {
        id: 'moneda',
        titulo: 'Moneda',
        descripcion: 'En qué se cobra y con qué tipo de cambio se muestran los precios.',
        icono: MoneyIcon,
        permiso: 'settings.write',
      },
    ],
  },
  {
    titulo: 'Catálogo y clientes',
    secciones: [
      {
        id: 'catalogo',
        titulo: 'Visibilidad del catálogo',
        descripcion: 'Qué productos se listan en la tienda.',
        icono: EyeIcon,
        permiso: 'settings.write',
      },
      {
        id: 'cuentas',
        titulo: 'Cuentas de comprador',
        descripcion: 'Si quien compra puede entrar y ver sus pedidos anteriores.',
        icono: UsersRoundIcon,
        permiso: 'settings.write',
      },
    ],
  },
  {
    titulo: 'Avanzado',
    secciones: [
      {
        id: 'ia',
        titulo: 'Inteligencia artificial',
        descripcion: 'Tu clave de OpenAI, para que el Admin pueda proponer fichas y fotos.',
        icono: SparklesIcon,
        permiso: 'settings.write',
      },
      {
        id: 'demo',
        titulo: 'Modo demostración',
        descripcion: 'Para mostrarle la tienda a alguien sin mandarle correos a nadie.',
        icono: SwitchIcon,
        permiso: 'settings.write',
      },
    ],
  },
  {
    titulo: 'Organización',
    secciones: [
      {
        id: 'equipo',
        titulo: 'Equipo',
        descripcion: 'Quién entra al Admin y qué puede hacer.',
        icono: UserGroupIcon,
        permiso: 'member.manage',
      },
      {
        id: 'actividad',
        titulo: 'Registro de actividad',
        descripcion: 'Quién cambió qué y cuándo, en todo el Admin.',
        icono: HourglassIcon,
        permiso: 'member.manage',
      },
    ],
  },
];

export function seccionDe(id: SeccionDeConfiguracion): Seccion {
  return GRUPOS.flatMap((g) => g.secciones).find((s) => s.id === id)!;
}

export function esSeccion(valor: string): valor is SeccionDeConfiguracion {
  return (SECCIONES as readonly string[]).includes(valor);
}
