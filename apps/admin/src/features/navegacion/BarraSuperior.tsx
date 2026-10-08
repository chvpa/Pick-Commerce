import { Link } from '@tanstack/react-router';
import { ETIQUETA_ROL } from '@pick/commerce-core';
import {
  CheckIcon,
  ExternalLinkIcon,
  LogOutIcon,
  SearchIcon,
  SwitchIcon,
  UserCircleIcon,
  UserMultipleIcon,
} from '@/components/iconos';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { ATAJO } from '@/features/navegacion/Comandos';
import { useAvisar } from '@/components/aviso';
import { useSesion } from '@/features/auth/SesionContext';
import { usePuede } from '@/features/auth/usePuede';
import { useTienda } from '@/features/tienda/TiendaContext';

/**
 * La barra de arriba del handoff (ADR-143): el buscador, la tienda y la cuenta.
 *
 * Fija y translúcida, de 56 px. El título de cada pantalla **no** vive acá
 * —está en el contenido, con sus acciones—, así que la barra no crece con migas
 * ni con botones de la sección.
 *
 * Lo que el handoff dibuja y todavía no tiene de dónde salir queda afuera, en
 * vez de mostrarse vacío: las notificaciones, la ayuda y el anillo de uso de IA
 * alrededor del avatar llegan con su fase (ADR-143).
 */

export function BarraSuperior({ onBuscar }: { onBuscar: () => void }) {
  const { isMobile } = useSidebar();
  const { tienda } = useTienda();

  return (
    <header
      data-slot="barra-superior"
      className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-[#eef0f3] bg-white/90 px-3 backdrop-blur-[10px] min-[900px]:px-6"
    >
      {isMobile && <SidebarTrigger />}

      <button
        type="button"
        onClick={onBuscar}
        aria-keyshortcuts={ATAJO === '⌘K' ? 'Meta+K' : 'Control+K'}
        className="text-muted-foreground focus-visible:border-ring focus-visible:ring-focus-tint flex h-9 min-w-0 flex-[0_1_420px] cursor-pointer items-center gap-2.5 rounded-[9px] border border-[#e6e8ee] bg-[#f7f8fa] pr-2 pl-3 text-left text-sm transition-colors outline-none hover:border-[#d5d9e1] hover:bg-[#f3f4f7] focus-visible:ring-3"
      >
        <SearchIcon className="size-[17px] shrink-0" />
        <span className="min-w-0 flex-1 truncate">Buscar pedidos, productos, clientes…</span>
        <kbd className="text-ink-3 hidden h-[22px] shrink-0 items-center rounded-md border border-[#e1e4ea] bg-white px-1.5 font-sans text-xs font-medium sm:inline-flex">
          {ATAJO}
        </kbd>
      </button>

      <div className="flex-1" />

      {tienda?.domain && (
        <a
          href={`https://${tienda.domain}`}
          target="_blank"
          rel="noreferrer"
          className="text-ink-2 hidden h-[34px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium whitespace-nowrap hover:bg-[#f3f4f7] sm:inline-flex"
        >
          Ver tienda
          <ExternalLinkIcon className="size-[15px]" />
        </a>
      )}

      <MenuDeCuenta />
    </header>
  );
}

function MenuDeCuenta() {
  const { sesion, salir } = useSesion();
  const { tiendas, tienda, elegir } = useTienda();
  const puede = usePuede();
  const avisar = useAvisar();

  const correo = sesion?.email ?? '';
  const nombre = sesion?.nombre;
  const inicial = (nombre ?? correo).slice(0, 1).toUpperCase() || '?';
  const rol = sesion?.membresias.find((m) => m.tenantId === tienda?.tenantId)?.role;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Tu cuenta"
        title="Tu cuenta"
        className="focus-visible:ring-focus-tint flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#e6e8ee] p-[3px] outline-none focus-visible:ring-3 data-popup-open:bg-[#3b5bdb]"
      >
        <span className="flex size-full rounded-full bg-white p-0.5">
          <span className="text-link-hover flex flex-1 items-center justify-center rounded-full bg-[#e4e9fc] text-[13px] font-semibold">
            {inicial}
          </span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-[300px]">
        {/* Los rótulos van dentro de un grupo: fuera de uno, Base UI lanza al abrir. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2.5 px-2 pt-2 pb-2.5 tracking-normal normal-case">
            <span className="text-link-hover flex size-[34px] shrink-0 items-center justify-center rounded-full bg-[#e4e9fc] text-[13.5px] font-semibold">
              {inicial}
            </span>
            <span className="flex min-w-0 flex-col leading-snug">
              <span className="text-foreground truncate text-[13.5px] font-medium">
                {nombre ?? correo}
              </span>
              <span className="text-muted-foreground truncate text-xs font-normal">
                {rol ? ETIQUETA_ROL[rol] : 'Sin rol'}
                {tienda ? ` · ${tienda.name}` : ''}
              </span>
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        {tienda && tiendas.length > 1 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <SwitchIcon className="text-muted-foreground size-[17px]" />
              Cambiar de tienda
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-56">
              {tiendas.map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  onClick={() => {
                    if (t.id === tienda.id) return;
                    elegir(t.id);
                    avisar(`Estás trabajando en ${t.name}`);
                  }}
                >
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate">{t.name}</span>
                    {t.domain && (
                      <span className="text-muted-foreground truncate text-[11.5px]">
                        {t.domain}
                      </span>
                    )}
                  </span>
                  {t.id === tienda.id && <CheckIcon className="text-link size-[15px]" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        <DropdownMenuItem
          render={<Link to="/configuracion/$seccion" params={{ seccion: 'cuenta' }} />}
        >
          <UserCircleIcon className="text-muted-foreground size-[17px]" />
          Mi cuenta
        </DropdownMenuItem>
        {puede('member.manage') && (
          <DropdownMenuItem
            render={<Link to="/configuracion/$seccion" params={{ seccion: 'equipo' }} />}
          >
            <UserMultipleIcon className="text-muted-foreground size-[17px]" />
            Equipo
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void salir()}>
          <LogOutIcon className="text-muted-foreground size-[17px]" />
          Salir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
