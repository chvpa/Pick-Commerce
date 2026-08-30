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

  console.log(`  storefront del smoke: «${NOMBRE_E2E}», envío ${ENVIO_E2E.amount}`);
}
