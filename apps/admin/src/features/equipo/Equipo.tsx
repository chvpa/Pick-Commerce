import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repositorioEquipo } from '@pick/adapter-supabase';
import { DESCRIPCION_ROL, ETIQUETA_ROL, ROLES, esUltimoOwner } from '@pick/commerce-core';
import type { MemberRole } from '@pick/commerce-types';
import { UsersRoundIcon } from '@/components/iconos';
import {
  Esqueleto,
  EstadoDeError,
  EstadoVacio,
  PaginaAdmin,
  Selector,
  Tarjeta,
} from '@/components/pagina';
import { BorrarConConfirmacion } from '@/components/acciones';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useSesion } from '@/features/auth/SesionContext';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { SelectItem } from '@/components/ui/select';

function fecha(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Quién administra el comercio.
 *
 * Sin alta: crear un usuario necesita la secret key, y el Admin es una SPA
 * estática que no puede tenerla sin dejarla en el bundle de cualquiera. Se hace
 * por `pnpm admin:crear`, y la pantalla lo dice en vez de esconder la ausencia.
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
    <PaginaAdmin
      titulo="Equipo"
      icono={UsersRoundIcon}
      descripcion={
        <>
          Quién puede entrar al Admin de esta organización. Para dar de alta a alguien nuevo se usa{' '}
          <code className="bg-muted rounded px-1 py-0.5 text-xs">pnpm admin:crear</code>.
        </>
      }
    >
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
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Persona</TableHead>
                  <TableHead>Desde</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {consulta.isPending ? (
                  <TableRow>
                    <TableCell colSpan={4} className="p-0">
                      <Esqueleto filas={3} />
                    </TableCell>
                  </TableRow>
                ) : miembros.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="p-0">
                      <EstadoVacio titulo="Todavía no hay nadie">
                        Se dan de alta desde el repositorio, con `pnpm admin:crear`.
                      </EstadoVacio>
                    </TableCell>
                  </TableRow>
                ) : (
                  miembros.map((m) => {
                    const ultimo = esUltimoOwner(miembros, m.userId);
                    const motivo = ultimo
                      ? 'La organización necesita al menos un propietario.'
                      : undefined;

                    return (
                      <TableRow key={m.userId}>
                        <TableCell>
                          <span className="flex flex-col gap-0.5">
                            <span className="font-medium">{m.email}</span>
                            {m.userId === sesion?.userId && (
                              <span className="text-muted-foreground text-xs">Sos vos</span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {fecha(m.createdAt, tienda.locale)}
                        </TableCell>
                        <TableCell>
                          <Selector
                            aria-label={`Rol de ${m.email}`}
                            value={m.role}
                            disabled={ocupado || ultimo}
                            title={motivo}
                            onValueChange={(valor) =>
                              cambiarRol.mutate({
                                userId: m.userId,
                                rol: valor as MemberRole,
                              })
                            }
                          >
                            {ROLES.map((r) => (
                              <SelectItem key={r} value={r} title={DESCRIPCION_ROL[r]}>
                                {ETIQUETA_ROL[r]}
                              </SelectItem>
                            ))}
                          </Selector>
                        </TableCell>
                        <TableCell>
                          {/*
                            `title={motivo}` explica por qué está deshabilitado —al
                            último owner no se lo puede quitar—; el diálogo sólo
                            aparece cuando la acción es posible.
                          */}
                          <span className="flex justify-end" title={motivo}>
                            <BorrarConConfirmacion
                              nombre={m.email}
                              etiqueta={`Quitar a ${m.email}`}
                              // `ultimo` no es «está ocupado» sino «no se puede»:
                              // al último owner no se lo quita, y el motivo lo
                              // explica el `title` de arriba. Deshabilitar es lo
                              // mismo en los dos casos, pero perder esa condición
                              // dejaría a la organización sin dueño.
                              pendiente={ocupado || ultimo}
                              que="Pierde el acceso a esta organización. Sus pedidos y cambios quedan como están."
                              onConfirmar={() => quitar.mutate(m.userId)}
                            />
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Tarjeta>

      <Tarjeta>
        <h2 className="text-sm font-medium">Qué puede cada rol</h2>
        <dl className="mt-3 flex flex-col gap-2">
          {ROLES.map((r) => (
            <div key={r} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
              <dt className="w-32 shrink-0 text-sm font-medium">{ETIQUETA_ROL[r]}</dt>
              <dd className="text-muted-foreground text-sm">{DESCRIPCION_ROL[r]}</dd>
            </div>
          ))}
        </dl>
      </Tarjeta>
    </PaginaAdmin>
  );
}
