import { Link, useRouterState } from '@tanstack/react-router';
import {
  ChevronsUpDownIcon,
  LayoutDashboardIcon,
  LayoutTemplateIcon,
  LogOutIcon,
  PackageIcon,
  PercentIcon,
  ReceiptTextIcon,
  SettingsIcon,
  StoreIcon,
  UsersIcon,
  UsersRoundIcon,
} from 'lucide-react';
import type { Permission } from '@pick/commerce-types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { useSesion } from '@/features/auth/SesionContext';
import { usePuede } from '@/features/auth/usePuede';
import { useTienda } from '@/features/tienda/TiendaContext';

/**
 * La navegación del Admin.
 *
 * Tres bloques, que es lo que hace útil un sidebar frente a una barra: arriba
 * sobre qué tienda se trabaja, en el medio a dónde ir, abajo quién sos. Con seis
 * secciones la barra horizontal ya se quedaba corta, y la lista sólo va a crecer.
 *
 * Los enlaces de Equipo y Configuración aparecen según el permiso. Eso no
 * autoriza nada —quien fuerce la URL igual recibe el rechazo de la base
 * (ADR-052)— pero no tiene sentido ofrecerle a alguien una sección que no puede
 * abrir.
 */

interface Seccion {
  readonly to: string;
  readonly label: string;
  readonly icono: typeof PackageIcon;
  readonly permiso?: Permission;
}

const SECCIONES: readonly Seccion[] = [
  { to: '/', label: 'Resumen', icono: LayoutDashboardIcon },
  { to: '/productos', label: 'Productos', icono: PackageIcon },
  { to: '/pedidos', label: 'Pedidos', icono: ReceiptTextIcon },
  // Sin `permiso`: la lista se ve con sólo pertenecer a la organización, porque
  // saber qué campañas están corriendo es información operativa. Crear y editar
  // sí exigen `promotion.write`, y eso lo decide la ruta.
  { to: '/promociones', label: 'Promociones', icono: PercentIcon },
  // Banners, colecciones y categorías en una sola entrada con pestañas: son lo
  // mismo —lo que se cura para la vidriera— y con tres el sidebar pasaba a diez.
  { to: '/contenido', label: 'Contenido', icono: LayoutTemplateIcon },
  { to: '/clientes', label: 'Clientes', icono: UsersIcon },
  { to: '/equipo', label: 'Equipo', icono: UsersRoundIcon, permiso: 'member.manage' },
  { to: '/configuracion', label: 'Configuración', icono: SettingsIcon, permiso: 'settings.write' },
];

/** La sección activa. `/` sólo coincide consigo misma; el resto, por prefijo. */
function estaActiva(ruta: string, to: string): boolean {
  return to === '/' ? ruta === '/' : ruta === to || ruta.startsWith(`${to}/`);
}

function SelectorDeTienda() {
  const { tiendas, tienda, elegir } = useTienda();
  const { isMobile } = useSidebar();

  if (!tienda) return null;

  const marca = (
    <>
      <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
        <StoreIcon className="size-4" />
      </div>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{tienda.name}</span>
        <span className="text-muted-foreground truncate text-xs">Pick Admin</span>
      </div>
    </>
  );

  // Con una sola tienda no hay nada que elegir, y un menú de un ítem es ruido.
  if (tiendas.length <= 1) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" className="pointer-events-none">
            {marca}
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                aria-label="Cambiar de tienda"
                className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
              />
            }
          >
            {marca}
            <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-56"
            align="start"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            {/*
              El rótulo va DENTRO del grupo, no antes. `DropdownMenuLabel` es un
              `Menu.GroupLabel` de Base UI y fuera de un `Menu.Group` no se
              degrada: lanza al abrir el menú y se lleva la pantalla puesta.
              Adentro, además, el grupo queda con `role="group"` y su
              `aria-labelledby`, que es para lo que existe la pieza.
            */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-muted-foreground text-xs">
                Tiendas
              </DropdownMenuLabel>
              {tiendas.map((t) => (
                <DropdownMenuItem key={t.id} onClick={() => elegir(t.id)} className="gap-2 p-2">
                  <div className="flex size-6 items-center justify-center rounded-md border">
                    <StoreIcon className="size-3.5" />
                  </div>
                  <span className="truncate">{t.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function MenuDeUsuario() {
  const { sesion, salir } = useSesion();
  const { isMobile } = useSidebar();

  const correo = sesion?.email ?? '';
  const inicial = correo.slice(0, 1).toUpperCase() || '?';

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" className="aria-expanded:bg-sidebar-accent" />}
          >
            <div className="bg-muted text-foreground flex aspect-square size-8 items-center justify-center rounded-lg text-sm font-medium">
              {inicial}
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{correo}</span>
            </div>
            <ChevronsUpDownIcon className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-56"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            {/* Mismo motivo que en el selector de tienda: el rótulo va adentro. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
                {correo}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void salir()}>
                <LogOutIcon />
                Salir
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function AppSidebar() {
  const puede = usePuede();
  const ruta = useRouterState({ select: (s) => s.location.pathname });
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SelectorDeTienda />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {SECCIONES.filter((s) => !s.permiso || puede(s.permiso)).map((s) => (
                <SidebarMenuItem key={s.to}>
                  <SidebarMenuButton
                    isActive={estaActiva(ruta, s.to)}
                    tooltip={s.label}
                    /*
                     * En mobile el sidebar es un sheet modal: navegar sin
                     * cerrarlo deja la sección nueva tapada por el menú, y como
                     * el sheet marca el resto de la página `aria-hidden`, un
                     * lector de pantalla tampoco llega al contenido. En desktop
                     * no hay sheet y esto no hace nada.
                     */
                    onClick={() => setOpenMobile(false)}
                    render={<Link to={s.to} />}
                  >
                    <s.icono />
                    <span>{s.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <MenuDeUsuario />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

/** El título de la sección activa, para la cabecera. */
export function useTituloDeSeccion(): string {
  const ruta = useRouterState({ select: (s) => s.location.pathname });
  return SECCIONES.find((s) => estaActiva(ruta, s.to))?.label ?? 'Pick Admin';
}
