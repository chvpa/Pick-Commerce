import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repositorioEquipo } from '@pick/adapter-supabase';
import { DESCRIPCION_ROL, ETIQUETA_ROL, esUltimoOwner } from '@pick/commerce-core';
import type { MemberRole } from '@pick/commerce-types';
import { BorrarConConfirmacion } from '@/components/acciones';
import { Esqueleto, EstadoDeError, EstadoVacio, Selector, Tarjeta } from '@/components/pagina';
import { SelectItem } from '@/components/ui/select';
import { useSesion } from '@/features/auth/SesionContext';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';

/**
 * Los roles que se ofrecen: propietario y personal, como el handoff (ADR-155).
 * `admin` y `viewer` siguen en la base y se muestran a quien ya los tiene, pero
 * no se le dan a nadie más: dos roles se explican en una línea, cuatro no.
 */
const OFRECIDOS: readonly MemberRole[] = ['owner', 'staff'];

/**
 * Quién administra el comercio, como una sección de Configuración.
 *
 * Sin alta: crear un usuario necesita la secret key, que el Worker del Admin no
 * tiene. Se hace por `pnpm admin:crear`, y la pantalla lo dice en vez de esconder
 * la ausencia. Invitar desde acá llega con la Cuenta Pick.
 *
 * El último propietario aparece con los controles deshabilitados. Es una
 * cortesía, no la defensa: si alguien fuerza la operación igual, el trigger de
 * la base la rechaza y el error se muestra acá abajo.
 */
export function Equipo() {
  const tienda = useTiendaActiva();
  const { sesion } = useSesion();
  const cliente = useQueryClient();

  const consulta = useQuery({
    queryKey: ['equipo', tienda.tenantId],
    queryFn: () => repositorioEquipo(db).listar(tienda.tenantId),
  });

  const invalidar = () => cliente.invalidateQueries({ queryKey: ['equipo', tienda.tenantId] });

  const cambiarRol = useMutation({
    mutationFn: ({ userId, rol }: { userId: string; rol: MemberRole }) =>
      repositorioEquipo(db).cambiarRol(tienda.tenantId, userId, rol),
    onSuccess: invalidar,
  });

  const quitar = useMutation({
    mutationFn: (userId: string) => repositorioEquipo(db).quitar(tienda.tenantId, userId),
    onSuccess: invalidar,
  });

  const miembros = consulta.data ?? [];
  const ocupado = cambiarRol.isPending || quitar.isPending;
  const fallo = (cambiarRol.error ?? quitar.error) as Error | null;

  return (
    <>
      {fallo && (
        <p className="text-destructive text-sm" role="alert">
          {fallo.message}
        </p>
      )}

      <Tarjeta sinRelleno>
        {consulta.isError ? (
          <EstadoDeError
            titulo="No se pudo cargar el equipo"
            error={consulta.error as Error}
            onReintentar={() => void consulta.refetch()}
          />
        ) : consulta.isPending ? (
          <Esqueleto filas={3} />
        ) : miembros.length === 0 ? (
          <EstadoVacio titulo="Todavía no hay nadie">
            Se dan de alta desde el repositorio, con `pnpm admin:crear`.
          </EstadoVacio>
        ) : (
          <ul aria-label="Equipo">
            {miembros.map((m) => {
              const ultimo = esUltimoOwner(miembros, m.userId);
              const motivo = ultimo
                ? 'La organización necesita al menos un propietario.'
                : undefined;
              const opciones = OFRECIDOS.includes(m.role) ? OFRECIDOS : [...OFRECIDOS, m.role];
              const vos = m.userId === sesion?.userId;

              return (
                <li
                  key={m.userId}
                  className="border-line-row flex flex-wrap items-center gap-3 border-b px-5 py-3 last:border-b-0"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#edf1fe] text-sm font-semibold text-[#2b47bd]">
                    {m.email.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="flex min-w-48 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{m.email}</span>
                    <span className="text-ink-3 text-[13px]">
                      {vos ? 'Vos · ' : ''}
                      {`desde el ${new Date(m.createdAt).toLocaleDateString(tienda.locale, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}`}
                    </span>
                  </div>
                  <span title={motivo}>
                    <Selector
                      aria-label={`Rol de ${m.email}`}
                      value={m.role}
                      disabled={ocupado || ultimo}
                      onValueChange={(valor) =>
                        cambiarRol.mutate({ userId: m.userId, rol: valor as MemberRole })
                      }
                    >
                      {opciones.map((r) => (
                        <SelectItem key={r} value={r} title={DESCRIPCION_ROL[r]}>
                          {ETIQUETA_ROL[r]}
                        </SelectItem>
                      ))}
                    </Selector>
                  </span>
                  {/*
                    `title={motivo}` explica por qué está deshabilitado —al último
                    owner no se lo puede quitar—; el diálogo sólo aparece cuando la
                    acción es posible.
                  */}
                  <span title={motivo}>
                    <BorrarConConfirmacion
                      nombre={m.email}
                      etiqueta={`Quitar a ${m.email}`}
                      // `ultimo` no es «está ocupado» sino «no se puede»: al último
                      // owner no se lo quita. Deshabilitar es lo mismo en los dos
                      // casos, pero perder esa condición dejaría a la organización
                      // sin dueño.
                      pendiente={ocupado || ultimo}
                      que="Pierde el acceso a esta organización. Sus pedidos y cambios quedan como están."
                      onConfirmar={() => quitar.mutate(m.userId)}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>

      <dl className="flex flex-col gap-1.5">
        {OFRECIDOS.map((r) => (
          <div key={r} className="flex flex-col gap-0.5 text-[13px] sm:flex-row sm:gap-2">
            <dt className="w-28 shrink-0 font-medium">{ETIQUETA_ROL[r]}</dt>
            <dd className="text-ink-3">{DESCRIPCION_ROL[r]}</dd>
          </div>
        ))}
      </dl>
      <p className="text-ink-3 text-[13px]">
        Para sumar a alguien se usa{' '}
        <code className="bg-muted rounded px-1 py-0.5 text-xs">pnpm admin:crear</code>. Invitar
        desde acá llega con la Cuenta Pick.
      </p>
    </>
  );
}
