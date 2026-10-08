import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { repositorioAdminCatalogo, subirImagenDeProducto } from '@pick/adapter-supabase';
import { skuSugerido, slugify } from '@pick/commerce-core';
import {
  ArrowRightIcon,
  CameraIcon,
  CheckCircleIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from '@/components/iconos';
import { Campo } from '@/components/campo';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SelectItem } from '@/components/ui/select';
import { EstadoVacio, PaginaAdmin, Selector, Tarjeta } from '@/components/pagina';
import { usePuede } from '@/features/auth/usePuede';
import { useCategorias } from '@/features/tienda/useCategorias';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { useSucursales } from '@/features/tienda/useSucursales';
import { normalizarFoto } from '@/lib/foto';
import { ErrorDeIA, fichaDesdeFotos, limpiarFondo, type FichaDeIA } from '@/lib/ia';
import { db } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { VARIANTE_UNICA, variantesDelAlta } from './alta';
import { productoParaGuardar, productoSchema } from './esquema';

/**
 * Cargar mercadería nueva con la cámara (v2 Fase 6, ADR-131; pasos del handoff,
 * ADR-154).
 *
 * El caso que resuelve: llegan veinte vestidos y cargarlos uno por uno son doce
 * campos por producto. Acá se les saca una foto, la IA propone la ficha leyendo
 * lo que está impreso en la etiqueta, y la persona **valida**: nada se guarda
 * sin que alguien mire la pantalla, y lo que se leyó de la etiqueta se ofrece
 * pero no se escribe solo.
 *
 * Sin credencial de OpenAI la pantalla sirve igual, sin los pasos de IA: la
 * cámara y el formulario corto. Una tienda sin clave no se queda sin la
 * herramienta.
 *
 * Está pensada para el teléfono: un paso por pantalla, botones grandes, y la
 * foto se achica en el navegador antes de subir.
 */

/**
 * Cuántas fotos por producto.
 *
 * Cada una dispara una limpieza de fondo, que es la operación más cara de la IA
 * y la paga el comercio: sin tope, una tanda de veinte fotos eran veinte
 * llamadas. La ficha lee sólo las tres primeras; el resto son ángulos.
 */
const MAXIMO_DE_FOTOS = 6;

const PASOS = ['Fotos', 'Fondo', 'Datos', 'Listo'] as const;

type EstadoDeFoto = 'subiendo' | 'limpiando' | 'lista' | 'error';

interface Foto {
  readonly id: string;
  readonly originalUrl: string;
  readonly ancho: number;
  readonly alto: number;
  readonly limpia?: { url: string; ancho: number; alto: number };
  /** Cuál de las dos se publica. La otra no se borra. */
  readonly usar: 'original' | 'limpia';
  readonly estado: EstadoDeFoto;
  readonly motivo?: string;
}

/** Los campos que se revisan en el paso de los datos. */
interface Campos {
  title: string;
  handle: string;
  description: string;
  brand: string;
  categoryId: string;
  precio: string;
  costo: string;
  sku: string;
  barcode: string;
  /** La cantidad cuando no hay talles: la de la variante única. */
  stock: string;
}

/** Un talle con su cantidad: llegan dos del 40 y tres del 41. */
interface Talle {
  readonly talle: string;
  readonly stock: string;
}

