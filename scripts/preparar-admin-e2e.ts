import { existsSync } from 'node:fs';
import { clienteDeServidor } from '@pick/adapter-supabase';
import { IDS } from './seed-data.ts';
import { ADMIN_E2E, TIENDA_E2E } from './datos-admin-e2e.ts';

/**
 * Lo que el smoke del Admin necesita en la base y el seed no siembra.
 *
 * Dos cosas, y las dos existen por un motivo concreto:
 *
 * 1. **Un usuario.** El Admin vive detrás de un login y las credenciales no
 *    pueden estar en el repo, así que se crean acá con la secret key. El correo
 *    lleva el dominio `@e2e.test`, que es el mismo marcador que usa
 *    `limpiar-e2e.ts` para saber qué borrar.
 * 2. **Una segunda tienda.** El selector de tiendas dibuja una variante inerte
 *    cuando hay una sola —no hay nada que elegir— y el menú de verdad recién
 *    aparece con dos. Sin esto, el test pasaría sin haber ejercitado el menú
 *    que se rompió, que es exactamente el agujero que dejó pasar el fallo.
 *
 * Idempotente: repetirlo no duplica nada.
 *
 * Es un script aparte y no parte del `globalSetup` por lo mismo que
 * `limpiar-e2e.ts`: el cliente de Supabase deja sockets con keep-alive abiertos
 * y en Windows eso tumbaba el proceso de Playwright con una aserción de libuv.
 */

if (existsSync('.env')) process.loadEnvFile('.env');

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !secretKey) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY.');
  process.exitCode = 1;
} else {
  const db = clienteDeServidor({ url, secretKey });

  const { data: creado, error } = await db.auth.admin.createUser({
    email: ADMIN_E2E.email,
    password: ADMIN_E2E.password,
    email_confirm: true,
  });

  let userId = creado?.user?.id;
  if (error) {
    // Ya existía: es el caso normal al repetir la corrida.
    const { data: existentes } = await db.auth.admin.listUsers();
    userId = existentes?.users.find((u) => u.email === ADMIN_E2E.email)?.id;
  }

  if (!userId) {
    console.error(`No se pudo preparar el usuario del smoke: ${error?.message}`);
    process.exitCode = 1;
  } else {
    await db
      .from('memberships')
      .upsert(
        { tenant_id: IDS.tenant, user_id: userId, role: 'owner' },
        { onConflict: 'tenant_id,user_id' },
      );

    const { error: errorTienda } = await db.from('stores').upsert({
      id: TIENDA_E2E.id,
      tenant_id: IDS.tenant,
      name: TIENDA_E2E.name,
      slug: TIENDA_E2E.slug,
      currency: 'PYG',
      locale: 'es-PY',
    });

    if (errorTienda) {
      console.error(`No se pudo crear la segunda tienda: ${errorTienda.message}`);
      process.exitCode = 1;
    } else {
      console.log(`  admin del smoke: ${ADMIN_E2E.email} · segunda tienda: ${TIENDA_E2E.slug}`);
    }
  }
}
