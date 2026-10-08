import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  repositorioAdminClientes,
  repositorioConfiguracion,
  repositorioFidelidad,
} from '@pick/adapter-supabase';
import {
  formatMoney,
  resumenDeRecurrencia,
  tipoDeCambio,
  type Premio,
  type PremioParaGuardar,
} from '@pick/commerce-core';
import { GiftIcon, PlusIcon } from '@/components/iconos';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { DialogoDeConfirmacion } from '@/components/acciones';
import {
  Esqueleto,
  EstadoDeError,
  EstadoVacio,
  PaginaAdmin,
  Selector,
  Tarjeta,
  TituloDeTarjeta,
} from '@/components/pagina';
import { SelectItem } from '@/components/ui/select';
import { usePuede } from '@/features/auth/usePuede';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';

/** Un premio nuevo, con los valores con los que casi siempre se arranca. */
const NUEVO: PremioParaGuardar = {
  title: '',
  pointsCost: 100,
  discountType: 'percentage',
  discountValue: 1000,
  status: 'draft',
  validDays: 30,
  redemptions: 0,
} as unknown as PremioParaGuardar;

function Campo({
  label,
  ayuda,
  children,
}: {
  label: string;
  ayuda?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {ayuda && <span className="text-muted-foreground text-xs">{ayuda}</span>}
    </label>
  );
}

/**
 * El programa de puntos, como lo dibuja el handoff (ADR-141, ADR-151).
 *
 * Tres cosas en una pantalla porque son tres partes de la misma decisión: **qué paga
 * el programa**, **cuánto debe** y **qué se puede canjear**. Separarlas obligaría a
 * mirar dos pantallas para saber si un premio tiene sentido.
 *
 * Lo más importante que hace es la línea del tipo de cambio debajo del costo en
 * puntos. Sin ella, un premio a diez puntos se convierte en un descuento permanente
 * del 12 % sobre cada pedido y nadie lo nota hasta que aparece en el margen.
 *
 * Lo sin canjear no se traduce a plata, aunque el handoff lo haga: no hay una
 * razón entre puntos y guaraníes —un premio puede ser un porcentaje—, y un número
 * inventado acá sería el que el comercio usaría para decidir (ADR-141).
 */
