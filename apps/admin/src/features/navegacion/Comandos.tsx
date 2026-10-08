import { useEffect, useId, useState, type ComponentType } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  repositorioAdminCatalogo,
  repositorioAdminClientes,
  repositorioAdminPedidos,
} from '@pick/adapter-supabase';
import { ETIQUETA_ESTADO_PEDIDO, formatMoney } from '@pick/commerce-core';
import type { Permission } from '@pick/commerce-types';
import {
  AnalyticsIcon,
  CameraIcon,
  CameraOffIcon,
  DiscountIcon,
  GiftIcon,
  HomeIcon,
  InvoiceIcon,
  LayersIcon,
  LayoutIcon,
  PackageIcon,
  PlusIcon,
  ResenaIcon,
  ReturnIcon,
  SearchIcon,
  SettingsIcon,
  TagIcon,
  UploadIcon,
  UserAddIcon,
  UserCircleIcon,
  UserGroupIcon,
} from '@/components/iconos';
import { usePuede } from '@/features/auth/usePuede';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { cn } from '@/lib/utils';

/**
 * La paleta de comandos: ⌘K o Ctrl+K desde cualquier pantalla.
 *
 * Es el buscador de la barra de arriba del handoff (ADR-143). Sin escribir nada
 * ofrece las acciones de todos los días, las secciones y los últimos pedidos;
 * escribiendo, busca **en el servidor** pedidos, productos y clientes —nunca
 * baja una lista entera para filtrarla acá—, con las mismas funciones que usan
 * sus pantallas, así que encuentra exactamente lo mismo que ellas.
 *
 * Es un combobox: el foco se queda en el campo y la opción activa se anuncia
 * con `aria-activedescendant`. Las flechas mueven, Enter abre y Escape cierra;
 * el diálogo de Base UI pone el foco adentro y lo devuelve al salir.
 */

interface Comando {
  readonly id: string;
  readonly icono: ComponentType<{ className?: string }>;
  readonly label: string;
  readonly sub?: string;
  readonly ir: () => void;
}

interface Grupo {
  readonly titulo: string;
  readonly comandos: readonly Comando[];
}

/** La tecla que abre la paleta, como se escribe en esta máquina. */
export const ATAJO =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘K' : 'Ctrl K';

