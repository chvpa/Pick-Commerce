import { existsSync } from 'node:fs';
import { clienteDeServidor } from '@pick/adapter-supabase';
import { IDS } from './seed-data.ts';

/**
 * Crea un usuario del Admin y le da acceso a la organización de demostración.
 *
 * Existe porque el seed siembra el catálogo pero no puede sembrar credenciales:
 * un usuario vive en `auth.users`, que administra Supabase. Sin esto no hay
 * forma de entrar al Admin en un proyecto recién creado.
 *
 * Las credenciales se pasan por argumento y **no viven en el repo**: un
 * usuario y una contraseña commiteados terminan, tarde o temprano, existiendo
 * en producción.
 *
 *   pnpm admin:crear alguien@ejemplo.com 'una-contraseña-larga'
 */
if (existsSync('.env')) process.loadEnvFile('.env');

const [email, password, rolCrudo] = process.argv.slice(2);
const rol = rolCrudo ?? 'owner';

if (!email || !password) {
  console.error('Uso: pnpm admin:crear <email> <password> [rol]');
  console.error('Roles: owner, admin, staff, viewer');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY.');
  process.exit(1);
}

const db = clienteDeServidor({ url, secretKey });

// `email_confirm` para saltear el correo de verificación: es un entorno de
// desarrollo y no hay bandeja donde recibirlo.
const { data, error } = await db.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});

let userId = data?.user?.id;

if (error) {
  // Ya existir es el caso normal al repetir el comando: se busca y se sigue.
  const { data: existentes } = await db.auth.admin.listUsers();
  userId = existentes?.users.find((u) => u.email === email)?.id;
  if (!userId) {
    console.error(`No se pudo crear el usuario: ${error.message}`);
    process.exit(1);
  }
  console.log(`El usuario ya existía: ${email}`);
} else {
  console.log(`Usuario creado: ${email}`);
}

const { error: errorMembresia } = await db
  .from('memberships')
  .upsert(
    { tenant_id: IDS.tenant, user_id: userId!, role: rol },
    { onConflict: 'tenant_id,user_id' },
  );

if (errorMembresia) {
  console.error(`No se pudo dar acceso a la organización: ${errorMembresia.message}`);
  process.exit(1);
}

console.log(`Acceso concedido como ${rol} a la organización de demostración.`);
