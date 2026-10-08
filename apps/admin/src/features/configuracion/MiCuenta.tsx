import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  avisoDePedidoNuevo,
  cerrarLasDemas,
  cerrarOtraSesion,
  guardarAvisoDePedidoNuevo,
  guardarNombre,
  misSesiones,
} from '@pick/adapter-supabase';
import { ETIQUETA_ROL } from '@pick/commerce-core';
import { Campo } from '@/components/campo';
import { ComputerIcon, LockIcon, SmartPhoneIcon } from '@/components/iconos';
import { Esqueleto, EstadoDeError, Tarjeta, TituloDeTarjeta } from '@/components/pagina';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useSesion } from '@/features/auth/SesionContext';
import { haceCuanto } from '@/features/dashboard/tareas';
import { useTienda, useTiendaActiva } from '@/features/tienda/TiendaContext';
import { dispositivoDe, esMovil } from '@/lib/dispositivo';
import { db } from '@/lib/supabase';

/**
 * Lo de quien entra, no lo de la tienda (ADR-155): cómo se llama, su contraseña,
 * dónde tiene la cuenta abierta y en qué tiendas trabaja.
 *
 * Es la única sección que tiene cualquier rol: el personal no configura la
 * tienda, pero sí cierra la sesión que dejó abierta en otra computadora.
 */
