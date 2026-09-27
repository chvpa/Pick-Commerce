import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repositorioConfiguracion, repositorioFidelidad } from '@pick/adapter-supabase';
import {
  formatMoney,
  tipoDeCambio,
  type Premio,
  type PremioParaGuardar,
} from '@pick/commerce-core';
import { SparklesIcon } from '@/components/iconos';
import { Button } from '@/components/ui/button';
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
 * El programa de puntos (ADR-141).
 *
 * Tres cosas en una pantalla porque son tres partes de la misma decisión: **qué paga
 * el programa**, **cuánto debe** y **qué se puede canjear**. Separarlas obligaría a
 * mirar dos pantallas para saber si un premio tiene sentido.
 *
 * Lo más importante que hace es la línea del tipo de cambio debajo del costo en
 * puntos. Sin ella, un premio a diez puntos se convierte en un descuento permanente
 * del 12 % sobre cada pedido y nadie lo nota hasta que aparece en el margen.
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

  const dinero = (minimas: number): string =>
    formatMoney({ amount: minimas, currency: tienda.currency }, tienda.locale);

  return (
    <PaginaAdmin
      titulo="Fidelidad"
      icono={SparklesIcon}
      descripcion="Puntos por comprar y por reseñar, y qué se puede canjear con ellos. El libro es del comercio: cada movimiento queda registrado."
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
          <Tarjeta sinRelleno>
            <TituloDeTarjeta>El programa</TituloDeTarjeta>
            <div className="flex flex-col gap-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    {reglas.enabled ? 'Encendido' : 'Apagado'}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {reglas.enabled
                      ? 'Cada compra cobrada y cada reseña publicada suman puntos.'
                      : 'Nadie gana puntos hasta que lo enciendas. Nada se emite por atrás.'}
                  </span>
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
              </div>

              <ReglasDelPrograma
                reglas={reglas}
                editable={administra}
                pendiente={guardarReglas.isPending}
                onGuardar={(nuevas) => guardarReglas.mutate({ ...nuevas, enabled: reglas.enabled })}
              />
            </div>
          </Tarjeta>

          {/*
            El pasivo aparte de lo emitido: es lo que el comercio va a tener que
            entregar, y es el número que nadie mira hasta que duele.
          */}
          <div className="grid gap-4 sm:grid-cols-4">
            <Numero titulo="Puntos emitidos" valor={datos.emitidos} />
            <Numero titulo="Canjeados" valor={datos.gastados} />
            <Numero
              titulo="Pasivo abierto"
              valor={datos.pasivo}
              nota="Lo emitido y no gastado: lo que vas a tener que entregar"
            />
            <Numero titulo="Clientes con puntos" valor={datos.conPuntos} />
          </div>

          <p className="text-muted-foreground text-sm">
            Por compras: <strong className="text-foreground">{datos.porCompras}</strong> · por
            reseñas: <strong className="text-foreground">{datos.porResenas}</strong> · vencidos:{' '}
            <strong className="text-foreground">{datos.vencidos}</strong>
          </p>

          <Tarjeta sinRelleno>
            <TituloDeTarjeta
              accion={
                administra && !editando ? (
                  <Button size="sm" onClick={() => setEditando(NUEVO)}>
                    Nuevo premio
                  </Button>
                ) : undefined
              }
            >
              Qué se puede canjear
            </TituloDeTarjeta>

            <div className="flex flex-col gap-4 p-4">
              {editando && (
                <FormularioDePremio
                  premio={editando}
                  porCompra={reglas.porCompra}
                  moneda={tienda.currency}
                  pendiente={guardarPremio.isPending}
                  onCancelar={() => setEditando(null)}
                  onGuardar={(p) => guardarPremio.mutate(p)}
                />
              )}

              {premios.isPending ? (
                <Esqueleto />
              ) : premios.data && premios.data.length === 0 ? (
                <EstadoVacio titulo="Todavía no hay premios">
                  Sin premios, los puntos se acumulan y no se pueden usar. Un canje gasta puntos y
                  emite un cupón de un solo uso.
                </EstadoVacio>
              ) : (
                <ul className="flex flex-col gap-3" aria-label="Premios">
                  {(premios.data ?? []).map((premio) => (
                    <li
                      key={premio.id}
                      className="border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-medium">{premio.title}</span>
                        <span className="text-muted-foreground text-xs">
                          {premio.pointsCost} puntos ·{' '}
                          {premio.discountType === 'percentage'
                            ? `${premio.discountValue / 100}% de descuento`
                            : `${dinero(premio.discountValue)} de descuento`}{' '}
                          · cupón por {premio.validDays} días
                          {premio.maxRedemptions !== undefined
                            ? ` · ${premio.redemptions} de ${premio.maxRedemptions} canjeados`
                            : ` · ${premio.redemptions} canjeados`}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {tipoDeCambio(reglas.porCompra, premio.pointsCost)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs">
                          {premio.status === 'active'
                            ? 'Activo'
                            : premio.status === 'draft'
                              ? 'Borrador'
                              : 'Archivado'}
                        </span>
                        {administra && premio.status !== 'archived' && (
                          <>
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
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPorArchivar(premio)}
                            >
                              Archivar
                            </Button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Tarjeta>
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

function Numero({ titulo, valor, nota }: { titulo: string; valor: number; nota?: string }) {
  return (
    <Tarjeta>
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-sm">{titulo}</span>
        <span className="text-2xl font-semibold tabular-nums">{valor}</span>
        {nota && <span className="text-muted-foreground text-xs">{nota}</span>}
      </div>
    </Tarjeta>
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
      <div className="grid gap-3 sm:grid-cols-3">
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
    <div className="border-border flex flex-col gap-4 rounded-lg border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
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

      <div className="flex gap-2">
        <Button
          size="sm"
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
        <Button variant="outline" size="sm" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
