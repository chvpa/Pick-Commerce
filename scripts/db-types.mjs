import { existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/**
 * Regenera los tipos de la base desde el schema remoto.
 *
 * Va por la API de Management y no por `supabase gen types --local`, que exige
 * Docker. Usa `curl` porque la API está detrás de Cloudflare y rechaza clientes
 * HTTP que no reconoce con un 403 opaco.
 */
if (existsSync('.env')) process.loadEnvFile('.env');

const REF = process.env.SUPABASE_PROJECT_REF ?? 'snnbkqesjiooejaccqhg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!TOKEN) {
  console.error('Falta SUPABASE_ACCESS_TOKEN. Se obtiene en');
  console.error('https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}

const respuesta = execFileSync(
  'curl',
  [
    '-s',
    '-H',
    `Authorization: Bearer ${TOKEN}`,
    `https://api.supabase.com/v1/projects/${REF}/types/typescript`,
  ],
  { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
);

const { types } = JSON.parse(respuesta);
if (!types) {
  console.error('La API no devolvió tipos:', respuesta.slice(0, 200));
  process.exit(1);
}

const destino = 'packages/commerce-types/src/database.generated.ts';
writeFileSync(
  destino,
  `/* eslint-disable */
// Generado desde el schema de Supabase. NO editar a mano.
// Regenerar con: pnpm db:types
//
// Los tipos del dominio viven en index.ts y son los que consume la aplicación.
// Estos describen la base y sólo los usa el adapter.

${types}`,
  'utf8',
);

console.log(`${destino}: ${types.split('\n').length} líneas`);