/** Sin acentos y en minúsculas: «categorias» encuentra «Categorías». */
function normalizar(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** El valor, recién cuando dejó de cambiar: no se consulta la base por tecla. */
function useQuieto(valor: string, ms: number): string {
  const [quieto, setQuieto] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setQuieto(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return quieto;
}

const SECCIONES: readonly {
  to: string;
  label: string;
  icono: ComponentType<{ className?: string }>;
  permiso?: Permission;
}[] = [
  { to: '/', label: 'Inicio', icono: HomeIcon },
  { to: '/pedidos', label: 'Pedidos', icono: InvoiceIcon },
  { to: '/promociones', label: 'Promociones', icono: DiscountIcon },
  { to: '/analytics', label: 'Analytics', icono: AnalyticsIcon },
  { to: '/productos', label: 'Productos', icono: PackageIcon },
  { to: '/productos/resenas', label: 'Reseñas', icono: ResenaIcon },
  { to: '/clientes', label: 'Clientes', icono: UserGroupIcon },
  { to: '/clientes/fidelidad', label: 'Fidelidad', icono: GiftIcon },
  { to: '/contenido/secciones', label: 'Secciones', icono: LayoutIcon },
  { to: '/contenido/colecciones', label: 'Colecciones', icono: LayersIcon },
  { to: '/contenido/categorias', label: 'Categorías', icono: TagIcon },
  { to: '/equipo', label: 'Equipo', icono: UserCircleIcon, permiso: 'member.manage' },
  { to: '/configuracion', label: 'Configuración', icono: SettingsIcon, permiso: 'settings.write' },
];

const ACCIONES: readonly {
  to: string;
  label: string;
  icono: ComponentType<{ className?: string }>;
  permiso?: Permission;
}[] = [
  { to: '/productos/nuevo', label: 'Nuevo producto', icono: PlusIcon, permiso: 'catalog.write' },
  { to: '/productos/sin-foto', label: 'Ver productos sin foto', icono: CameraOffIcon },
  {
    to: '/productos/camara',
    label: 'Cargar con la cámara',
    icono: CameraIcon,
    permiso: 'settings.write',
  },
  {
    to: '/productos/importar',
    label: 'Importar productos',
    icono: UploadIcon,
    permiso: 'catalog.write',
  },
  {
    to: '/promociones/nueva',
    label: 'Nueva promoción',
    icono: DiscountIcon,
    permiso: 'promotion.write',
  },
  { to: '/equipo', label: 'Invitar al equipo', icono: UserAddIcon, permiso: 'member.manage' },
];

export function Comandos({
  abierto,
  onAbierto,
}: {
  abierto: boolean;
  onAbierto: (abierto: boolean) => void;
}) {
  return (
    <Dialog.Root open={abierto} onOpenChange={onAbierto}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[80] bg-[rgba(14,21,37,0.28)] backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed top-[12vh] left-1/2 z-[80] flex max-h-[70vh] w-[min(620px,calc(100vw-3rem))] -translate-x-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(16,24,40,0.28),0_0_0_1px_rgba(16,24,40,0.06)] outline-none transition duration-150 data-ending-style:scale-98 data-ending-style:opacity-0 data-starting-style:scale-98 data-starting-style:opacity-0">
          <Dialog.Title className="sr-only">Buscar o escribir una acción</Dialog.Title>
          {/* Se monta al abrir: cada apertura empieza con el campo vacío. */}
          {abierto && <Paleta alElegir={() => onAbierto(false)} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Paleta({ alElegir }: { alElegir: () => void }) {
  const tienda = useTiendaActiva();
  const puede = usePuede();
  const navegar = useNavigate();
  const [texto, setTexto] = useState('');
  const [activo, setActivo] = useState(0);
  const idLista = useId();

  const buscado = useQuieto(texto.trim(), 200);
  const hayBusqueda = buscado.length >= 2;

  const ir = (to: string) => () => {
    alElegir();
    void navegar({ to });
  };

  const pedidos = useQuery({
    queryKey: ['comandos', 'pedidos', tienda.id, hayBusqueda ? buscado : ''],
    queryFn: () =>
      repositorioAdminPedidos(db).listar(tienda.id, {
        query: hayBusqueda ? buscado : '',
        perPage: hayBusqueda ? 5 : 3,
      }),
    placeholderData: keepPreviousData,
  });
  const productos = useQuery({
    queryKey: ['comandos', 'productos', tienda.id, buscado],
    queryFn: () => repositorioAdminCatalogo(db).listar(tienda.id, { query: buscado, perPage: 5 }),
    enabled: hayBusqueda,
    placeholderData: keepPreviousData,
  });
  const clientes = useQuery({
    queryKey: ['comandos', 'clientes', tienda.id, buscado],
    queryFn: () => repositorioAdminClientes(db).listar(tienda.id, { query: buscado, perPage: 4 }),
    enabled: hayBusqueda,
    placeholderData: keepPreviousData,
  });

  // Se arma en cada render y sin memo: son unas decenas de entradas.
  const grupos = ((): readonly Grupo[] => {
    const q = normalizar(texto.trim());
    const coincide = (label: string) => !q || normalizar(label).includes(q);
    const permitido = (permiso?: Permission) => !permiso || puede(permiso);

    const acciones: Comando[] = ACCIONES.filter(
      (a) => permitido(a.permiso) && coincide(a.label),
    ).map((a) => ({
      id: `accion:${a.to}:${a.label}`,
      icono: a.icono,
      label: a.label,
      ir: ir(a.to),
    }));
    const secciones: Comando[] = SECCIONES.filter(
      (s) => permitido(s.permiso) && coincide(s.label),
    ).map((s) => ({ id: `seccion:${s.to}`, icono: s.icono, label: s.label, ir: ir(s.to) }));

    const dePedidos: Comando[] = (pedidos.data?.items ?? []).map((p) => ({
      id: `pedido:${p.id}`,
      icono: InvoiceIcon,
      label: `#${p.number} · ${p.customerName}`,
      sub: `${formatMoney(p.total, tienda.locale)} · ${ETIQUETA_ESTADO_PEDIDO[p.status]}`,
      ir: () => {
        alElegir();
        void navegar({ to: '/pedidos/$id', params: { id: p.id } });
      },
    }));

    if (!q) {
      return [
        { titulo: 'Acciones', comandos: acciones.slice(0, 4) },
        { titulo: 'Ir a', comandos: secciones },
        { titulo: 'Pedidos recientes', comandos: dePedidos },
      ].filter((g) => g.comandos.length > 0);
    }

    const deProductos: Comando[] = hayBusqueda
      ? (productos.data?.items ?? []).map((p) => ({
          id: `producto:${p.id}`,
          icono: PackageIcon,
          label: p.title,
          ...(p.brand ? { sub: p.brand } : {}),
          ir: () => {
            alElegir();
            void navegar({ to: '/productos/$id', params: { id: p.id } });
          },
        }))
      : [];
    const deClientes: Comando[] = hayBusqueda
      ? (clientes.data?.items ?? []).map((c) => ({
          id: `cliente:${c.id}`,
          icono: UserCircleIcon,
          label: c.name,
          sub: c.email,
          ir: () => {
            alElegir();
            void navegar({ to: '/clientes/$id', params: { id: c.id } });
          },
        }))
      : [];

    return [
      { titulo: 'Ir a', comandos: secciones.slice(0, 5) },
      { titulo: 'Acciones', comandos: acciones.slice(0, 5) },
      { titulo: 'Pedidos', comandos: hayBusqueda ? dePedidos : [] },
      { titulo: 'Productos', comandos: deProductos },
      { titulo: 'Clientes', comandos: deClientes },
    ].filter((g) => g.comandos.length > 0);
  })();

  const lista = grupos.flatMap((g) => g.comandos);
  const indice = Math.min(activo, Math.max(lista.length - 1, 0));
  const actual = lista[indice];
  const buscando =
    hayBusqueda && (pedidos.isFetching || productos.isFetching || clientes.isFetching);

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[#eef0f3] px-[18px]">
        <SearchIcon className="text-ink-faint size-[19px] shrink-0" />
        <input
          autoFocus
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setActivo(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActivo(Math.min(indice + 1, lista.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActivo(Math.max(indice - 1, 0));
            } else if (e.key === 'Enter' && actual) {
              e.preventDefault();
              actual.ir();
            }
          }}
          placeholder="Buscar o escribir una acción…"
          role="combobox"
          aria-expanded="true"
          aria-controls={idLista}
          aria-activedescendant={actual ? `${idLista}-${actual.id}` : undefined}
          aria-autocomplete="list"
          className="placeholder:text-ink-faint min-w-0 flex-1 bg-transparent text-base outline-none"
        />
        <kbd className="text-ink-3 inline-flex h-[22px] items-center rounded-md border border-[#e1e4ea] px-1.5 font-sans text-[11.5px] font-medium">
          esc
        </kbd>
      </div>

      <div
        id={idLista}
        role="listbox"
        aria-label="Resultados"
        aria-busy={buscando}
        className="min-h-0 flex-1 overflow-y-auto p-2"
      >
        {grupos.map((g) => (
          <div key={g.titulo} role="group" aria-label={g.titulo} className="pt-1 pb-1.5">
            <div className="text-muted-foreground px-2.5 pt-2 pb-1 text-[11.5px] font-semibold tracking-[0.06em] uppercase">
              {g.titulo}
            </div>
            {g.comandos.map((c) => {
              const esActivo = c === actual;
              return (
                <div
                  key={c.id}
                  id={`${idLista}-${c.id}`}
                  role="option"
                  aria-selected={esActivo}
                  onMouseEnter={() => setActivo(lista.indexOf(c))}
                  onClick={c.ir}
                  className={cn(
                    'flex h-[42px] cursor-pointer items-center gap-3 rounded-[9px] px-2.5 text-sm',
                    esActivo && 'bg-[#f1f4fe]',
                  )}
                >
                  <c.icono className="text-muted-foreground size-[18px] shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    {c.label}
                    {c.sub && <span className="text-muted-foreground"> {c.sub}</span>}
                  </span>
                  {esActivo && <ReturnIcon className="text-muted-foreground size-[15px]" />}
                </div>
              );
            })}
          </div>
        ))}
        {lista.length === 0 && (
          <p className="text-muted-foreground p-8 text-center text-sm">
            {buscando ? 'Buscando…' : `Sin resultados para «${texto.trim()}»`}
          </p>
        )}
      </div>

      <div className="text-muted-foreground flex shrink-0 gap-4 overflow-hidden border-t border-[#eef0f3] bg-[#fafbfc] px-[18px] py-2.5 text-xs whitespace-nowrap">
        <span>↑↓ moverse</span>
        <span>↵ abrir</span>
        <span>esc cerrar</span>
        <span className="ml-auto hidden sm:inline">{ATAJO} desde cualquier pantalla</span>
      </div>
    </>
  );
}
