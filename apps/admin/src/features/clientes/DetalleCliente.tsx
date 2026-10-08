import { useState, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  repositorioAdminClientes,
  repositorioAdminPedidos,
  repositorioFidelidad,
} from '@pick/adapter-supabase';
import { ETIQUETA_ESTADO_PEDIDO, enlaceDeWhatsApp, formatMoney } from '@pick/commerce-core';
import { TONO_DE_PEDIDO } from '@/components/estados';
import { MailIcon, WhatsappIcon } from '@/components/iconos';
import {
  Esqueleto,
  EstadoDeError,
  EstadoVacio,
  Paginacion,
  PaginaAdmin,
  Tarjeta,
  TituloDeTarjeta,
} from '@/components/pagina';
import { PUNTO_DE_TONO } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { usePuede } from '@/features/auth/usePuede';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { cn } from '@/lib/utils';

const POR_PAGINA = 10;

function fecha(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * La ficha de un cliente, como la dibuja el handoff (ADR-143, ADR-150): quién
 * es, qué compró y cuántos puntos tiene.
 *
 * Sus pedidos salen de `admin_orders` buscando por su correo, que es el campo
 * por el que el checkout identifica a un cliente dentro de la tienda. Reusar esa
 * función y no escribir otra consulta mantiene una sola definición de «cómo se
 * ve un pedido en una lista».
 */
export function DetalleCliente({ id }: { id: string }) {
  const tienda = useTiendaActiva();
  const puede = usePuede();
  const [page, setPage] = useState(1);

  const cliente = useQuery({
    queryKey: ['cliente', tienda.id, id],
    queryFn: () => repositorioAdminClientes(db).porId(tienda.id, id),
  });

  const pedidos = useQuery({
    queryKey: ['pedidos-de-cliente', tienda.id, cliente.data?.email, page],
    queryFn: () =>
      repositorioAdminPedidos(db).listar(tienda.id, {
        query: cliente.data!.email,
        page,
        perPage: POR_PAGINA,
      }),
    enabled: Boolean(cliente.data?.email),
    placeholderData: keepPreviousData,
  });

  const puntos = useQuery({
    queryKey: ['puntos-de-cliente', tienda.id, id],
    queryFn: () => repositorioAdminClientes(db).puntos(tienda.id, id),
  });
  const premios = useQuery({
    queryKey: ['premios', tienda.id],
    queryFn: () => repositorioFidelidad(db).premios(tienda.id),
    enabled: puntos.data?.habilitado === true,
  });

  if (cliente.isPending) {
    return (
      <PaginaAdmin titulo="Cliente">
        <Tarjeta sinRelleno>
          <Esqueleto filas={3} />
        </Tarjeta>
      </PaginaAdmin>
    );
  }

  if (cliente.isError) {
    return (
      <PaginaAdmin titulo="Cliente">
        <Tarjeta sinRelleno>
          <EstadoDeError
            titulo="No se pudo cargar el cliente"
            error={cliente.error as Error}
            onReintentar={() => void cliente.refetch()}
          />
        </Tarjeta>
      </PaginaAdmin>
    );
  }

  if (!cliente.data) {
    return (
      <PaginaAdmin titulo="Cliente">
        <Tarjeta sinRelleno>
          <EstadoVacio
            titulo="Este cliente no existe en esta tienda"
            accion={
              <Link to="/clientes" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
                Volver a clientes
              </Link>
            }
          >
            Puede pertenecer a otra tienda de la organización.
          </EstadoVacio>
        </Tarjeta>
      </PaginaAdmin>
    );
  }

  const c = cliente.data;
  const whatsapp = enlaceDeWhatsApp(
    c.phone,
    `Hola ${c.name.split(' ')[0]}, te escribimos de ${tienda.name}.`,
  );
  const desde = new Date(c.createdAt).toLocaleDateString(tienda.locale, {
    month: 'long',
    year: 'numeric',
  });
  const iniciales = c.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  const ids = pedidos.data?.items.map((p) => p.id) ?? [];

  return (
    <PaginaAdmin
      titulo={c.name}
      descripcion={`${c.orderCount} ${c.orderCount === 1 ? 'pedido' : 'pedidos'} · ${formatMoney(
        c.totalSpent as { amount: number; currency: 'PYG' },
        tienda.locale,
      )} en total · cliente desde ${desde}`}
      insignias={
        <span
          aria-hidden="true"
          className="order-first flex size-11 items-center justify-center rounded-full bg-[#e8f6ee] text-[15px] font-semibold text-[#13774a]"
        >
          {iniciales}
        </span>
      }
      acciones={
        <>
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noreferrer"
              aria-label={`Escribirle a ${c.name} por WhatsApp`}
              title="Escribir por WhatsApp"
              className={cn(
                buttonVariants({ variant: 'outline', size: 'icon' }),
                'size-9 text-[#13774a]',
              )}
            >
              <WhatsappIcon className="size-[17px]" />
            </a>
          )}
          <a
            href={`mailto:${c.email}`}
            aria-label={`Escribirle a ${c.email}`}
            title={c.email}
            className={cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'size-9')}
          >
            <MailIcon className="size-4" />
          </a>
        </>
      }
    >
      <div className="flex flex-wrap items-start gap-5">
        <Tarjeta sinRelleno className="min-w-0 flex-[2_1_440px]">
          <TituloDeTarjeta>Pedidos</TituloDeTarjeta>
          {pedidos.isError ? (
            <EstadoDeError
              titulo="No se pudieron cargar los pedidos"
              error={pedidos.error as Error}
              onReintentar={() => void pedidos.refetch()}
            />
          ) : pedidos.isPending ? (
            <Esqueleto filas={3} />
          ) : pedidos.data.items.length === 0 ? (
            <EstadoVacio titulo="Todavía no tiene pedidos">
              Su ficha existe porque empezó una compra, o porque un pedido suyo se canceló.
            </EstadoVacio>
          ) : (
            <ul aria-busy={pedidos.isFetching}>
              {pedidos.data.items.map((p) => {
                const tono = TONO_DE_PEDIDO[p.status];
                return (
                  <li
                    key={p.id}
                    className="hover:bg-row-hover relative flex items-center gap-3 border-t border-[#f0f1f4] px-5 py-3"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      {/*
                        Con el pedido viajan los de esta página: desde el detalle
                        se pasa al anterior y al siguiente de este cliente.
                      */}
                      <Link
                        to="/pedidos/$id"
                        params={{ id: p.id }}
                        state={{ pedidos: ids }}
                        className="font-medium tabular-nums outline-none after:absolute after:inset-0 focus-visible:after:ring-3 focus-visible:after:ring-[#e4e9fc] focus-visible:after:ring-inset"
                      >
                        #{p.number} · {fecha(p.createdAt, tienda.locale)}
                      </Link>
                      <span className="text-ink-3 flex items-center gap-1.5 text-[12.5px]">
                        <span
                          aria-hidden="true"
                          className="size-1.5 rounded-full"
                          style={{ background: PUNTO_DE_TONO[tono] }}
                        />
                        {ETIQUETA_ESTADO_PEDIDO[p.status]} · {p.itemCount}{' '}
                        {p.itemCount === 1 ? 'artículo' : 'artículos'}
                      </span>
                    </span>
                    <span className="font-medium whitespace-nowrap tabular-nums">
                      {formatMoney(p.total, tienda.locale)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {pedidos.data && pedidos.data.pageCount > 1 && (
            <Paginacion
              datos={pedidos.data}
              sustantivo="pedidos"
              cargando={pedidos.isFetching}
              onPagina={setPage}
            />
          )}
        </Tarjeta>

        <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-5">
          <Tarjeta className="flex flex-col gap-3">
            <h2 className="text-[15px] font-semibold">Contacto</h2>
            <Dato etiqueta="Correo">
              <a href={`mailto:${c.email}`} className="text-link break-all hover:underline">
                {c.email}
              </a>
            </Dato>
            <Dato etiqueta="Teléfono">{c.phone}</Dato>
            {c.taxId && (
              <Dato etiqueta="Datos de facturación">
                {c.taxName ? `${c.taxName} · ` : ''}RUC {c.taxId}
              </Dato>
            )}
          </Tarjeta>

          {puntos.data?.habilitado && (
            <Puntos
              saldo={puntos.data.saldo}
              premios={(premios.data ?? []).filter((r) => r.status === 'active')}
              veElPrograma={puede('promotion.write')}
            />
          )}
        </div>
      </div>
    </PaginaAdmin>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-ink-3 text-xs">{etiqueta}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

/**
 * El saldo y cuánto le falta para el próximo premio. El saldo viene con lo
 * vencido descontado: el libro sumado a secas diría puntos que ya no valen.
 */
function Puntos({
  saldo,
  premios,
  veElPrograma,
}: {
  saldo: number;
  premios: readonly { title: string; pointsCost: number }[];
  veElPrograma: boolean;
}) {
  const tienda = useTiendaActiva();
  const ordenados = [...premios].sort((a, b) => a.pointsCost - b.pointsCost);
  const siguiente = ordenados.find((p) => p.pointsCost > saldo);
  const alcanzado = [...ordenados].reverse().find((p) => p.pointsCost <= saldo);
  const progreso = siguiente ? Math.min(1, saldo / siguiente.pointsCost) : 1;

  return (
    <Tarjeta className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Puntos</h2>
        {veElPrograma && (
          <Link to="/clientes/fidelidad" className="text-link text-[13px] hover:underline">
            Ver el programa
          </Link>
        )}
      </div>
      <p className="flex items-baseline gap-1.5">
        <strong className="text-[26px] leading-8 font-semibold tabular-nums">
          {saldo.toLocaleString(tienda.locale)}
        </strong>
        <span className="text-ink-3 text-sm">{saldo === 1 ? 'punto' : 'puntos'}</span>
      </p>
      {ordenados.length > 0 && (
        <>
          <span className="h-1.5 rounded-full bg-[#eceef2]" aria-hidden="true">
            <span
              className="block h-full rounded-full bg-[#3b5bdb]"
              style={{ width: `${progreso * 100}%` }}
            />
          </span>
          <p className="text-ink-3 text-[12.5px]">
            {alcanzado && `Le alcanza para «${alcanzado.title}». `}
            {siguiente
              ? `Le ${siguiente.pointsCost - saldo === 1 ? 'falta 1 punto' : `faltan ${(siguiente.pointsCost - saldo).toLocaleString(tienda.locale)} puntos`} para «${siguiente.title}».`
              : ''}
          </p>
        </>
      )}
    </Tarjeta>
  );
}
