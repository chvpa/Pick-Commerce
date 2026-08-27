import { readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Aplica una migración al proyecto remoto.
 *
 * Va por la API de Management y no por `supabase db push`, que necesita la
 * password de la base; ésta sólo necesita `SUPABASE_ACCESS_TOKEN`.
 *
 * Dos cosas que cuestan tiempo si no se saben:
 *
 * - La API está detrás de Cloudflare y **rechaza el user-agent de `urllib` de
 *   Python** con un 403 y `error code: 1010`. Con `curl` funciona.
 * - El endpoint asigna él la versión, que no es el timestamp del archivo. Si no
 *   se sincronizan, un `supabase db push` futuro daría la migración por
 *   pendiente y la reaplicaría entera. Por eso al final el archivo se renombra
 *   a la versión que asignó el servidor.
 */
const archivo = process.argv[2];
if (!archivo) {
  console.error('Uso: pnpm db:apply supabase/migrations/<archivo>.sql');
  process.exit(1);
}

process.loadEnvFile('.env');

const REF = process.env.SUPABASE_PROJECT_REF ?? 'snnbkqesjiooejaccqhg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!TOKEN) {
  console.error('Falta SUPABASE_ACCESS_TOKEN. Se obtiene en');
  console.error('https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}

// El token tiene los privilegios de la cuenta entera, no de un proyecto.
console.log(`Aplicando ${basename(archivo)} a ${REF}`);

const nombre = basename(archivo)
  .replace(/^\d+_/, '')
  .replace(/\.sql$/, '');
const payload = join(tmpdir(), `pick-migracion-${process.pid}.json`);
writeFileSync(payload, JSON.stringify({ query: readFileSync(archivo, 'utf8'), name: nombre }));

let respuesta;
try {
  respuesta = execFileSync(
    'curl',
    [
      '-s',
      '-X',
      'POST',
      '-H',
      `Authorization: Bearer ${TOKEN}`,
      '-H',
      'Content-Type: application/json',
      '--data-binary',
      `@${payload}`,
      `https://api.supabase.com/v1/projects/${REF}/database/migrations`,
    ],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  );
} finally {
  unlinkSync(payload);
}

// Éxito devuelve `[]`; un error, un objeto con `message`.
const cuerpo = respuesta.trim() === '' ? [] : JSON.parse(respuesta);
if (!Array.isArray(cuerpo)) {
  console.error(cuerpo.message ?? respuesta);
  process.exit(1);
}

// El GET de `/database/migrations` devuelve vacío; la versión asignada está en
// la tabla que el propio CLI consulta.
const historial = JSON.parse(
  execFileSync(
    'curl',
    [
      '-s',
      '-X',
      'POST',
      '-H',
      `Authorization: Bearer ${TOKEN}`,
      '-H',
      'Content-Type: application/json',
      '--data-binary',
      JSON.stringify({
        query: 'select version, name from supabase_migrations.schema_migrations order by version',
      }),
      `https://api.supabase.com/v1/projects/${REF}/database/query`,
    ],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  ),
);

const version = historial
  .filter((m) => m.name === nombre)
  .map((m) => m.version)
  .sort()
  .at(-1);
if (!version) {
  console.error('La migración se aplicó pero no aparece en el historial.');
  process.exit(1);
}

const destino = join(dirname(archivo), `${version}_${nombre}.sql`);
if (destino !== archivo) {
  renameSync(archivo, destino);
  console.log(`Aplicada. Renombrada a ${basename(destino)} para igualar la versión remota.`);
} else {
  console.log('Aplicada.');
}
