import { existsSync } from 'node:fs';
import { clienteDeServidor } from '@pick/adapter-supabase';
import { configuracionPorDefecto } from '@pick/commerce-core';

/**
 * Provisiona un comercio nuevo: organización, tienda, sucursal y configuración.
 *
 * Es el paso 1 al 4 del flujo de PROJECT.md §6, que es la parte que vive en la
 * base. Los pasos que siguen —dominio, Worker, secretos, deploy— son de
 * infraestructura y están en INFRAESTRUCTURA.md; no se automatizan acá porque
 * hoy son cuatro clicks por cliente y un provisioner completo es P-005.
 *
 *   pnpm tienda:crear <slug> <nombre> [dominio] [moneda] [locale]
 *
 * Idempotente por slug: correrlo dos veces no duplica nada, y sirve para
 * corregir el nombre o el dominio de una tienda ya creada.
 *
 * Usa la secret key porque no hay usuario detrás: la organización todavía no
 * tiene miembros, así que ninguna política le daría permiso a nadie.
 */

if (existsSync('.env')) process.loadEnvFile('.env');

const [slug, nombre, dominio, moneda = 'PYG', locale = 'es-PY'] = process.argv.slice(2);

if (!slug || !nombre) {
  console.error('Uso: pnpm tienda:crear <slug> <nombre> [dominio] [moneda] [locale]');
  console.error("Ejemplo: pnpm tienda:crear estilosport 'Estilo Sport' estilosport.com.py");
  process.exit(1);
}

if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error('El slug sólo admite minúsculas, números y guiones.');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY.');
  process.exit(1);
}

const db = clienteDeServidor({ url, secretKey });

// 1. Organización. El slug es la clave natural: repetir el comando la actualiza.
const { data: org, error: errorOrg } = await db
  .from('organizations')
  .upsert({ name: nombre, slug }, { onConflict: 'slug' })
  .select('id')
  .single();

if (errorOrg || !org) {
  console.error(`No se pudo crear la organización: ${errorOrg?.message}`);
  process.exit(1);
}

// 2. Tienda. Una por organización al provisionar; las demás se agregan después.
const { data: existente } = await db
  .from('stores')
  .select('id')
  .eq('tenant_id', org.id)
  .eq('slug', 'principal')
  .maybeSingle();

const { data: tienda, error: errorTienda } = await db
  .from('stores')
  .upsert({
    ...(existente ? { id: existente.id } : {}),
    tenant_id: org.id,
    name: nombre,
    slug: 'principal',
    // El dominio es lo que resuelve el tenant en runtime, y tiene que coincidir
    // con el `STOREFRONT_DOMAIN` del Worker (ADR-052, ADR-062).
    ...(dominio ? { domain: dominio } : {}),
    currency: moneda,
    locale,
  })
  .select('id')
  .single();

if (errorTienda || !tienda) {
  console.error(`No se pudo crear la tienda: ${errorTienda?.message}`);
  process.exit(1);
}

// 3. Sucursal. Sin al menos una, guardar un producto con stock falla — a
// propósito, desde que el descarte silencioso costó un producto invendible.
const { data: sucursal } = await db
  .from('locations')
  .select('id')
  .eq('store_id', tienda.id)
  .limit(1)
  .maybeSingle();

if (!sucursal) {
  const { error } = await db
    .from('locations')
    .insert({ tenant_id: org.id, store_id: tienda.id, name: 'Casa matriz' });
  if (error) {
    console.error(`No se pudo crear la sucursal: ${error.message}`);
    process.exit(1);
  }
}

// 4. Configuración por defecto: cobra en su moneda, sin conversión, y con
// transferencia bancaria habilitada. Una tienda recién creada tiene que poder
// vender antes de que nadie entre a configurarla.
const { error: errorSettings } = await db.from('store_settings').upsert(
  {
    store_id: tienda.id,
    tenant_id: org.id,
    settings: {
      currency: configuracionPorDefecto(moneda),
      payments: { enabled: ['bank_transfer'], default: 'bank_transfer' },
    },
  },
  { onConflict: 'store_id' },
);

if (errorSettings) {
  console.error(`No se pudo crear la configuración: ${errorSettings.message}`);
  process.exit(1);
}

console.log(`Organización  ${org.id}  (${slug})`);
console.log(`Tienda        ${tienda.id}  ${dominio ?? 'sin dominio'}`);
console.log('');
console.log('Falta el propietario, que necesita credenciales:');
console.log(`  pnpm admin:crear <email> <password> owner ${slug}`);
