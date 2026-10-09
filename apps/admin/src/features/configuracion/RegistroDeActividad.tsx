import { useState } from 'react';
import Papa from 'papaparse';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  avisoDeCambiosSensibles,
  guardarAvisoDeCambiosSensibles,
  registroDeActividad,
  repositorioEquipo,
  type FilaDelRegistro,
} from '@pick/adapter-supabase';
import { cambiosLegibles, queHizo } from '@pick/commerce-core';
import { ArrowRightIcon, DownloadIcon, LockIcon } from '@/components/iconos';
import {
  Esqueleto,
  EstadoDeError,
  EstadoVacio,
  Paginacion,
  Segmentado,
  Selector,
  Tarjeta,
} from '@/components/pagina';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SelectItem } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useSesion } from '@/features/auth/SesionContext';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { descargar } from '@/lib/descargar';
import { dispositivoDe } from '@/lib/dispositivo';
import { db } from '@/lib/supabase';

const POR_PAGINA = 50;
const TODAS = 'todas';
/** Quien hizo un cambio y ya no tiene usuario: la fila queda, el nombre no. */
const SIN_NOMBRE = 'Alguien que ya no está';

/** A dónde mirar lo que cambió. Lo que no tiene pantalla propia, no enlaza. */
function enlaceDe(f: FilaDelRegistro): { to: string; params?: Record<string, string> } | null {
  if (!f.subjectId) return null;
  switch (f.entity) {
    case 'orders':
      return { to: '/pedidos/$id', params: { id: f.subjectId } };
    case 'products':
    case 'product_variants':
    case 'inventory_levels':
      return { to: '/productos/$id', params: { id: f.subjectId } };
    case 'promotions':
      return { to: '/promociones/$id', params: { id: f.subjectId } };
    case 'store_settings':
      return {
        to: '/configuracion/$seccion',
        params: { seccion: f.changes?.['settings.payments'] ? 'pagos' : 'cuenta' },
      };
    case 'memberships':
      return { to: '/configuracion/$seccion', params: { seccion: 'equipo' } };
    default:
      return null;
  }
}

/**
 * Configuración › Registro de actividad (ADR-160): todo lo que hicieron las
 * personas del comercio, lo más nuevo primero.
 *
 * Lo ve sólo quien administra el equipo, que es quien tiene que poder revisar lo
 * que hizo cada uno —incluido otro propietario—. Se exporta con los mismos filtros
 * que se ven, para llevarlo a una planilla o a quien lo pida.
 */
