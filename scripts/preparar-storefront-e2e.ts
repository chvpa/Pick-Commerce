import { existsSync } from 'node:fs';
import { clienteDeServidor } from '@pick/adapter-supabase';
import { IDS } from './seed-data.ts';

/**
 * Lo que el smoke del storefront necesita en la base y el seed no siembra.
 *
 * Dos cosas:
 *
 * 1. **Un nombre distinto del que sembró el seed.** El storefront tuvo «Pick
 *    Demo» escrito en el código hasta la Fase 12, y la tienda de demostración se
 *    llama exactamente igual: un test que afirmara «el encabezado dice Pick
 *    Demo» pasaría en verde con la constante de vuelta. Con el sufijo, el único
 *    lugar de donde puede salir ese texto es `stores.name`.
 * 2. **Un envío configurado.** Sin él no hay línea de envío que mirar en el
 *    checkout, y el caso de «envío gratis desde» no se ejercita nunca.
 * 3. **Una sección de portada con el orden «Preferencias»**, que es lo que el
 *    Definition of Done pide ver lleno por los tres caminos de la cascada. La
 *    siembra el seed sin orden automático porque ése es el default de un
 *    comercio; acá se le pone el que el smoke necesita.
 * 4. **Dos co-vistas y el recálculo corrido.** La tira de recomendados sale de
 *    `product_affinity`, que se llena con el tráfico real: dejarla librada a lo
 *    que haya quedado de otras corridas haría que el caso pase o falle según el
 *    día. Con esto la relación entre la zapatilla y la campera es un hecho del
 *    fixture, y de paso el `recompute_affinity` se ejercita en cada corrida.
 *
 * Corre **después** de `pnpm seed`, que restituye la tienda tal como estaba, así
 * que repetirlo no acumula sufijos ni deja configuración vieja dando vueltas.
 *
 * Es un script aparte y no parte del `globalSetup` por el mismo motivo que
 * `preparar-admin-e2e.ts`: el cliente de Supabase deja sockets con keep-alive
 * abiertos y en Windows eso tumbaba el proceso de Playwright.
 */

/** Lo comparte el spec, que afirma que el encabezado lo muestra. */
export const NOMBRE_E2E = 'Pick Demo (smoke)';

/**
 * Tarifa y umbral del smoke.
 *
 * El umbral está por encima del precio de la zapatilla —720.000— para que una
 * unidad caiga del lado que **paga** y dos del lado gratis: con 500.000 el
 * primer caso no se ejercitaba nunca y el test pasaba mirando la rama
 * equivocada.
 */
export const ENVIO_E2E = { mode: 'flat', amount: 35_000, freeFrom: 1_000_000 } as const;

/** Los dos productos que el smoke espera ver relacionados. */
export const RELACIONADOS_E2E = ['zapatilla-urbana', 'campera-cortaviento'] as const;

/** La sección de la portada que ordena por preferencias. La borra `limpiar-e2e`. */
export const SECCION_PREFERENCIAS = {
  id: '5eed0000-0000-4000-8000-0000000000af',
  title: 'Para vos',
} as const;

if (existsSync('.env')) process.loadEnvFile('.env');

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !secretKey) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY.');
  process.exitCode = 1;
} else {
  const db = clienteDeServidor({ url, secretKey });

  const { error: errorTienda } = await db
    .from('stores')
    .update({ name: NOMBRE_E2E })
    .eq('id', IDS.store);
  if (errorTienda) throw new Error(`No se pudo renombrar la tienda: ${errorTienda.message}`);

  /*
   * Merge sobre lo que haya: la configuración de moneda y de pagos la siembra el
   * seed, y pisarla entera dejaría el checkout sin forma de pago.
   */
  const { data: actual } = await db
    .from('store_settings')
    .select('settings')
    .eq('store_id', IDS.store)
    .maybeSingle();

  const settings = { ...((actual?.settings as object) ?? {}), shipping: ENVIO_E2E };

  const { error: errorAjustes } = await db
    .from('store_settings')
    .upsert({ store_id: IDS.store, tenant_id: IDS.tenant, settings });
  if (errorAjustes) throw new Error(`No se pudo configurar el envío: ${errorAjustes.message}`);

  /*
   * La sección con el orden automático, sobre la colección dinámica que ya
   * siembra el seed: una regla de marca más un orden, que es exactamente lo que
   * un comercio arma desde el Admin.
   */
  const { error: errorOrden } = await db
    .from('collections')
    .update({ sort: 'preferencias' })
    .eq('id', IDS.coleccionDinamica);
  if (errorOrden) throw new Error(`No se pudo ordenar la colección: ${errorOrden.message}`);

  const { error: errorSeccion } = await db.from('home_sections').upsert({
    id: SECCION_PREFERENCIAS.id,
    tenant_id: IDS.tenant,
    store_id: IDS.store,
    type: 'products',
    title: SECCION_PREFERENCIAS.title,
    layout: 'slider',
    collection_id: IDS.coleccionDinamica,
    position: 90,
    published: true,
  });
  if (errorSeccion) throw new Error(`No se pudo crear la sección: ${errorSeccion.message}`);

  /*
   * La co-vista: una misma visita que mira los dos productos. `session_id` fijo
   * para que repetir la preparación no acumule señal —el recálculo cuenta visitas
   * distintas, no eventos—.
   */
  const { data: productos, error: errorProductos } = await db
    .from('products')
    .select('id, handle')
    .eq('store_id', IDS.store)
    .in('handle', [...RELACIONADOS_E2E]);
  if (errorProductos)
    throw new Error(`No se pudieron leer los productos: ${errorProductos.message}`);

  const SESION_E2E = '5eed0000-0000-4000-8000-0000000000e2';
  await db.from('store_events').delete().eq('session_id', SESION_E2E);

  const { error: errorEventos } = await db.from('store_events').insert(
    (productos ?? []).map((p) => ({
      tenant_id: IDS.tenant,
      store_id: IDS.store,
      session_id: SESION_E2E,
      type: 'product_view',
      path: `/productos/${p.handle}`,
      data: { handle: p.handle, productId: p.id },
    })),
  );
  if (errorEventos)
    throw new Error(`No se pudieron sembrar las co-vistas: ${errorEventos.message}`);

  // Sin ventana: al smoke siempre le toca recalcular.
  const { data: pares, error: errorAfinidad } = await db.rpc('recompute_affinity', {
    p_store_id: IDS.store,
    p_cada: '0 seconds',
  });
  if (errorAfinidad) throw new Error(`No se pudo recalcular la afinidad: ${errorAfinidad.message}`);

  console.log(
    `  storefront del smoke: «${NOMBRE_E2E}», envío ${ENVIO_E2E.amount}, ${pares} pares de afinidad`,
  );
}
