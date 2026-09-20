import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  repositorioAdminCatalogo,
  repositorioCatalogo,
  subirImagenDeProducto,
} from '@pick/adapter-supabase';
import { skuSugerido, slugify } from '@pick/commerce-core';
import { CameraIcon, SparklesIcon, Trash2Icon } from '@/components/iconos';
import { Campo } from '@/components/campo';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SelectItem } from '@/components/ui/select';
import { EstadoVacio, PaginaAdmin, Selector, Tarjeta, TituloDeTarjeta } from '@/components/pagina';
import { usePuede } from '@/features/auth/usePuede';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { normalizarFoto } from '@/lib/foto';
import { ErrorDeIA, fichaDesdeFotos, limpiarFondo, type FichaDeIA } from '@/lib/ia';
import { db } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { variantesDelAlta } from './alta';
import { productoParaGuardar, productoSchema } from './esquema';

/**
 * Cargar mercadería nueva con la cámara (v2 Fase 6, ADR-131).
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

/** Los campos que se revisan en el último paso. */
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
  stock: string;
  activo: boolean;
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
  activo: true,
};

export function CargarConCamara() {
  const tienda = useTiendaActiva();
  const puede = usePuede();
  const navegar = useNavigate();
  const queryClient = useQueryClient();
  const entrada = useRef<HTMLInputElement>(null);

  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [fotos, setFotos] = useState<readonly Foto[]>([]);
  const [campos, setCampos] = useState<Campos>(VACIO);
  const [talles, setTalles] = useState<readonly string[]>([]);
  const [propuestos, setPropuestos] = useState<readonly string[]>([]);
  const [talleNuevo, setTalleNuevo] = useState('');
  const [etiqueta, setEtiqueta] = useState<FichaDeIA['label']>(undefined);
  const [leyendo, setLeyendo] = useState(false);
  const [avisoDeIA, setAvisoDeIA] = useState<string | null>(null);
  /** Se comprueba una vez: sin credencial no tiene sentido reintentar por foto. */
  const [sinIA, setSinIA] = useState(false);
  const [errorDeGuardado, setErrorDeGuardado] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<string | null>(null);

  const categorias = useQuery({
    queryKey: ['categorias', tienda.id],
    queryFn: () => repositorioCatalogo(db).categorias(tienda.id),
  });

  /*
   * `settings.write` y no `catalog.write`: el alta gasta la clave de OpenAI del
   * comercio, y la credencial la entrega `ai_credential_secret`, que ya exige
   * ese permiso (ADR-131). Fotografiar un producto que **ya existe** sigue
   * necesitando sólo `catalog.write`: eso es «Sin foto», que no gasta nada.
   */
  const escribe = puede('settings.write');
  const skuEfectivo = campos.sku.trim() || skuSugerido(campos.handle);

  const cambiar = (parte: Partial<Campos>) => setCampos((previos) => ({ ...previos, ...parte }));

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
      const propuesta = await limpiarFondo(tienda.id, url);
      const { archivo, width, height } = await normalizarFoto(propuesta);
      const subida = await subirImagenDeProducto(db, tienda.tenantId, archivo, 'ia');
      tocar(id, { limpia: { url: subida.url, ancho: width, alto: height }, estado: 'lista' });
    } catch (causa) {
      if (causa instanceof ErrorDeIA && causa.codigo === 'sin_credencial') setSinIA(true);
      tocar(id, { estado: 'lista', usar: 'original', motivo: (causa as Error).message });
    }
  };

  const agregar = async (archivos: readonly File[]) => {
    for (const original of archivos) {
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
    setCampos((previos) => ({
      ...previos,
      title: title || previos.title,
      handle: title ? slugify(title) : previos.handle,
      description: ficha.description ?? previos.description,
      brand: ficha.brand ?? previos.brand,
      categoryId: ficha.categoryId ?? previos.categoryId,
    }));
    setPropuestos(ficha.sizes ?? []);
    setTalles(ficha.sizes ?? []);
    setEtiqueta(ficha.label);
  };

  const guardar = useMutation({
    mutationFn: async () => {
      const variantes = variantesDelAlta({
        sku: skuEfectivo,
        talles,
        precio: Number(campos.precio),
        ...(campos.costo.trim() === '' ? {} : { costo: Number(campos.costo) }),
        ...(campos.stock.trim() === '' ? {} : { stock: Number(campos.stock) }),
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
        status: campos.activo ? 'active' : 'draft',
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
        media: fotos
          .filter((f) => f.estado !== 'error')
          // El texto alternativo es el nombre del producto: es lo que describe la
          // foto, y el esquema lo exige. Sin esto el alta fallaba entera.
          .map((f) => ({ ...elegida(f), alt: campos.title.trim() })),
      });

      if (!revisado.success) {
        throw new Error(motivoDelRechazo(revisado.error.issues[0]));
      }

      return repositorioAdminCatalogo(db).guardar(
        tienda.id,
        productoParaGuardar(revisado.data, tienda.currency as 'PYG'),
      );
    },
    onSuccess: async () => {
      setErrorDeGuardado(null);
      setGuardado(campos.title.trim());
      await queryClient.invalidateQueries({ queryKey: ['productos', tienda.id] });
    },
    onError: (causa: Error) => setErrorDeGuardado(causa.message),
  });

  /** El siguiente producto de la tanda: la marca, la categoría y el precio se repiten. */
  const siguiente = () => {
    setFotos([]);
    setTalles([]);
    setPropuestos([]);
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
      activo: previos.activo,
    }));
    setPaso(1);
  };

  const subiendo = fotos.some((f) => f.estado === 'subiendo');
  const listas = fotos.filter((f) => f.estado !== 'error' && f.originalUrl !== '');

  if (!escribe) {
    return (
      <PaginaAdmin titulo="Cargar con la cámara" icono={CameraIcon}>
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
      icono={CameraIcon}
      descripcion="Sacale una foto al producto y revisá la ficha que propone la IA. Nada se guarda hasta que lo confirmes."
    >
      <ol className="text-muted-foreground flex max-w-3xl gap-2 text-xs" aria-label="Pasos">
        {['Fotos', 'Elegir la foto', 'Revisar la ficha'].map((nombre, i) => (
          <li
            key={nombre}
            aria-current={paso === i + 1 ? 'step' : undefined}
            className={cn(
              'flex-1 border-t-2 pt-1.5',
              paso === i + 1 ? 'border-primary text-foreground font-medium' : 'border-border',
            )}
          >
            {i + 1}. {nombre}
          </li>
        ))}
      </ol>

      {guardado ? (
        <Tarjeta>
          <EstadoVacio
            titulo={`«${guardado}» quedó cargado`}
            accion={
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="lg" onClick={siguiente}>
                  <CameraIcon aria-hidden="true" />
                  Cargar otro
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => void navegar({ to: '/productos' })}
                >
                  Ir al listado
                </Button>
              </div>
            }
          >
            {campos.activo
              ? 'Ya se ve en la tienda. El siguiente arranca con la misma marca, categoría y precio.'
              : 'Quedó como borrador: se publica desde el listado.'}
          </EstadoVacio>
        </Tarjeta>
      ) : (
        <div className="flex max-w-3xl flex-col gap-5">
          {paso === 1 && (
            <Tarjeta sinRelleno>
              <TituloDeTarjeta>Sacale una foto al producto</TituloDeTarjeta>
              <div className="flex flex-col gap-4 p-4">
                <p className="text-muted-foreground text-sm">
                  Con la etiqueta a la vista en alguna de las fotos, la IA puede leer el talle, el
                  precio y el código. Sacá hasta tres.
                </p>

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

                <button
                  type="button"
                  disabled={subiendo}
                  onClick={() => entrada.current?.click()}
                  className={buttonVariants({ size: 'lg', className: 'w-full' })}
                >
                  <CameraIcon aria-hidden="true" />
                  {subiendo ? 'Subiendo…' : fotos.length === 0 ? 'Tomar foto' : 'Tomar otra'}
                </button>

                {fotos.length > 0 && (
                  <ul aria-label="Fotos tomadas" className="grid grid-cols-3 gap-3">
                    {fotos.map((foto) => (
                      <li key={foto.id} className="flex flex-col gap-1">
                        {foto.originalUrl ? (
                          <img
                            src={foto.originalUrl}
                            alt="Foto tomada"
                            className="bg-muted aspect-square w-full rounded-md object-contain"
                          />
                        ) : (
                          <div className="bg-muted aspect-square w-full animate-pulse rounded-md" />
                        )}
                        <span className="text-muted-foreground text-xs">
                          {foto.estado === 'subiendo'
                            ? 'Subiendo…'
                            : foto.estado === 'limpiando'
                              ? 'Limpiando el fondo…'
                              : foto.estado === 'error'
                                ? 'No se pudo subir'
                                : 'Lista'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <Button
                  size="lg"
                  disabled={listas.length === 0 || subiendo}
                  onClick={() => {
                    setPaso(2);
                    void leerFicha(listas.map((f) => f.originalUrl));
                  }}
                >
                  Continuar
                </Button>
              </div>
            </Tarjeta>
          )}

          {paso === 2 && (
            <Tarjeta sinRelleno>
              <TituloDeTarjeta>Elegí cuál se publica</TituloDeTarjeta>
              <div className="flex flex-col gap-4 p-4">
                <p className="text-muted-foreground text-sm">
                  La versión con el fondo limpio la redibuja la IA: mirá que el producto, los logos
                  y los textos hayan quedado iguales. La original no se borra.
                </p>

                <ul aria-label="Fotos para elegir" className="flex flex-col gap-4">
                  {listas.map((foto) => (
                    <li key={foto.id} className="flex flex-col gap-2">
                      <div className="grid grid-cols-2 gap-3">
                        <ElegirFoto
                          src={foto.originalUrl}
                          alt="Foto original"
                          titulo="Original"
                          elegida={foto.usar === 'original'}
                          onElegir={() => tocar(foto.id, { usar: 'original' })}
                        />
                        {foto.limpia ? (
                          <ElegirFoto
                            src={foto.limpia.url}
                            alt="Foto con el fondo limpio"
                            titulo="Fondo limpio"
                            elegida={foto.usar === 'limpia'}
                            onElegir={() => tocar(foto.id, { usar: 'limpia' })}
                          />
                        ) : (
                          <div className="bg-muted text-muted-foreground flex aspect-square w-full items-center justify-center rounded-md p-3 text-center text-xs">
                            {foto.estado === 'limpiando'
                              ? 'Limpiando el fondo…'
                              : (foto.motivo ?? 'Sin versión limpia')}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="self-start"
                        onClick={() => setFotos((p) => p.filter((f) => f.id !== foto.id))}
                      >
                        <Trash2Icon aria-hidden="true" />
                        Quitar esta foto
                      </Button>
                    </li>
                  ))}
                </ul>

                <div className="flex gap-2">
                  <Button variant="outline" size="lg" onClick={() => setPaso(1)}>
                    {listas.length === 0 ? 'Sacar una foto' : 'Volver'}
                  </Button>
                  {/*
                    Sin fotos no se sigue: un producto sin foto nace oculto de la
                    vitrina (ADR-112), que es justo lo que la fase anterior vino a
                    arreglar.
                  */}
                  <Button
                    size="lg"
                    className="flex-1"
                    disabled={listas.length === 0}
                    onClick={() => setPaso(3)}
                  >
                    Continuar
                  </Button>
                </div>
              </div>
            </Tarjeta>
          )}

          {paso === 3 && (
            <>
              <Tarjeta sinRelleno>
                <TituloDeTarjeta>Revisá la ficha</TituloDeTarjeta>
                <div className="flex flex-col gap-4 p-4">
                  {leyendo && (
                    <p
                      className="text-muted-foreground flex items-center gap-2 text-sm"
                      aria-live="polite"
                    >
                      <SparklesIcon aria-hidden="true" />
                      Leyendo las fotos…
                    </p>
                  )}
                  {avisoDeIA && (
                    <p className="text-muted-foreground text-sm" role="status">
                      La IA no pudo proponer la ficha: {avisoDeIA} Podés completarla a mano.
                    </p>
                  )}

                  <Campo id="alta-title" label="Nombre del producto">
                    <Input
                      id="alta-title"
                      value={campos.title}
                      onChange={(e) =>
                        cambiar({ title: e.target.value, handle: slugify(e.target.value) })
                      }
                    />
                  </Campo>

                  <Campo id="alta-brand" label="Marca">
                    <Input
                      id="alta-brand"
                      value={campos.brand}
                      onChange={(e) => cambiar({ brand: e.target.value })}
                    />
                  </Campo>

                  <Campo id="alta-description" label="Descripción">
                    <textarea
                      id="alta-description"
                      rows={3}
                      value={campos.description}
                      onChange={(e) => cambiar({ description: e.target.value })}
                      className="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
                    />
                  </Campo>

                  <Campo id="alta-categoria" label="Categoría">
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

                  <Talles
                    talles={talles}
                    propuestos={propuestos}
                    nuevo={talleNuevo}
                    onNuevo={setTalleNuevo}
                    onAlternar={(talle) =>
                      setTalles((previos) =>
                        previos.includes(talle)
                          ? previos.filter((t) => t !== talle)
                          : [...previos, talle],
                      )
                    }
                    onAgregar={() => {
                      const talle = talleNuevo.trim();
                      if (talle === '') return;
                      if (!propuestos.includes(talle)) setPropuestos((p) => [...p, talle]);
                      if (!talles.includes(talle)) setTalles((p) => [...p, talle]);
                      setTalleNuevo('');
                    }}
                  />
                </div>
              </Tarjeta>

              <Tarjeta sinRelleno>
                <TituloDeTarjeta>Precio y códigos</TituloDeTarjeta>
                <div className="flex flex-col gap-4 p-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Campo
                      id="alta-precio"
                      label="Precio"
                      /*
                       * El aviso de los separadores no es cosmético: acá se
                       * escribe en guaraníes y «250.000» se lee como 250. El
                       * botón «Usarlo» no tiene ese problema —aplica el número
                       * que leyó la IA, no el texto impreso—, así que el aviso
                       * aparece cuando hay que escribirlo a mano.
                       */
                      ayuda={
                        etiqueta?.price === undefined ? (
                          'Sin puntos ni comas: 250000'
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
                        value={campos.precio}
                        onChange={(e) => cambiar({ precio: e.target.value })}
                      />
                    </Campo>

                    <Campo id="alta-costo" label="Costo (opcional)">
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
                          `Si lo dejás vacío queda ${skuEfectivo || 'el del nombre'}`
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
                      label="Código de barras (opcional)"
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

                    <Campo
                      id="alta-stock"
                      label="Cantidad"
                      ayuda={talles.length > 1 ? 'Se carga esa cantidad en cada talle' : undefined}
                    >
                      <Input
                        id="alta-stock"
                        inputMode="numeric"
                        value={campos.stock}
                        onChange={(e) => cambiar({ stock: e.target.value })}
                      />
                    </Campo>

                    <Campo id="alta-estado" label="Estado">
                      <Selector
                        value={campos.activo ? 'active' : 'draft'}
                        aria-label="Estado"
                        onValueChange={(v) => cambiar({ activo: v === 'active' })}
                      >
                        <SelectItem value="active">Publicado</SelectItem>
                        <SelectItem value="draft">Borrador</SelectItem>
                      </Selector>
                    </Campo>
                  </div>

                  {errorDeGuardado && (
                    <p className="text-destructive text-sm" role="alert">
                      No se pudo guardar: {errorDeGuardado}
                    </p>
                  )}

                  <div className="flex gap-2">
                    <Button variant="outline" size="lg" onClick={() => setPaso(2)}>
                      Volver
                    </Button>
                    <Button
                      size="lg"
                      className="flex-1"
                      disabled={guardar.isPending}
                      onClick={() => guardar.mutate()}
                    >
                      {guardar.isPending ? 'Guardando…' : 'Guardar producto'}
                    </Button>
                  </div>
                </div>
              </Tarjeta>
            </>
          )}
        </div>
      )}
    </PaginaAdmin>
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

  if (campo === 'title' && problema.path.length === 1) return 'Falta el nombre del producto.';
  if (campo === 'precio') return 'Falta el precio, o no es un número.';
  if (campo === 'sku') return 'Falta el SKU.';
  if (campo === 'handle') {
    return 'El nombre no alcanza para armar una dirección: escribí al menos una letra o un número.';
  }
  return `${problema.message} (${problema.path.join('.')})`;
}

/** Una de las dos fotos, con el mismo tamaño que la otra: comparar es el punto. */
function ElegirFoto({
  src,
  alt,
  titulo,
  elegida,
  onElegir,
}: {
  src: string;
  alt: string;
  titulo: string;
  elegida: boolean;
  onElegir: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onElegir}
      aria-pressed={elegida}
      className={cn(
        'flex flex-col gap-1 rounded-md border-2 p-1 text-left',
        elegida ? 'border-primary' : 'border-transparent',
      )}
    >
      <img src={src} alt={alt} className="bg-muted aspect-square w-full rounded object-contain" />
      <span
        className={cn('text-xs', elegida ? 'text-foreground font-medium' : 'text-muted-foreground')}
      >
        {titulo}
        {elegida ? ' · se publica' : ''}
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
        <button type="button" onClick={onUsar} className="text-foreground underline">
          Usarlo
        </button>
      )}
    </span>
  );
}

/** Los talles, para tocar: es lo que evita escribir tres variantes a mano. */
function Talles({
  talles,
  propuestos,
  nuevo,
  onNuevo,
  onAlternar,
  onAgregar,
}: {
  talles: readonly string[];
  propuestos: readonly string[];
  nuevo: string;
  onNuevo: (valor: string) => void;
  onAlternar: (talle: string) => void;
  onAgregar: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Talles</span>
      {propuestos.length > 0 && (
        <ul aria-label="Talles" className="flex flex-wrap gap-2">
          {propuestos.map((talle) => (
            <li key={talle}>
              <button
                type="button"
                aria-pressed={talles.includes(talle)}
                onClick={() => onAlternar(talle)}
                className={cn(
                  'rounded-full border px-3 py-1 text-sm',
                  talles.includes(talle)
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border',
                )}
              >
                {talle}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          value={nuevo}
          aria-label="Agregar un talle"
          placeholder="Agregar un talle"
          onChange={(e) => onNuevo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onAgregar();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={onAgregar}>
          Agregar
        </Button>
      </div>
      <span className="text-muted-foreground text-xs">
        {talles.length === 0
          ? 'Sin talles queda una sola variante.'
          : `${talles.length} ${talles.length === 1 ? 'variante' : 'variantes'}, una por talle.`}
      </span>
    </div>
  );
}