export function Fidelidad() {
  const tienda = useTiendaActiva();
  const puede = usePuede();
  const cliente = useQueryClient();

  const repo = repositorioFidelidad(db);
  const [editando, setEditando] = useState<PremioParaGuardar | null>(null);
  const [porArchivar, setPorArchivar] = useState<Premio | null>(null);

  const resumen = useQuery({
    queryKey: ['fidelidad', tienda.id],
    queryFn: () => repo.resumen(tienda.id),
  });

  const premios = useQuery({
    queryKey: ['premios', tienda.id],
    queryFn: () => repo.premios(tienda.id),
  });

  // Cuántos compraron, para decir «de cuántos»: la misma consulta que Clientes.
  const segmentos = useQuery({
    queryKey: ['segmentos', tienda.id, 'resumen'],
    queryFn: () => repositorioAdminClientes(db).segmentos(tienda.id, { page: 1, perPage: 1 }),
  });

  const refrescar = async () => {
    await cliente.invalidateQueries({ queryKey: ['fidelidad', tienda.id] });
    await cliente.invalidateQueries({ queryKey: ['premios', tienda.id] });
  };

  /*
   * Las reglas son un ajuste de la tienda, así que se guardan por el mismo camino que
   * los demás: `admin_save_settings` mergea sólo la sección editada y deja su rastro
   * en la auditoría.
   */
  const guardarReglas = useMutation({
    mutationFn: (loyalty: Record<string, unknown>) =>
      repositorioConfiguracion(db).guardar(tienda.id, { loyalty }),
    onSuccess: refrescar,
  });

  const guardarPremio = useMutation({
    mutationFn: (premio: PremioParaGuardar) =>
      repo.guardarPremio(tienda.tenantId, tienda.id, premio),
    onSuccess: async () => {
      setEditando(null);
      await refrescar();
    },
  });

  const archivar = useMutation({
    mutationFn: (id: string) => repo.archivarPremio(tienda.id, id),
    onSuccess: async () => {
      setPorArchivar(null);
      await refrescar();
    },
  });

  const administra = puede('promotion.write');
  const datos = resumen.data;
  const reglas = datos?.reglas;
  const fallo = (guardarReglas.error ?? guardarPremio.error ?? archivar.error) as Error | null;
  const compraron = segmentos.data ? resumenDeRecurrencia(segmentos.data.segments).clientes : null;

  const dinero = (minimas: number): string =>
    formatMoney({ amount: minimas, currency: tienda.currency }, tienda.locale);
  const numero = (n: number) => n.toLocaleString(tienda.locale);

  return (
    <PaginaAdmin
      titulo="Fidelidad"
      descripcion="Puntos por comprar y por reseñar, y qué se puede canjear con ellos."
    >
      {fallo && (
        <p className="text-destructive text-sm" role="alert">
          {fallo.message}
        </p>
      )}

      {resumen.isError ? (
        <Tarjeta>
          <EstadoDeError
            titulo="No se pudo leer el programa"
            error={resumen.error as Error}
            onReintentar={() => void resumen.refetch()}
          />
        </Tarjeta>
      ) : resumen.isPending || !reglas ? (
        <Tarjeta>
          <Esqueleto />
        </Tarjeta>
      ) : (
        <>
          <Tarjeta className="flex flex-wrap items-center gap-4">
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-[#f2eefe] text-[#5f37cf]"
            >
              <GiftIcon className="size-5" />
            </span>
            <div className="min-w-[220px] flex-1">
              <p className="font-semibold">Programa de puntos</p>
              <p className="text-ink-3 text-[13.5px]">
                {reglas.enabled
                  ? 'Encendido: cada compra cobrada y cada reseña publicada suman puntos.'
                  : 'Apagado: nadie gana puntos hasta que lo enciendas. Nada se emite por atrás.'}
              </p>
            </div>
            <Switch
              checked={reglas.enabled}
              disabled={!administra || guardarReglas.isPending}
              aria-label="Programa de puntos"
              onCheckedChange={(v) =>
                guardarReglas.mutate({
                  enabled: v === true,
                  porCompra: reglas.porCompra,
                  porResena: reglas.porResena,
                  diasDeVencimiento: reglas.diasDeVencimiento,
                })
              }
            />
          </Tarjeta>

          <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Entregados
              emitidos={datos.emitidos}
              gastados={datos.gastados}
              vencidos={datos.vencidos}
              pasivo={datos.pasivo}
              porCompras={datos.porCompras}
              porResenas={datos.porResenas}
            />
            <Tarjeta className="flex items-center gap-4">
              <Anillo proporcion={compraron ? datos.conPuntos / compraron : 0} />
              <div className="flex flex-col">
                <span className="text-ink-3 text-[13px] font-medium">Clientes con puntos</span>
                <span className="text-[26px] leading-8 font-semibold tabular-nums">
                  {numero(datos.conPuntos)}
                </span>
                {compraron !== null && (
                  <span className="text-ink-3 text-[12.5px]">
                    de {numero(compraron)} que compraron
                  </span>
                )}
              </div>
            </Tarjeta>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <Tarjeta className="flex flex-col gap-4">
              <h2 className="text-[15px] font-semibold">Cómo se ganan</h2>
              <ReglasDelPrograma
                reglas={reglas}
                editable={administra}
                pendiente={guardarReglas.isPending}
                onGuardar={(nuevas) => guardarReglas.mutate({ ...nuevas, enabled: reglas.enabled })}
              />
            </Tarjeta>

            <Tarjeta sinRelleno>
              <TituloDeTarjeta
                accion={
                  administra ? (
                    <Button size="sm" variant="outline" onClick={() => setEditando(NUEVO)}>
                      <PlusIcon />
                      Nuevo premio
                    </Button>
                  ) : undefined
                }
              >
                Qué se puede canjear
              </TituloDeTarjeta>

              {premios.isPending ? (
                <Esqueleto />
              ) : premios.data && premios.data.length === 0 ? (
                <EstadoVacio titulo="Todavía no hay premios">
                  Sin premios, los puntos se acumulan y no se pueden usar. Un canje gasta puntos y
                  emite un cupón de un solo uso.
                </EstadoVacio>
              ) : (
                <ul aria-label="Premios">
                  {(premios.data ?? []).map((premio) => (
                    <li
                      key={premio.id}
                      className="flex flex-wrap items-center gap-3 border-t border-[#f0f1f4] px-5 py-3.5"
                    >
                      <div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
                        <span className="flex items-center gap-2 font-medium">
                          {premio.title}
                          <Badge variant={premio.status === 'active' ? 'green' : 'gray'}>
                            {premio.status === 'active'
                              ? 'Activo'
                              : premio.status === 'draft'
                                ? 'Borrador'
                                : 'Archivado'}
                          </Badge>
                        </span>
                        <span className="text-ink-3 text-[12.5px]">
                          {numero(premio.pointsCost)} puntos ·{' '}
                          {premio.discountType === 'percentage'
                            ? `${premio.discountValue / 100}% de descuento`
                            : `${dinero(premio.discountValue)} de descuento`}{' '}
                          · cupón por {premio.validDays} días
                        </span>
                        <span className="text-ink-faint text-[12px]">
                          {tipoDeCambio(reglas.porCompra, premio.pointsCost)}
                        </span>
                      </div>
                      <div className="flex w-32 flex-col items-end gap-1">
                        <span className="text-[12.5px] tabular-nums">
                          {premio.maxRedemptions !== undefined
                            ? `${premio.redemptions} de ${premio.maxRedemptions} canjes`
                            : `${premio.redemptions} ${premio.redemptions === 1 ? 'canje' : 'canjes'}`}
                        </span>
                        {premio.maxRedemptions !== undefined && (
                          <span
                            className="h-1.5 w-full rounded-full bg-[#eceef2]"
                            aria-hidden="true"
                          >
                            <span
                              className="block h-full rounded-full bg-[#3b5bdb]"
                              style={{
                                width: `${Math.min(1, premio.redemptions / Math.max(1, premio.maxRedemptions)) * 100}%`,
                              }}
                            />
                          </span>
                        )}
                      </div>
                      {administra && premio.status !== 'archived' && (
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setEditando({
                                id: premio.id,
                                title: premio.title,
                                pointsCost: premio.pointsCost,
                                discountType: premio.discountType,
                                discountValue: premio.discountValue,
                                status: premio.status,
                                validDays: premio.validDays,
                                ...(premio.maxRedemptions === undefined
                                  ? {}
                                  : { maxRedemptions: premio.maxRedemptions }),
                                ...(premio.maxPerCustomer === undefined
                                  ? {}
                                  : { maxPerCustomer: premio.maxPerCustomer }),
                              } as PremioParaGuardar)
                            }
                          >
                            Editar
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setPorArchivar(premio)}>
                            Archivar
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
          </div>

          <Dialog
            open={editando !== null}
            onOpenChange={(abierto) => !abierto && setEditando(null)}
          >
            {editando && (
              <DialogContent className="max-w-[640px]">
                <DialogHeader>
                  <DialogTitle>{editando.id ? 'Editar premio' : 'Nuevo premio'}</DialogTitle>
                </DialogHeader>
                <FormularioDePremio
                  premio={editando}
                  porCompra={reglas.porCompra}
                  moneda={tienda.currency}
                  pendiente={guardarPremio.isPending}
                  onCancelar={() => setEditando(null)}
                  onGuardar={(p) => guardarPremio.mutate(p)}
                />
              </DialogContent>
            )}
          </Dialog>
        </>
      )}

      <DialogoDeConfirmacion
        abierto={porArchivar !== null}
        onAbierto={(abierto) => !abierto && setPorArchivar(null)}
        titulo={`¿Archivar «${porArchivar?.title ?? ''}»?`}
        descripcion="Deja de poder canjearse. Los cupones ya emitidos siguen valiendo hasta su fecha: se archiva, no se borra, porque el libro de puntos apunta acá."
        confirmar="Archivar"
        pendiente={archivar.isPending}
        onConfirmar={() => porArchivar && archivar.mutate(porArchivar.id)}
      />
    </PaginaAdmin>
  );
}

/**
 * Lo entregado y a dónde fue: canjeado, vencido o todavía en manos de los
 * clientes. Lo último es el pasivo, lo que el comercio va a tener que entregar, y
 * es el número que nadie mira hasta que duele.
 */
function Entregados({
  emitidos,
  gastados,
  vencidos,
  pasivo,
  porCompras,
  porResenas,
}: {
  emitidos: number;
  gastados: number;
  vencidos: number;
  pasivo: number;
  porCompras: number;
  porResenas: number;
}) {
  const tienda = useTiendaActiva();
  const numero = (n: number) => n.toLocaleString(tienda.locale);
  const parte = (n: number) => (emitidos > 0 ? (n / emitidos) * 100 : 0);
  const tramos = [
    { etiqueta: 'Ya canjeados', valor: gastados, color: '#3b5bdb' },
    { etiqueta: 'Vencidos', valor: vencidos, color: '#a3aab8' },
    {
      etiqueta: 'Sin canjear todavía',
      valor: pasivo,
      color: '#c9d4f8',
      nota: 'lo que vas a tener que entregar',
    },
  ];
  return (
    <Tarjeta className="flex flex-col gap-3">
      <span className="text-ink-3 text-[13px] font-medium">Puntos entregados</span>
      <span className="text-[26px] leading-8 font-semibold tabular-nums">{numero(emitidos)}</span>
      <span className="flex h-2.5 overflow-hidden rounded-full bg-[#eceef2]" aria-hidden="true">
        {tramos.map((t) => (
          <span key={t.etiqueta} style={{ width: `${parte(t.valor)}%`, background: t.color }} />
        ))}
      </span>
      <ul className="flex flex-col gap-1.5 text-[13px]">
        {tramos.map((t) => (
          <li key={t.etiqueta} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ background: t.color }}
            />
            <span className="text-ink-2">{t.etiqueta}</span>
            <span className="ml-auto font-medium tabular-nums">{numero(t.valor)} puntos</span>
            {t.nota && <span className="text-ink-3 hidden text-[12px] sm:inline">· {t.nota}</span>}
          </li>
        ))}
      </ul>
      <p className="text-ink-3 text-[12.5px]">
        Por compras {numero(porCompras)} · por reseñas {numero(porResenas)}
      </p>
    </Tarjeta>
  );
}

/** Un anillo con la proporción, sin librería: un gradiente cónico alcanza. */
function Anillo({ proporcion }: { proporcion: number }) {
  const tienda = useTiendaActiva();
  const grados = Math.round(Math.min(1, Math.max(0, proporcion)) * 360);
  return (
    <span
      className="relative flex size-16 shrink-0 items-center justify-center rounded-full"
      style={{ background: `conic-gradient(#3b5bdb ${grados}deg, #eceef2 0deg)` }}
    >
      <span className="bg-card absolute inset-[7px] rounded-full" />
      <span className="relative text-[13px] font-semibold tabular-nums">
        {new Intl.NumberFormat(tienda.locale, {
          style: 'percent',
          maximumFractionDigits: 0,
        }).format(Math.min(1, proporcion))}
      </span>
    </span>
  );
}

/** Los tres números que definen qué paga el programa. */
function ReglasDelPrograma({
  reglas,
  editable,
  pendiente,
  onGuardar,
}: {
  reglas: { porCompra: number; porResena: number; diasDeVencimiento: number };
  editable: boolean;
  pendiente: boolean;
  onGuardar: (nuevas: { porCompra: number; porResena: number; diasDeVencimiento: number }) => void;
}) {
  const [porCompra, setPorCompra] = useState(String(reglas.porCompra));
  const [porResena, setPorResena] = useState(String(reglas.porResena));
  const [dias, setDias] = useState(String(reglas.diasDeVencimiento));

  const numeros = {
    porCompra: Number(porCompra),
    porResena: Number(porResena),
    diasDeVencimiento: Number(dias),
  };
  const valido = Object.values(numeros).every((n) => Number.isInteger(n) && n > 0);
  const cambiado =
    numeros.porCompra !== reglas.porCompra ||
    numeros.porResena !== reglas.porResena ||
    numeros.diasDeVencimiento !== reglas.diasDeVencimiento;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3">
        <Campo label="Puntos por compra" ayuda="Por pedido cobrado, no por monto">
          <Input
            inputMode="numeric"
            value={porCompra}
            disabled={!editable}
            onChange={(e) => setPorCompra(e.target.value)}
          />
        </Campo>
        <Campo label="Puntos por reseña" ayuda="Al publicarla, sin mirar la estrella">
          <Input
            inputMode="numeric"
            value={porResena}
            disabled={!editable}
            onChange={(e) => setPorResena(e.target.value)}
          />
        </Campo>
        <Campo label="Vencen a los" ayuda="Días desde que se ganaron">
          <Input
            inputMode="numeric"
            value={dias}
            disabled={!editable}
            onChange={(e) => setDias(e.target.value)}
          />
        </Campo>
      </div>

      {editable && cambiado && (
        <div className="flex items-center gap-3">
          <Button size="sm" disabled={!valido || pendiente} onClick={() => onGuardar(numeros)}>
            {pendiente ? 'Guardando…' : 'Guardar reglas'}
          </Button>
          {!valido && (
            <span className="text-destructive text-xs">
              Los tres tienen que ser enteros mayores que cero.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** El alta y la edición de un premio, con el tipo de cambio a la vista. */
function FormularioDePremio({
  premio,
  porCompra,
  moneda,
  pendiente,
  onCancelar,
  onGuardar,
}: {
  premio: PremioParaGuardar;
  porCompra: number;
  moneda: string;
  pendiente: boolean;
  onCancelar: () => void;
  onGuardar: (premio: PremioParaGuardar) => void;
}) {
  const [title, setTitle] = useState(premio.title);
  const [puntos, setPuntos] = useState(String(premio.pointsCost));
  const [tipo, setTipo] = useState<'percentage' | 'fixed'>(premio.discountType);
  const [valor, setValor] = useState(
    premio.discountType === 'percentage'
      ? String(premio.discountValue / 100)
      : String(premio.discountValue),
  );
  const [dias, setDias] = useState(String(premio.validDays));
  const [tope, setTope] = useState(premio.maxRedemptions ? String(premio.maxRedemptions) : '');
  const [porPersona, setPorPersona] = useState(
    premio.maxPerCustomer ? String(premio.maxPerCustomer) : '',
  );
  const [activo, setActivo] = useState(premio.status === 'active');

  const puntosN = Number(puntos);
  const valorN = Number(valor);
  const valido =
    title.trim() !== '' &&
    Number.isInteger(puntosN) &&
    puntosN > 0 &&
    Number.isFinite(valorN) &&
    valorN > 0 &&
    (tipo !== 'percentage' || valorN <= 100);

  return (
    <div className="flex flex-col">
      <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
        <Campo label="Nombre del premio" ayuda="Es lo que ve quien lo canjea">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="10% en todo"
          />
        </Campo>

        <Campo label="Cuesta" ayuda={tipoDeCambio(porCompra, puntosN)}>
          <Input inputMode="numeric" value={puntos} onChange={(e) => setPuntos(e.target.value)} />
        </Campo>

        <Campo label="Tipo de descuento">
          <Selector
            value={tipo}
            aria-label="Tipo de descuento"
            onValueChange={(v) => setTipo(v as 'percentage' | 'fixed')}
          >
            <SelectItem value="percentage">Porcentaje</SelectItem>
            <SelectItem value="fixed">Monto fijo</SelectItem>
          </Selector>
        </Campo>

        <Campo
          label={tipo === 'percentage' ? 'Porcentaje' : `Monto (${moneda})`}
          ayuda={tipo === 'percentage' ? 'Hasta 100' : 'En la moneda de la tienda'}
        >
          <Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
        </Campo>

        <Campo label="El cupón vale" ayuda="Días desde el canje">
          <Input inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value)} />
        </Campo>

        <Campo label="Canjes en total" ayuda="Vacío: sin tope. Es el stock del premio">
          <Input inputMode="numeric" value={tope} onChange={(e) => setTope(e.target.value)} />
        </Campo>

        <Campo label="Canjes por persona" ayuda="Vacío: sin tope">
          <Input
            inputMode="numeric"
            value={porPersona}
            onChange={(e) => setPorPersona(e.target.value)}
          />
        </Campo>

        <div className="flex items-end gap-3">
          <Switch
            checked={activo}
            onCheckedChange={(v) => setActivo(v === true)}
            aria-label="Activo"
          />
          <span className="text-sm">{activo ? 'Se puede canjear' : 'Borrador'}</span>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button
          className="ml-auto"
          disabled={!valido || pendiente}
          onClick={() =>
            onGuardar({
              ...(premio.id ? { id: premio.id } : {}),
              title: title.trim(),
              pointsCost: puntosN,
              discountType: tipo,
              // El porcentaje va en puntos básicos, como en las promociones: así
              // «12,5 %» es un entero y no un float que arrastra centavos.
              discountValue: tipo === 'percentage' ? Math.round(valorN * 100) : Math.round(valorN),
              status: activo ? 'active' : 'draft',
              validDays: Number(dias) > 0 ? Number(dias) : 30,
              ...(Number(tope) > 0 ? { maxRedemptions: Number(tope) } : {}),
              ...(Number(porPersona) > 0 ? { maxPerCustomer: Number(porPersona) } : {}),
            } as PremioParaGuardar)
          }
        >
          {pendiente ? 'Guardando…' : 'Guardar premio'}
        </Button>
      </DialogFooter>
    </div>
  );
}
