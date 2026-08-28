import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repositorioEquipo } from '@pick/adapter-supabase';
import { DESCRIPCION_ROL, ETIQUETA_ROL, ROLES, esUltimoOwner } from '@pick/commerce-core';
import type { MemberRole } from '@pick/commerce-types';
import { Button } from '@/components/ui/button';
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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Equipo</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Quién puede entrar al Admin de esta organización. Para dar de alta a alguien nuevo, se
          usa <code className="bg-muted rounded px-1 py-0.5 text-xs">pnpm admin:crear</code> desde
          el repositorio.
        </p>
      </div>

      {consulta.isError ? (
        <div className="border-destructive/40 flex flex-col items-start gap-3 rounded-lg border p-6">
          <p className="text-sm">No se pudo cargar el equipo.</p>
          <p className="text-muted-foreground text-xs">{(consulta.error as Error).message}</p>
          <Button variant="outline" size="sm" onClick={() => void consulta.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : (
        <div className="border-border overflow-x-auto rounded-lg border">
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
                Array.from({ length: 3 }, (_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={4}>
                      <div className="bg-muted h-5 w-full animate-pulse rounded" />
                    </TableCell>
                  </TableRow>
                ))
              ) : miembros.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center">
                    <p className="text-muted-foreground text-sm">Todavía no hay nadie.</p>
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
                        <select
                          aria-label={`Rol de ${m.email}`}
                          value={m.role}
                          disabled={ocupado || ultimo}
                          title={motivo}
                          onChange={(e) =>
                            cambiarRol.mutate({
                              userId: m.userId,
                              rol: e.currentTarget.value as MemberRole,
                            })
                          }
                          className="border-border bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-7 cursor-pointer rounded-lg border px-2 text-xs outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r} title={DESCRIPCION_ROL[r]}>
                              {ETIQUETA_ROL[r]}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={ocupado || ultimo}
                          title={motivo}
                          onClick={() => {
                            if (confirm(`¿Quitar a ${m.email} de esta organización?`)) {
                              quitar.mutate(m.userId);
                            }
                          }}
                        >
                          Quitar
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {fallo && (
        <p className="text-destructive text-sm" role="alert">
          {fallo.message}
        </p>
      )}

      <section className="text-muted-foreground flex flex-col gap-1 text-xs">
        <h2 className="text-foreground text-sm font-medium">Qué puede cada rol</h2>
        {ROLES.map((r) => (
          <p key={r}>
            <span className="text-foreground font-medium">{ETIQUETA_ROL[r]}</span> —{' '}
            {DESCRIPCION_ROL[r]}
          </p>
        ))}
      </section>
    </div>
  );
}