export function RegistroDeActividad() {
  const tienda = useTiendaActiva();
  const [vista, setVista] = useState<'todo' | 'sensibles'>('todo');
  const [persona, setPersona] = useState<string>(TODAS);
  const [page, setPage] = useState(1);

  const filtro = {
    ...(persona === TODAS ? {} : { actorId: persona }),
    soloSensibles: vista === 'sensibles',
  };

  const equipo = useQuery({
    queryKey: ['equipo', tienda.tenantId],
    queryFn: () => repositorioEquipo(db).listar(tienda.tenantId),
  });

  const consulta = useQuery({
    queryKey: ['registro', tienda.tenantId, vista, persona, page],
    queryFn: () =>
      registroDeActividad(db, tienda.tenantId, { ...filtro, page, perPage: POR_PAGINA }),
    placeholderData: keepPreviousData,
  });

  const exportar = useMutation({
    mutationFn: async () => {
      const filas: Record<string, string>[] = [];
      for (let p = 1; ; p += 1) {
        const lote = await registroDeActividad(db, tienda.tenantId, {
          ...filtro,
          page: p,
          perPage: 200,
        });
        for (const f of lote.items) {
          filas.push({
            fecha: new Date(f.at).toLocaleString(tienda.locale),
            persona: f.actor ?? SIN_NOMBRE,
            rol: f.role ?? '',
            que: queHizo(f),
            objeto: f.label ?? '',
            cambios: cambiosLegibles(f, tienda)
              .map((c) => `${c.campo}: ${c.antes} → ${c.despues}`)
              .join('; '),
            sensible: f.sensitive ? 'sí' : '',
            ip: f.ip ?? '',
            navegador: f.userAgent ? dispositivoDe(f.userAgent) : '',
          });
        }
        if (p >= lote.pageCount) break;
      }
      descargar(`actividad-${tienda.slug}.csv`, Papa.unparse(filas));
    },
  });

  const datos = consulta.data;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Segmentado
          etiqueta="Qué cambios"
          valor={vista}
          onCambiar={(v) => {
            setVista(v);
            setPage(1);
          }}
          opciones={[
            { valor: 'todo', etiqueta: 'Todo' },
            { valor: 'sensibles', etiqueta: 'Sensibles' },
          ]}
        />
        <Selector
          aria-label="Persona"
          className="w-full sm:w-64"
          value={persona}
          onValueChange={(v) => {
            setPersona(v);
            setPage(1);
          }}
        >
          <SelectItem value={TODAS}>Todas las personas</SelectItem>
          {(equipo.data ?? []).map((m) => (
            <SelectItem key={m.userId} value={m.userId}>
              {m.email}
            </SelectItem>
          ))}
        </Selector>
        <Button
          variant="outline"
          className="ml-auto"
          disabled={exportar.isPending || !datos || datos.total === 0}
          onClick={() => exportar.mutate()}
        >
          <DownloadIcon />
          {exportar.isPending ? 'Exportando…' : 'Exportar'}
        </Button>
      </div>
      {exportar.isError && (
        <p className="text-destructive text-sm" role="alert">
          {(exportar.error as Error).message}
        </p>
      )}

      <Tarjeta sinRelleno>
        {consulta.isError ? (
          <EstadoDeError
            titulo="No se pudo leer el registro"
            error={consulta.error as Error}
            onReintentar={() => void consulta.refetch()}
          />
        ) : consulta.isPending ? (
          <Esqueleto filas={6} />
        ) : datos!.items.length === 0 ? (
          <EstadoVacio titulo="No hay cambios con este filtro">
            Cada cambio que alguien del equipo hace en pedidos, productos, stock, promociones,
            ajustes o el equipo aparece acá.
          </EstadoVacio>
        ) : (
          <>
            <ul aria-label="Actividad" aria-busy={consulta.isFetching ? 'true' : undefined}>
              {datos!.items.map((f) => {
                const enlace = enlaceDe(f);
                const quien = f.actor ?? SIN_NOMBRE;
                return (
                  <li
                    key={f.id}
                    className="border-line-row flex gap-3 border-b px-5 py-3 last:border-b-0"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#edf1fe] text-[12.5px] font-semibold text-[#2b47bd]">
                      {quien.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1 text-[13.5px]">
                      <span>
                        <strong className="font-semibold">{quien}</strong> {queHizo(f)}
                        {f.sensitive && (
                          <Badge variant="red" className="ml-2 align-middle">
                            Sensible
                          </Badge>
                        )}
                      </span>
                      {cambiosLegibles(f, tienda).map((c) => (
                        <span
                          key={c.campo}
                          className="text-ink-3 flex flex-wrap items-center gap-1.5 text-[12.5px]"
                        >
                          {c.campo}:{' '}
                          <span className="line-through decoration-[#c8cdd7]">{c.antes}</span>
                          <ArrowRightIcon className="size-3" aria-label="pasó a" />
                          <span className="text-foreground">{c.despues}</span>
                        </span>
                      ))}
                      <span className="text-ink-faint flex flex-wrap gap-x-2 text-[12px]">
                        <span>
                          {new Date(f.at).toLocaleString(tienda.locale, {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {enlace && f.label && (
                          <Link
                            to={enlace.to}
                            {...(enlace.params ? { params: enlace.params } : {})}
                            className="text-link hover:text-link-hover"
                          >
                            {f.label}
                          </Link>
                        )}
                        {(f.ip || f.userAgent) && (
                          <span>
                            {[f.userAgent && dispositivoDe(f.userAgent), f.ip]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        )}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
            <Paginacion
              datos={datos!}
              sustantivo="cambios"
              cargando={consulta.isFetching}
              onPagina={setPage}
            />
          </>
        )}
      </Tarjeta>

      <AvisoDeSensibles />

      <p className="text-ink-3 flex items-center gap-1.5 text-[13px]">
        <LockIcon className="size-3.5" />
        Nadie puede editar ni borrar este registro, ni siquiera el propietario. Se guarda por dos
        años.
      </p>
    </>
  );
}

/**
 * El aviso por correo de lo sensible que hace **otra** persona (ADR-160): un
 * pedido anulado o con el pago cambiado a mano, una promoción borrada, la cuenta
 * de cobro, el equipo. Cada propietario lo prende para sí.
 */
function AvisoDeSensibles() {
  const { sesion } = useSesion();
  const tienda = useTiendaActiva();
  const cliente = useQueryClient();
  const userId = sesion?.userId ?? '';
  const clave = ['aviso-de-sensibles', tienda.tenantId, userId];

  const consulta = useQuery({
    queryKey: clave,
    queryFn: () => avisoDeCambiosSensibles(db, tienda.tenantId, userId),
    enabled: userId !== '',
  });
  const guardar = useMutation({
    mutationFn: (prendido: boolean) =>
      guardarAvisoDeCambiosSensibles(db, tienda.tenantId, prendido),
    onSuccess: (_, prendido) => cliente.setQueryData(clave, prendido),
  });
  const fallo = (consulta.error ?? guardar.error) as Error | null;

  return (
    <Tarjeta className="flex items-center gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium">Avisarme de los cambios sensibles</span>
        <span className="text-ink-3 text-[13px]">
          Un pedido anulado o con el pago cambiado a mano, una promoción borrada, la cuenta de cobro
          o el equipo. Un correo a {sesion?.email} cuando lo hace otra persona.
        </span>
        {fallo && (
          <span className="text-destructive text-[13px]" role="alert">
            {fallo.message}
          </span>
        )}
      </div>
      <Switch
        aria-label="Avisarme de los cambios sensibles"
        checked={consulta.data ?? false}
        disabled={consulta.isPending || guardar.isPending}
        onCheckedChange={(v) => guardar.mutate(v === true)}
      />
    </Tarjeta>
  );
}
