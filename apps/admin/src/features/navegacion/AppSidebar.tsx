import { Link, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { repositorioDashboard } from '@pick/adapter-supabase';
import type { TiendaResumen } from '@pick/commerce-core';
import type { Permission } from '@pick/commerce-types';
import {
  AnalyticsIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  DiscountIcon,
  GiftIcon,
  HomeIcon,
  InvoiceIcon,
  LayersIcon,
  LayoutIcon,
  NoteEditIcon,
  PackageIcon,
  RepeatIcon,
  ResenaIcon,
  SettingsIcon,
  TagIcon,
  UserGroupIcon,
} from '@/components/iconos';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { useAvisar } from '@/components/aviso';
import { usePuede } from '@/features/auth/usePuede';
import { useTienda } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { cn } from '@/lib/utils';

/**
 * La navegación del Admin, como la dibuja el handoff (ADR-143).
 *
 * Arriba la tienda sobre la que se trabaja, abajo las secciones en grupos que
 * siguen lo que hace un comercio: **vender**, el **catálogo**, los **clientes** y
 * la **tienda**. La cuenta de la persona dejó de vivir acá: está en la barra de
 * arriba, junto al buscador.
 *
 * Los enlaces aparecen según el permiso. Eso no autoriza nada —quien fuerce la
 * URL igual recibe el rechazo de la base (ADR-052)— pero no tiene sentido
 * ofrecerle a alguien una sección que no puede abrir.
 *
 * **Lo que el handoff no tiene y sigue acá**, hasta que su pantalla lo absorba:
 * «Sin foto» y «Stock quieto» pasan a ser pestañas de Productos, y
 * «Recurrencia» de Clientes, en la Fase 2 de v3; «Descripciones» va al
 * Asistente de la Fase 10. Mientras tanto se quedan en su grupo: sacarlas antes
 * dejaba esas pantallas sin camino de llegada.
 */

interface Entrada {
  readonly to: string;
  readonly label: string;
  readonly icono: typeof PackageIcon;
  readonly permiso?: Permission;
  /** Un contador a la derecha. Ver `useContadores`. */
  readonly contador?: 'pedidos' | 'resenas';
}

interface Grupo {
  readonly label?: string;
  readonly entradas: readonly Entrada[];
}

const GRUPOS: readonly Grupo[] = [
  { entradas: [{ to: '/', label: 'Inicio', icono: HomeIcon }] },
  {
    label: 'Vender',
    entradas: [
      { to: '/pedidos', label: 'Pedidos', icono: InvoiceIcon, contador: 'pedidos' },
      // Sin `permiso`: saber qué campañas corren es información operativa. Crear y
      // editar exigen `promotion.write`, y eso lo decide la ruta.
      { to: '/promociones', label: 'Promociones', icono: DiscountIcon },
      { to: '/analytics', label: 'Analytics', icono: AnalyticsIcon },
    ],
  },
  {
    label: 'Catálogo',
    entradas: [
      { to: '/productos', label: 'Productos', icono: PackageIcon },
      { to: '/productos/resenas', label: 'Reseñas', icono: ResenaIcon, contador: 'resenas' },
      /*
       * Leerlas y aprobarlas es trabajo de catálogo; pedirle a la IA que las
       * escriba gasta la clave, y eso lo decide la pantalla.
       */
      {
        to: '/productos/descripciones',
        label: 'Descripciones',
        icono: NoteEditIcon,
        permiso: 'catalog.write',
      },
    ],
  },
  {
    label: 'Clientes',
    entradas: [
      { to: '/clientes', label: 'Clientes', icono: UserGroupIcon },
      { to: '/clientes/recurrencia', label: 'Recurrencia', icono: RepeatIcon },
      { to: '/clientes/fidelidad', label: 'Fidelidad', icono: GiftIcon },
    ],
  },
  {
    label: 'Tienda',
    entradas: [
      { to: '/contenido/secciones', label: 'Secciones', icono: LayoutIcon },
      { to: '/contenido/colecciones', label: 'Colecciones', icono: LayersIcon },
      { to: '/contenido/categorias', label: 'Categorías', icono: TagIcon },
      {
        to: '/configuracion',
        label: 'Configuración',
        icono: SettingsIcon,
        permiso: 'settings.write',
      },
    ],
  },
];

/** La sección activa. `/` sólo coincide consigo misma; el resto, por prefijo. */
function estaActiva(ruta: string, to: string): boolean {
  return to === '/' ? ruta === '/' : ruta === to || ruta.startsWith(`${to}/`);
}

const TODAS = GRUPOS.flatMap((g) => g.entradas);

/**
 * Activa, salvo que una hermana más específica coincida: en
 * «/productos/resenas» la activa es Reseñas, no también Productos.
 */
function marcada(ruta: string, to: string): boolean {
  return (
    estaActiva(ruta, to) && !TODAS.some((o) => o.to.startsWith(`${to}/`) && estaActiva(ruta, o.to))
  );
}

/**
 * El color del cuadrado de una tienda.
 *
 * Sale del id y no se elige: hasta que la tienda tenga su color de marca
 * guardado (Fase 6 de v3), lo que importa es que dos tiendas se distingan de un
 * vistazo y que la misma tienda tenga siempre el mismo.
 */
const COLORES = ['#d42a30', '#3b5bdb', '#13774a', '#7c5cf0', '#c2410c', '#0e1525'] as const;

function colorDe(tienda: TiendaResumen): string {
  let h = 0;
  for (const c of tienda.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORES[h % COLORES.length]!;
}

function Cuadrado({ tienda, chico = false }: { tienda: TiendaResumen; chico?: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{ background: colorDe(tienda) }}
      className={cn(
        'flex shrink-0 items-center justify-center font-bold text-white',
        chico ? 'size-6 rounded-md text-[11.5px]' : 'size-[30px] rounded-lg text-sm',
      )}
    >
      {tienda.name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

function SelectorDeTienda() {
  const { tiendas, tienda, elegir } = useTienda();
  const { setOpenMobile } = useSidebar();
  const avisar = useAvisar();

  if (!tienda) return null;

  const marca = (
    <>
      <Cuadrado tienda={tienda} />
      <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
        <span className="text-foreground truncate text-sm font-semibold">{tienda.name}</span>
        {tienda.domain && (
          <span className="text-muted-foreground truncate text-xs font-normal">
            {tienda.domain}
          </span>
        )}
      </span>
    </>
  );

  // Con una sola tienda no hay nada que elegir, y un menú de un ítem es ruido.
  if (tiendas.length <= 1) {
    return <div className="flex items-center gap-2.5 rounded-[10px] p-1.5">{marca}</div>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Cambiar de tienda"
        className="hover:bg-sidebar-accent data-popup-open:bg-sidebar-accent focus-visible:ring-sidebar-ring flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] p-1.5 outline-none focus-visible:ring-2"
      >
        {marca}
        <ChevronsUpDownIcon className="text-ink-faint size-[15px] shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-(--anchor-width) min-w-56" align="start" sideOffset={6}>
        {/*
          El rótulo va DENTRO del grupo, no antes. `DropdownMenuLabel` es un
          `Menu.GroupLabel` de Base UI y fuera de un `Menu.Group` no se degrada:
          lanza al abrir el menú y se lleva la pantalla puesta.
        */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Tiendas</DropdownMenuLabel>
          {tiendas.map((t) => (
            <DropdownMenuItem
              key={t.id}
              onClick={() => {
                if (t.id === tienda.id) return;
                elegir(t.id);
                // En la hoja de mobile, igual que al navegar: se elige una tienda
                // para ver su contenido, y la hoja abierta lo tapaba.
                setOpenMobile(false);
                avisar(`Estás trabajando en ${t.name}`);
              }}
              className="py-1.5"
            >
              <Cuadrado tienda={t} chico />
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-[13.5px] font-medium">{t.name}</span>
                {t.domain && (
                  <span className="text-muted-foreground truncate text-[11.5px]">{t.domain}</span>
                )}
              </span>
              {t.id === tienda.id && <CheckIcon className="text-link size-[15px]" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Los números al lado de Pedidos y de Reseñas: lo que espera a alguien.
 *
 * Salen de la misma consulta que el «Para hacer» del Inicio
 * (`admin_store_tasks`), con la misma clave: el sidebar y el Inicio no pueden
 * contar distinto lo mismo. Las pantallas que cobran, despachan o moderan
 * invalidan `['tareas', tienda]`. Un contador que falla no se muestra: es una
 * ayuda, no algo por lo que valga la pena llenar el menú de errores.
 */
function useContadores(tienda: TiendaResumen | null): Record<'pedidos' | 'resenas', number> {
  const tareas = useQuery({
    queryKey: ['tareas', tienda?.id],
    queryFn: () => repositorioDashboard(db).tareas(tienda!.id),
    enabled: tienda !== null,
  });
  const t = tareas.data;
  return {
    pedidos: t ? t.porCobrar.n + t.paraPreparar.n : 0,
    resenas: t?.resenas.n ?? 0,
  };
}

export function AppSidebar() {
  const puede = usePuede();
  const ruta = useRouterState({ select: (s) => s.location.pathname });
  const { setOpenMobile } = useSidebar();
  const { tienda } = useTienda();
  const contadores = useContadores(tienda);

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="px-3 pt-3.5 pb-2.5">
        <SelectorDeTienda />
      </SidebarHeader>

      <SidebarContent className="gap-5 px-3 pt-1.5 pb-3">
        {GRUPOS.map((grupo, i) => {
          const visibles = grupo.entradas.filter((e) => !e.permiso || puede(e.permiso));
          if (visibles.length === 0) return null;
          return (
            <SidebarGroup key={grupo.label ?? i} className="p-0">
              {grupo.label && <SidebarGroupLabel>{grupo.label}</SidebarGroupLabel>}
              <SidebarMenu>
                {visibles.map((e) => {
                  const cuenta = e.contador ? contadores[e.contador] : 0;
                  return (
                    <SidebarMenuItem key={e.to}>
                      <SidebarMenuButton
                        isActive={marcada(ruta, e.to)}
                        /*
                         * En la hoja de mobile, navegar sin cerrarla deja la
                         * sección nueva tapada por el menú, y como la hoja marca
                         * el resto de la página `aria-hidden`, un lector de
                         * pantalla tampoco llega al contenido.
                         */
                        onClick={() => setOpenMobile(false)}
                        render={<Link to={e.to} />}
                      >
                        <e.icono />
                        <span>{e.label}</span>
                      </SidebarMenuButton>
                      {cuenta > 0 && (
                        <SidebarMenuBadge
                          aria-label={`${cuenta} pendientes`}
                          className={
                            e.contador === 'pedidos'
                              ? 'bg-link text-white'
                              : 'text-ink-2 bg-[#e6e8ee]'
                          }
                        >
                          {cuenta > 99 ? '99+' : cuenta}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}