export function MiCuenta() {
  const { sesion, recuperar } = useSesion();
  const tienda = useTiendaActiva();
  const { tiendas } = useTienda();
  const cliente = useQueryClient();

  const correo = sesion?.email ?? '';
  const guardado = sesion?.nombre ?? '';
  const [nombre, setNombre] = useState(guardado);

  const nombreMut = useMutation({ mutationFn: () => guardarNombre(db, nombre) });

  /*
   * La contraseña se cambia con el mismo enlace que «¿Te la olvidaste?»: probar
   * que el correo es tuyo es más seguro que pedirla de nuevo a quien ya tiene la
   * pantalla abierta, y el formulario de contraseña nueva ya existe.
   */
  const enlace = useMutation({ mutationFn: () => recuperar(correo) });

  const claveSesiones = ['mis-sesiones', sesion?.userId];
  const sesiones = useQuery({ queryKey: claveSesiones, queryFn: () => misSesiones(db) });
  const releer = () => cliente.invalidateQueries({ queryKey: claveSesiones });
  const cerrarUna = useMutation({
    mutationFn: (id: string) => cerrarOtraSesion(db, id),
    onSuccess: releer,
  });
  const cerrarDemas = useMutation({ mutationFn: () => cerrarLasDemas(db), onSuccess: releer });

  const otras = (sesiones.data ?? []).filter((s) => !s.actual).length;
  const fallo = (cerrarUna.error ?? cerrarDemas.error) as Error | null;

  return (
    <>
      <Tarjeta className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[#edf1fe] text-xl font-semibold text-[#2b47bd]">
            {(guardado || correo).slice(0, 1).toUpperCase() || '?'}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-semibold">{guardado || correo}</span>
            {guardado && <span className="text-ink-3 truncate text-[13px]">{correo}</span>}
          </div>
        </div>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            nombreMut.mutate();
          }}
        >
          <Campo id="cuenta-nombre" label="Nombre">
            <Input
              id="cuenta-nombre"
              autoComplete="name"
              maxLength={80}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </Campo>
          <Campo id="cuenta-correo" label="Correo" ayuda="Con este correo entrás al Admin.">
            <Input id="cuenta-correo" value={correo} readOnly className="text-ink-3 bg-[#f7f8fa]" />
          </Campo>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={nombreMut.isPending || nombre.trim() === guardado}>
              {nombreMut.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
            {nombreMut.isSuccess && nombre.trim() === guardado && (
              <span className="text-[13px] text-[#13774a]" role="status">
                Guardado
              </span>
            )}
            {nombreMut.isError && (
              <span className="text-destructive text-[13px]" role="alert">
                {(nombreMut.error as Error).message}
              </span>
            )}
          </div>
        </form>
      </Tarjeta>

      <Tarjeta sinRelleno>
        <TituloDeTarjeta>Seguridad</TituloDeTarjeta>
        <div className="border-line-row flex flex-wrap items-center gap-3 border-t px-5 py-3.5">
          <span className="text-ink-3 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#f1f2f5]">
            <LockIcon className="size-[18px]" />
          </span>
          <div className="flex min-w-48 flex-1 flex-col">
            <span className="text-sm font-medium">Contraseña</span>
            <span className="text-ink-3 text-[13px]" role={enlace.isSuccess ? 'status' : undefined}>
              {enlace.isSuccess
                ? `Te mandamos un enlace a ${correo}: abrilo para elegir la nueva.`
                : 'Te mandamos un enlace por correo para elegir una nueva.'}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={enlace.isPending || enlace.isSuccess}
            onClick={() => enlace.mutate()}
          >
            {enlace.isPending ? 'Enviando…' : enlace.isSuccess ? 'Enviado' : 'Cambiar'}
          </Button>
        </div>

        <p className="border-line-row border-t px-5 pt-4 pb-1 text-sm font-medium">
          Dónde está abierta tu cuenta
        </p>
        {sesiones.isError ? (
          <EstadoDeError
            titulo="No se pudieron cargar las sesiones"
            error={sesiones.error as Error}
            onReintentar={() => void sesiones.refetch()}
          />
        ) : sesiones.isPending ? (
          <Esqueleto filas={2} />
        ) : (
          <ul aria-label="Sesiones abiertas">
            {sesiones.data.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="text-ink-3 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#f1f2f5]">
                  {esMovil(s.navegador) ? (
                    <SmartPhoneIcon className="size-[18px]" />
                  ) : (
                    <ComputerIcon className="size-[18px]" />
                  )}
                </span>
                <div className="flex min-w-40 flex-1 flex-col">
                  <span className="text-sm font-medium">{dispositivoDe(s.navegador)}</span>
                  <span className="text-ink-3 text-[13px]">
                    {s.actual
                      ? 'Ahora'
                      : `Activa ${haceCuanto(s.ultimaActividad, new Date(), tienda.locale)}`}
                    {' · desde el '}
                    {new Date(s.creada).toLocaleDateString(tienda.locale, {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                </div>
                {s.actual ? (
                  <Badge variant="blue">Esta sesión</Badge>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={cerrarUna.isPending || cerrarDemas.isPending}
                    onClick={() => cerrarUna.mutate(s.id)}
                  >
                    {cerrarUna.isPending && cerrarUna.variables === s.id
                      ? 'Cerrando…'
                      : 'Cerrar sesión'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {fallo && (
          <p className="text-destructive px-5 pb-2 text-sm" role="alert">
            {fallo.message}
          </p>
        )}
        <div className="border-line-row flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3.5">
          {/*
            Lo que no se puede prometer, dicho: un token de acceso no se revoca,
            vence. Cerrar una sesión corta su renovación, no lo que ya tiene.
          */}
          <p className="text-ink-3 max-w-md text-[12.5px]">
            Una sesión cerrada ya no se renueva; lo que tenía abierto sigue funcionando hasta una
            hora.
          </p>
          {otras > 1 && (
            <Button
              variant="outline"
              size="sm"
              disabled={cerrarUna.isPending || cerrarDemas.isPending}
              onClick={() => cerrarDemas.mutate()}
            >
              {cerrarDemas.isPending ? 'Cerrando…' : `Cerrar las otras ${otras}`}
            </Button>
          )}
        </div>
      </Tarjeta>

      <AvisosPorCorreo correo={correo} />

      <Tarjeta sinRelleno>
        <TituloDeTarjeta>Tus tiendas</TituloDeTarjeta>
        <ul aria-label="Tus tiendas">
          {tiendas.map((t) => {
            const rol = sesion?.membresias.find((m) => m.tenantId === t.tenantId)?.role;
            return (
              <li key={t.id} className="border-line-row flex items-center gap-3 border-t px-5 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#0e1525] text-sm font-semibold text-white">
                  {t.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{t.name}</span>
                  <span className="text-ink-3 truncate text-[13px]">
                    {t.domain ?? 'Sin dominio todavía'}
                  </span>
                </div>
                {rol && (
                  <Badge variant={rol === 'owner' ? 'blue' : 'gray'}>{ETIQUETA_ROL[rol]}</Badge>
                )}
              </li>
            );
          })}
        </ul>
      </Tarjeta>
    </>
  );
}

/**
 * Lo que le llega por correo a esta persona, en la organización de la tienda que
 * está mirando (ADR-156). Uno solo: el pedido nuevo. Los otros avisos del handoff
 * —pagos rechazados, el resumen del día, el tope de la IA— no existen, y un
 * interruptor de algo que no se manda sería mentir.
 */
function AvisosPorCorreo({ correo }: { correo: string }) {
  const { sesion } = useSesion();
  const tienda = useTiendaActiva();
  const cliente = useQueryClient();
  const userId = sesion?.userId ?? '';

  const clave = ['aviso-de-pedido', tienda.tenantId, userId];
  const consulta = useQuery({
    queryKey: clave,
    queryFn: () => avisoDePedidoNuevo(db, tienda.tenantId, userId),
    enabled: userId !== '',
  });
  const guardar = useMutation({
    mutationFn: (prendido: boolean) => guardarAvisoDePedidoNuevo(db, tienda.tenantId, prendido),
    onSuccess: (_, prendido) => cliente.setQueryData(clave, prendido),
  });

  return (
    <Tarjeta sinRelleno>
      <TituloDeTarjeta>Avisos por correo</TituloDeTarjeta>
      <div className="border-line-row flex items-center gap-3 border-t px-5 py-3.5">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-medium">Pedido nuevo</span>
          <span className="text-ink-3 text-[13px]">
            Un correo a {correo} por cada pedido que entra en {tienda.name}.
          </span>
        </div>
        <Switch
          aria-label="Pedido nuevo"
          checked={consulta.data ?? false}
          disabled={consulta.isPending || guardar.isPending}
          onCheckedChange={(v) => guardar.mutate(v === true)}
        />
      </div>
      {(consulta.error ?? guardar.error) && (
        <p className="text-destructive px-5 pb-3 text-sm" role="alert">
          {((consulta.error ?? guardar.error) as Error).message}
        </p>
      )}
    </Tarjeta>
  );
}