const VACIO: Campos = {
  title: '',
  handle: '',
  description: '',
  brand: '',
  categoryId: '',
  precio: '',
  costo: '',
  sku: '',
  barcode: '',
  stock: '1',
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function CargarConCamara() {
  const tienda = useTiendaActiva();
  const puede = usePuede();
  const queryClient = useQueryClient();
  const entrada = useRef<HTMLInputElement>(null);

  const { sucursales, varias, unica } = useSucursales();
  const [sucursal, setSucursal] = useState<string | undefined>(undefined);
  const sucursalDestino = sucursal ?? unica ?? sucursales[0]?.id;

  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [fotos, setFotos] = useState<readonly Foto[]>([]);
  const [campos, setCampos] = useState<Campos>(VACIO);
  const [talles, setTalles] = useState<readonly Talle[]>([]);
  const [talleNuevo, setTalleNuevo] = useState('');
  /** Lo que propuso la IA, para marcarlo mientras nadie lo cambie. */
  const [propuesta, setPropuesta] = useState<Partial<Campos>>({});
  const [tallesDeIA, setTallesDeIA] = useState(false);
  const [etiqueta, setEtiqueta] = useState<FichaDeIA['label']>(undefined);
  const [leyendo, setLeyendo] = useState(false);
  const [avisoDeIA, setAvisoDeIA] = useState<string | null>(null);
  /** Se comprueba una vez: sin credencial no tiene sentido reintentar por foto. */
  const [sinIA, setSinIA] = useState(false);
  const [errorDeGuardado, setErrorDeGuardado] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<{
    titulo: string;
    publicado: boolean;
    talles: number;
    fotos: number;
  } | null>(null);

  const categorias = useCategorias();

  /*
   * `settings.write` y no `catalog.write`: el alta gasta la clave de OpenAI del
   * comercio, y la credencial la entrega `ai_credential_secret`, que ya exige
   * ese permiso (ADR-131). Fotografiar un producto que **ya existe** sigue
   * necesitando sólo `catalog.write`: eso es «Sin foto», que no gasta nada.
   */
  const escribe = puede('settings.write');
  const skuEfectivo = campos.sku.trim() || skuSugerido(campos.handle);

  const cambiar = (parte: Partial<Campos>) => setCampos((previos) => ({ ...previos, ...parte }));
  const deIA = (campo: keyof Campos) =>
    propuesta[campo] !== undefined && propuesta[campo] === campos[campo];

  const tocar = (id: string, parte: Partial<Foto>) =>
    setFotos((previas) => previas.map((f) => (f.id === id ? { ...f, ...parte } : f)));

  /** La foto que se va a publicar, con sus medidas. */
  const elegida = (foto: Foto) =>
    foto.usar === 'limpia' && foto.limpia
      ? { url: foto.limpia.url, width: foto.limpia.ancho, height: foto.limpia.alto }
      : { url: foto.originalUrl, width: foto.ancho, height: foto.alto };

  /**
   * La limpieza del fondo, por foto y en segundo plano.
   *
   * Arranca apenas la original está arriba para que el tiempo de OpenAI —de 15 a
   * 25 segundos, medido— corra mientras la persona saca la siguiente foto. Si
   * falla, la foto queda igual: la original sirve.
   */
  const limpiar = async (id: string, url: string) => {
    try {
      const propuestaLimpia = await limpiarFondo(tienda.id, url);
      const { archivo, width, height } = await normalizarFoto(propuestaLimpia);
      const subida = await subirImagenDeProducto(db, tienda.tenantId, archivo, 'ia');
      tocar(id, { limpia: { url: subida.url, ancho: width, alto: height }, estado: 'lista' });
    } catch (causa) {
      if (causa instanceof ErrorDeIA && causa.codigo === 'sin_credencial') setSinIA(true);
      tocar(id, { estado: 'lista', usar: 'original', motivo: (causa as Error).message });
    }
  };

  const agregar = async (archivos: readonly File[]) => {
    for (const original of archivos.slice(0, Math.max(0, MAXIMO_DE_FOTOS - fotos.length))) {
      const id = crypto.randomUUID();
      setFotos((previas) => [
        ...previas,
        {
          id,
          originalUrl: '',
          ancho: 0,
          alto: 0,
          usar: sinIA ? 'original' : 'limpia',
          estado: 'subiendo',
        },
      ]);

      try {
        const { archivo, width, height } = await normalizarFoto(original);
        const { url } = await subirImagenDeProducto(db, tienda.tenantId, archivo);
        tocar(id, {
          originalUrl: url,
          ancho: width,
          alto: height,
          estado: sinIA ? 'lista' : 'limpiando',
        });
        if (!sinIA) void limpiar(id, url);
      } catch (causa) {
        tocar(id, { estado: 'error', motivo: (causa as Error).message });
      }
    }
  };

  /**
   * La ficha, leída de las **originales**.
   *
   * La visión lee la etiqueta, y la foto con el fondo limpio es una imagen
   * regenerada: un texto impreso puede salir deformado de ahí (ADR-130, medido).
   * Lo que se lee tiene que ser la foto que salió de la cámara.
   */
  const leerFicha = async (urls: readonly string[]) => {
    if (urls.length === 0 || sinIA) return;
    setLeyendo(true);
    setAvisoDeIA(null);
    try {
      const { ficha } = await fichaDesdeFotos(
        tienda.id,
        [...urls],
        (categorias.data ?? []).map((c) => ({ id: c.id, nombre: c.name })),
      );
      aplicar(ficha);
    } catch (causa) {
      if (causa instanceof ErrorDeIA && causa.codigo === 'sin_credencial') setSinIA(true);
      setAvisoDeIA((causa as Error).message);
    } finally {
      setLeyendo(false);
    }
  };

  /** Lo descriptivo se completa; lo de la etiqueta queda ofrecido, no escrito. */
  const aplicar = (ficha: FichaDeIA) => {
    const title = ficha.title ?? '';
    const nuevos: Partial<Campos> = {
      ...(title ? { title, handle: slugify(title) } : {}),
      ...(ficha.description ? { description: ficha.description } : {}),
      ...(ficha.brand ? { brand: ficha.brand } : {}),
      ...(ficha.categoryId ? { categoryId: ficha.categoryId } : {}),
    };
    setCampos((previos) => ({ ...previos, ...nuevos }));
    setPropuesta(nuevos);
    // Sin repetidos ni espacios: cada talle es una clave, y dos iguales serían dos variantes con el mismo SKU.
    const leidos = [...new Set((ficha.sizes ?? []).map((s) => s.trim()).filter((s) => s !== ''))];
    setTalles(leidos.map((talle) => ({ talle, stock: '1' })));
    setTallesDeIA(leidos.length > 0);
    setEtiqueta(ficha.label);
  };

  const agregarTalle = () => {
    const talle = talleNuevo.trim();
    if (talle === '') return;
    if (!talles.some((t) => t.talle === talle)) setTalles((p) => [...p, { talle, stock: '1' }]);
    setTalleNuevo('');
  };

  const conFoto = fotos.filter((f) => f.estado !== 'error' && f.originalUrl !== '');

  const guardar = useMutation({
    mutationFn: async (publicar: boolean) => {
      const variantes = variantesDelAlta({
        sku: skuEfectivo,
        talles: talles.map((t) => t.talle),
        precio: Number(campos.precio),
        ...(campos.costo.trim() === '' ? {} : { costo: Number(campos.costo) }),
        ...(campos.stock.trim() === '' ? {} : { stock: Number(campos.stock) }),
        stockPorTalle: Object.fromEntries(
          talles.map((t) => [t.talle, t.stock.trim() === '' ? 0 : Number(t.stock)]),
        ),
        ...(campos.barcode.trim() === '' ? {} : { barcode: campos.barcode.trim() }),
      });

      /*
       * Se valida con el **mismo** esquema que la ficha completa y que el import
       * de CSV. Si el alta pudiera guardar algo que el formulario rechaza, el
       * catálogo terminaría con productos que nadie puede editar después.
       */
      const revisado = productoSchema.safeParse({
        title: campos.title.trim(),
        handle: campos.handle.trim(),
        description: campos.description.trim(),
        brand: campos.brand.trim(),
        categoryId: campos.categoryId,
        status: publicar ? 'active' : 'draft',
        variantes: variantes.map((v) => ({
          sku: v.sku,
          title: v.title,
          ...(v.barcode ? { barcode: v.barcode } : {}),
          precio: String(v.precio),
          precioAnterior: '',
          costo: v.costo === undefined ? '' : String(v.costo),
          stock: v.stock === undefined ? '' : String(v.stock),
          atributos: Object.entries(v.atributos)
            .map(([k, valor]) => `${k}: ${valor}`)
            .join('\n'),
        })),
        // El texto alternativo es el nombre del producto: es lo que describe la
        // foto, y el esquema lo exige. Sin esto el alta fallaba entera.
        media: conFoto.map((f) => ({ ...elegida(f), alt: campos.title.trim() })),
      });

      if (!revisado.success) {
        throw new Error(motivoDelRechazo(revisado.error.issues[0]));
      }

      return repositorioAdminCatalogo(db).guardar(
        tienda.id,
        productoParaGuardar(revisado.data, tienda.currency as 'PYG', sucursalDestino),
      );
    },
    onSuccess: async (_, publicar) => {
      setErrorDeGuardado(null);
      setGuardado({
        titulo: campos.title.trim(),
        publicado: publicar,
        talles: talles.length,
        fotos: conFoto.length,
      });
      await queryClient.invalidateQueries({ queryKey: ['productos', tienda.id] });
    },
    onError: (causa: Error) => setErrorDeGuardado(causa.message),
  });

  /** El siguiente producto de la tanda: la marca, la categoría y el precio se repiten. */
  const siguiente = () => {
    setFotos([]);
    setTalles([]);
    setTallesDeIA(false);
    setPropuesta({});
    setEtiqueta(undefined);
    setAvisoDeIA(null);
    setGuardado(null);
    setCampos((previos) => ({
      ...VACIO,
      brand: previos.brand,
      categoryId: previos.categoryId,
      precio: previos.precio,
      costo: previos.costo,
      stock: previos.stock,
    }));
    setPaso(1);
  };

  const subiendo = fotos.some((f) => f.estado === 'subiendo');
  const limpiando = fotos.some((f) => f.estado === 'limpiando');
  const llena = fotos.length >= MAXIMO_DE_FOTOS;
  const actual = guardado ? 4 : paso;

  if (!escribe) {
    return (
      <PaginaAdmin titulo="Cargar con la cámara">
        <Tarjeta>
          <EstadoVacio titulo="Esta pantalla la usa quien administra la tienda">
            El alta con la cámara usa la clave de OpenAI del comercio, así que la abre quien puede
            configurarla. Para fotografiar productos que ya existen está «Sin foto».
          </EstadoVacio>
        </Tarjeta>
      </PaginaAdmin>
    );
  }

  return (
    <PaginaAdmin
      titulo="Cargar con la cámara"
      descripcion="Sacale fotos al producto y la IA propone el fondo limpio y los datos. Nada se publica sin tu revisión."
    >
      <ol aria-label="Pasos" className="grid max-w-2xl grid-cols-4 gap-2">
        {PASOS.map((nombre, i) => (
          <li
            key={nombre}
            aria-current={actual === i + 1 ? 'step' : undefined}
            className="flex flex-col gap-1.5"
          >
            <span
              className={cn('h-1 rounded-full', actual >= i + 1 ? 'bg-[#3b5bdb]' : 'bg-[#e6e8ee]')}
            />
            <span
              className={cn(
                'text-[12.5px]',
                actual === i + 1 ? 'text-foreground font-semibold' : 'text-ink-faint font-medium',
              )}
            >
              {nombre}
            </span>
          </li>
        ))}
      </ol>

      {guardado ? (
        <Tarjeta className="flex max-w-2xl flex-col items-center gap-3 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-[#e8f6ee] text-[#13774a]">
            <CheckCircleIcon className="size-6" />
          </span>
          <p className="text-[17px] font-semibold" role="status">
            {guardado.publicado ? 'Publicado en la tienda' : 'Guardado como borrador'}
          </p>
          <p className="text-ink-2 text-sm">
            {[
              guardado.titulo,
              guardado.talles > 0 && plural(guardado.talles, 'talle', 'talles'),
              plural(guardado.fotos, 'foto', 'fotos'),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="text-ink-3 max-w-sm text-[13px]">
            {guardado.publicado ? '' : 'Se publica desde el listado. '}El siguiente arranca con la
            misma marca, categoría y precio.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button size="lg" onClick={siguiente}>
              <CameraIcon aria-hidden="true" />
              Cargar otro
            </Button>
            <Link to="/productos" className={buttonVariants({ size: 'lg', variant: 'outline' })}>
              Ir al listado
            </Link>
          </div>
        </Tarjeta>
      ) : (
        <div className="flex max-w-2xl flex-col gap-4">
          {paso === 1 && (
            <>
              <input
                ref={entrada}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                aria-label="Foto del producto"
                onChange={(evento) => {
                  const archivos = [...(evento.target.files ?? [])];
                  evento.target.value = '';
                  if (archivos.length > 0) void agregar(archivos);
                }}
              />

              {/*
                El visor abre la cámara del sistema: en el teléfono es la de
                atrás, y no hace falta pedir permisos ni dibujar un video.
              */}
              <button
                type="button"
                disabled={subiendo || llena}
                onClick={() => entrada.current?.click()}
                className="focus-visible:ring-focus-tint relative flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl bg-[#0e1525] px-6 text-white outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-60 sm:aspect-[16/9]"
              >
                {[
                  'top-4 left-4 border-t-2 border-l-2',
                  'top-4 right-4 border-t-2 border-r-2',
                  'bottom-4 left-4 border-b-2 border-l-2',
                  'right-4 bottom-4 border-r-2 border-b-2',
                ].map((esquina) => (
                  <span
                    key={esquina}
                    aria-hidden="true"
                    className={cn('absolute size-7 rounded-[3px] border-white/50', esquina)}
                  />
                ))}
                <span className="flex size-14 items-center justify-center rounded-full bg-white/12">
                  <CameraIcon aria-hidden="true" className="size-7" />
                </span>
                <span className="text-[15px] font-semibold">
                  {subiendo
                    ? 'Subiendo…'
                    : llena
                      ? `Ya hay ${MAXIMO_DE_FOTOS} fotos`
                      : fotos.length === 0
                        ? 'Sacar una foto'
                        : 'Sacar otra'}
                </span>
                <span className="text-[13px] text-white/70">
                  Encuadrá el producto sobre una superficie lisa
                </span>
              </button>

              {fotos.length > 0 && (
                <ul aria-label="Fotos tomadas" className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {fotos.map((foto, k) => (
                    <li key={foto.id} className="flex flex-col gap-1">
                      {foto.originalUrl ? (
                        <img
                          src={foto.originalUrl}
                          alt={k === 0 ? 'Portada' : `Foto ${k + 1}`}
                          className="bg-muted aspect-square w-full rounded-lg object-contain"
                        />
                      ) : (
                        <div className="bg-muted aspect-square w-full animate-pulse rounded-lg" />
                      )}
                      <span className="text-ink-3 text-xs">
                        {foto.estado === 'subiendo'
                          ? 'Subiendo…'
                          : foto.estado === 'error'
                            ? 'No se pudo subir'
                            : k === 0
                              ? 'Portada'
                              : 'Lista'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <p className="text-ink-3 text-[13px]">
                Hasta {MAXIMO_DE_FOTOS} fotos; la primera es la portada. Con la etiqueta a la vista
                en alguna de las tres primeras, la IA puede leer el talle, el precio y el código.
              </p>

              <Button
                size="lg"
                disabled={conFoto.length === 0 || subiendo}
                onClick={() => {
                  setPaso(2);
                  void leerFicha(conFoto.map((f) => f.originalUrl));
                }}
              >
                Continuar
                <ArrowRightIcon aria-hidden="true" />
              </Button>
            </>
          )}

          {paso === 2 && (
            <>
              {limpiando && (
                <p
                  aria-live="polite"
                  className="flex items-center gap-2 rounded-xl bg-[#f2eefe] px-4 py-3 text-[13px] text-[#5f37cf]"
                >
                  <SparklesIcon aria-hidden="true" className="size-4 shrink-0" />
                  Limpiando fondos… cada foto puede tardar unos segundos.
                </p>
              )}
              <p className="text-ink-3 text-[13px]">
                {sinIA
                  ? 'Sin clave de OpenAI no hay fondo limpio: se usa la foto original.'
                  : 'La versión con el fondo limpio la redibuja la IA: mirá que el producto, los logos y los textos hayan quedado iguales. La original no se borra.'}
              </p>

              <ul aria-label="Fotos para elegir" className="flex flex-col gap-3">
                {conFoto.map((foto, k) => (
                  <li key={foto.id}>
                    <Tarjeta className="flex flex-col gap-3">
                      <div className="grid grid-cols-2 gap-3">
                        <ElegirFoto
                          src={foto.originalUrl}
                          alt="Foto original"
                          titulo="Original"
                          elegida={foto.usar === 'original' || !foto.limpia}
                          onElegir={() => tocar(foto.id, { usar: 'original' })}
                        />
                        {foto.limpia ? (
                          <ElegirFoto
                            src={foto.limpia.url}
                            alt="Foto con el fondo limpio"
                            titulo="Fondo limpio"
                            ia
                            elegida={foto.usar === 'limpia'}
                            onElegir={() => tocar(foto.id, { usar: 'limpia' })}
                          />
                        ) : (
                          <div className="text-ink-3 flex aspect-square w-full items-center justify-center rounded-lg bg-[#f7f5ff] p-3 text-center text-xs">
                            {foto.estado === 'limpiando'
                              ? 'Limpiando el fondo…'
                              : (foto.motivo ?? 'Sin versión limpia')}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-ink-3 text-[13px]">
                          {(k === 0 ? ['Portada'] : [])
                            .concat(
                              foto.estado === 'limpiando'
                                ? 'Limpiando el fondo'
                                : foto.usar === 'limpia' && foto.limpia
                                  ? 'Se usa la de fondo limpio'
                                  : 'Se usa la original',
                            )
                            .join(' · ')}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setFotos((p) => p.filter((f) => f.id !== foto.id))}
                        >
                          <Trash2Icon aria-hidden="true" />
                          Quitar esta foto
                        </Button>
                      </div>
                    </Tarjeta>
                  </li>
                ))}
              </ul>

              <div className="flex gap-2">
                <Button variant="outline" size="lg" onClick={() => setPaso(1)}>
                  {conFoto.length === 0 ? 'Sacar una foto' : 'Volver'}
                </Button>
                {/*
                  Sin fotos no se sigue: un producto sin foto nace oculto de la
                  vitrina (ADR-112), que es justo lo que la fase anterior vino a
                  arreglar.
                */}
                <Button
                  size="lg"
                  className="flex-1"
                  disabled={conFoto.length === 0}
                  onClick={() => setPaso(3)}
                >
                  Continuar
                  <ArrowRightIcon aria-hidden="true" />
                </Button>
              </div>
            </>
          )}

          {paso === 3 && (
            <>
              {leyendo ? (
                <p
                  aria-live="polite"
                  className="flex items-center gap-2 rounded-xl bg-[#f2eefe] px-4 py-3 text-[13px] text-[#5f37cf]"
                >
                  <SparklesIcon aria-hidden="true" className="size-4 shrink-0" />
                  Leyendo las fotos…
                </p>
              ) : avisoDeIA ? (
                <p className="text-ink-3 text-[13px]" role="status">
                  La IA no pudo proponer la ficha: {avisoDeIA} Podés completarla a mano.
                </p>
              ) : (
                Object.keys(propuesta).length > 0 && (
                  <p className="flex items-center gap-2 rounded-xl bg-[#f2eefe] px-4 py-3 text-[13px] text-[#5f37cf]">
                    <SparklesIcon aria-hidden="true" className="size-4 shrink-0" />
                    La IA leyó la etiqueta y las fotos. Revisá lo marcado antes de guardar; el
                    precio lo ponés vos.
                  </p>
                )
              )}

              <Tarjeta className="flex flex-col gap-4">
                <Campo id="alta-title" label="Título" marca={deIA('title') && <MarcaIA />}>
                  <Input
                    id="alta-title"
                    value={campos.title}
                    onChange={(e) =>
                      cambiar({ title: e.target.value, handle: slugify(e.target.value) })
                    }
                  />
                </Campo>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo id="alta-brand" label="Marca" marca={deIA('brand') && <MarcaIA />}>
                    <Input
                      id="alta-brand"
                      value={campos.brand}
                      onChange={(e) => cambiar({ brand: e.target.value })}
                    />
                  </Campo>

                  <Campo
                    id="alta-categoria"
                    label="Categoría"
                    marca={deIA('categoryId') && <MarcaIA />}
                  >
                    <Selector
                      value={campos.categoryId}
                      aria-label="Categoría"
                      onValueChange={(v) => cambiar({ categoryId: v })}
                    >
                      <SelectItem value="">Sin categoría</SelectItem>
                      {(categorias.data ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </Selector>
                  </Campo>
                </div>

                <Campo
                  id="alta-description"
                  label="Descripción"
                  marca={deIA('description') && <MarcaIA />}
                >
                  <textarea
                    id="alta-description"
                    rows={3}
                    value={campos.description}
                    onChange={(e) => cambiar({ description: e.target.value })}
                    className="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
                  />
                </Campo>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo
                    id="alta-precio"
                    label="Precio"
                    /*
                     * El aviso de los separadores no es cosmético: acá se escribe
                     * en guaraníes y «250.000» se lee como 250. El botón «Usarlo»
                     * no tiene ese problema —aplica el número que leyó la IA, no
                     * el texto impreso—, así que el aviso aparece cuando hay que
                     * escribirlo a mano.
                     */
                    ayuda={
                      etiqueta?.price === undefined ? (
                        'La IA no propone precios. Sin puntos ni comas: 250000'
                      ) : (
                        <Leido
                          valor={etiqueta.printedPrice ?? String(etiqueta.price)}
                          onUsar={() => cambiar({ precio: String(etiqueta.price) })}
                        />
                      )
                    }
                  >
                    <Input
                      id="alta-precio"
                      inputMode="numeric"
                      placeholder="Obligatorio"
                      value={campos.precio}
                      onChange={(e) => cambiar({ precio: e.target.value })}
                    />
                  </Campo>

                  <Campo
                    id="alta-costo"
                    label="Costo"
                    marca={<span className="text-ink-faint text-xs">opcional</span>}
                    ayuda="Sirve para calcular el margen. No se muestra en la tienda."
                  >
                    <Input
                      id="alta-costo"
                      inputMode="numeric"
                      value={campos.costo}
                      onChange={(e) => cambiar({ costo: e.target.value })}
                    />
                  </Campo>

                  <Campo
                    id="alta-sku"
                    label="SKU"
                    ayuda={
                      etiqueta?.sku ? (
                        <Leido
                          valor={etiqueta.sku}
                          onUsar={() => cambiar({ sku: etiqueta.sku! })}
                        />
                      ) : (
                        `Si lo dejás vacío queda ${skuEfectivo || 'el del título'}`
                      )
                    }
                  >
                    <Input
                      id="alta-sku"
                      value={campos.sku}
                      placeholder={skuEfectivo}
                      onChange={(e) => cambiar({ sku: e.target.value })}
                    />
                  </Campo>

                  <Campo
                    id="alta-barcode"
                    label="Código de barras"
                    marca={<span className="text-ink-faint text-xs">opcional</span>}
                    ayuda={
                      etiqueta?.barcode ? (
                        <Leido
                          valor={etiqueta.barcode}
                          onUsar={() => cambiar({ barcode: etiqueta.barcode! })}
                        />
                      ) : talles.length > 1 ? (
                        'Con más de un talle no se carga acá: cada talle tiene el suyo'
                      ) : undefined
                    }
                  >
                    <Input
                      id="alta-barcode"
                      inputMode="numeric"
                      value={campos.barcode}
                      disabled={talles.length > 1}
                      onChange={(e) => cambiar({ barcode: e.target.value })}
                    />
                  </Campo>
                </div>
              </Tarjeta>

              <Tarjeta sinRelleno>
                <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-3">
                  <span className="flex items-center gap-1.5 text-[15px] font-semibold">
                    Variantes
                    {tallesDeIA && <MarcaIA />}
                  </span>
                  {/*
                    Con varias sucursales hay que decir en cuál entra la
                    mercadería: es una tanda que se carga en un depósito, y
                    elegir sola la primera fue el bug que este trabajo cierra.
                  */}
                  {varias ? (
                    <label className="text-ink-3 flex items-center gap-2 text-[13px]">
                      Stock en
                      <Selector
                        value={sucursalDestino ?? ''}
                        aria-label="Sucursal"
                        onValueChange={setSucursal}
                      >
                        {sucursales.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </Selector>
                    </label>
                  ) : (
                    sucursales[0] && (
                      <span className="text-ink-3 text-[13px]">Stock en {sucursales[0].name}</span>
                    )
                  )}
                </div>

                <ul aria-label="Variantes" className="border-line-row border-t">
                  {(talles.length === 0
                    ? [{ talle: VARIANTE_UNICA, stock: campos.stock }]
                    : talles
                  ).map((t) => (
                    <li
                      key={t.talle}
                      className="border-line-row flex items-center gap-3 border-b px-5 py-2.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.talle}</span>
                      <Input
                        aria-label={`Cantidad de ${t.talle}`}
                        inputMode="numeric"
                        className="w-20 text-right"
                        value={t.stock}
                        onChange={(e) => {
                          const valor = e.target.value;
                          if (talles.length === 0) cambiar({ stock: valor });
                          else
                            setTalles((p) =>
                              p.map((x) => (x.talle === t.talle ? { ...x, stock: valor } : x)),
                            );
                        }}
                      />
                      <span className="text-ink-3 text-[13px]">unidades</span>
                      {talles.length > 0 && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Quitar el talle ${t.talle}`}
                          onClick={() => setTalles((p) => p.filter((x) => x.talle !== t.talle))}
                        >
                          <XIcon />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>

                <div className="flex gap-2 px-5 pt-3">
                  <Input
                    value={talleNuevo}
                    aria-label="Agregar un talle"
                    placeholder="Un talle: S, 42…"
                    onChange={(e) => setTalleNuevo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        agregarTalle();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={agregarTalle}>
                    <PlusIcon aria-hidden="true" />
                    Agregar variante
                  </Button>
                </div>
                <p className="text-ink-3 px-5 pt-2 pb-4 text-xs">
                  {talles.length === 0
                    ? 'Sin talles queda una sola variante.'
                    : `${plural(talles.length, 'variante', 'variantes')}, una por talle.`}
                </p>
              </Tarjeta>

              {errorDeGuardado && (
                <p className="text-destructive text-sm" role="alert">
                  No se pudo guardar: {errorDeGuardado}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="lg"
                  disabled={guardar.isPending}
                  onClick={() => setPaso(2)}
                >
                  Volver
                </Button>
                <div className="ml-auto flex flex-1 gap-2 sm:flex-none">
                  <Button
                    variant="outline"
                    size="lg"
                    className="flex-1 sm:flex-none"
                    disabled={guardar.isPending}
                    onClick={() => guardar.mutate(false)}
                  >
                    Guardar borrador
                  </Button>
                  <Button
                    size="lg"
                    className="flex-1 sm:flex-none"
                    disabled={guardar.isPending}
                    onClick={() => guardar.mutate(true)}
                  >
                    {guardar.isPending ? 'Guardando…' : 'Publicar'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </PaginaAdmin>
  );
}

/** Lo que propuso la IA, mientras nadie lo cambie: «Revisá lo marcado». */
function MarcaIA() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#f2eefe] px-1.5 py-px text-[11px] font-semibold text-[#5f37cf]">
      <SparklesIcon aria-hidden="true" className="size-3" />
      IA
    </span>
  );
}

/**
 * Por qué el esquema rechazó el alta, en algo que se pueda leer.
 *
 * El mensaje crudo de Zod para un campo que falta es «Invalid input», que en
 * pantalla no dice nada: el e2e lo vio antes que una persona. Los campos que el
 * operador puede arreglar se nombran; para el resto va el mensaje con su ruta,
 * porque si aparece es un error de programación y hay que poder ubicarlo.
 */
function motivoDelRechazo(problema?: { path: PropertyKey[]; message: string }): string {
  if (!problema) return 'Faltan datos del producto.';
  const campo = String(problema.path.at(-1) ?? '');

  if (campo === 'title' && problema.path.length === 1) return 'Falta el título del producto.';
  if (campo === 'precio') return 'Falta el precio, o no es un número.';
  if (campo === 'stock') return 'La cantidad de cada talle tiene que ser un número entero.';
  if (campo === 'sku') return 'Falta el SKU.';
  if (campo === 'handle') {
    return 'El título no alcanza para armar una dirección: escribí al menos una letra o un número.';
  }
  return `${problema.message} (${problema.path.join('.')})`;
}

/** Una de las dos fotos, con el mismo tamaño que la otra: comparar es el punto. */
function ElegirFoto({
  src,
  alt,
  titulo,
  ia,
  elegida,
  onElegir,
}: {
  src: string;
  alt: string;
  titulo: string;
  ia?: boolean;
  elegida: boolean;
  onElegir: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onElegir}
      aria-pressed={elegida}
      className={cn(
        'focus-visible:ring-focus-tint flex cursor-pointer flex-col gap-1.5 rounded-xl border-2 p-1.5 text-left outline-none focus-visible:ring-3',
        elegida ? 'border-[#3b5bdb]' : 'border-[#eceef2]',
      )}
    >
      <img
        src={src}
        alt={alt}
        className="bg-muted aspect-square w-full rounded-lg object-contain"
      />
      <span
        className={cn(
          'flex items-center gap-1.5 px-1 text-xs',
          elegida ? 'text-foreground font-semibold' : 'text-ink-3 font-medium',
        )}
      >
        {titulo}
        {ia && <MarcaIA />}
      </span>
    </button>
  );
}

/**
 * Lo que se leyó de la etiqueta, con el botón que lo aplica.
 *
 * Se muestra el valor **tal como estaba impreso** y no sólo el número que se
 * usaría: es la evidencia que hace honesto aceptarlo de un toque (ADR-131).
 */
function Leido({ valor, onUsar }: { valor?: string; onUsar?: () => void }) {
  if (!valor) return null;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>Leído de la etiqueta: {valor}</span>
      {onUsar && (
        <button type="button" onClick={onUsar} className="text-foreground cursor-pointer underline">
          Usarlo
        </button>
      )}
    </span>
  );
}
