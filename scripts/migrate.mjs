/**
 * Applique les migrations SQL de supabase/migrations dans l'ordre des noms.
 *
 * Les migrations déjà passées sont mémorisées dans `public.schema_migrations`,
 * et chaque fichier s'exécute dans une transaction : un échec ne laisse pas la
 * base à moitié migrée.
 *
 *   node --env-file=.env.local scripts/migrate.mjs
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');

// L'URL non poolée : les migrations font du DDL, qui n'aime pas pgbouncer.
const connectionString = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
if (!connectionString) {
  console.error('POSTGRES_URL_NON_POOLING absent. Lancer avec --env-file=.env.local');
  process.exit(1);
}

// Supabase signe ses serveurs Postgres avec sa propre autorité racine, absente
// du magasin système : on l'épingle explicitement plutôt que de désactiver la
// vérification du certificat.
const ca = await readFile(path.join(import.meta.dirname, 'supabase-ca.crt'), 'utf8');

// `sslmode` dans l'URL prend le pas sur l'option `ssl` de pg et ferait ignorer
// le CA épinglé : on l'enlève et on configure TLS explicitement.
const dsn = new URL(connectionString);
dsn.searchParams.delete('sslmode');

const client = new pg.Client({
  connectionString: dsn.toString(),
  ssl: { ca, rejectUnauthorized: true, servername: dsn.hostname },
});
await client.connect();

await client.query(`
  create table if not exists public.schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )
`);

const { rows } = await client.query('select name from public.schema_migrations');
const applied = new Set(rows.map((r) => r.name));

const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
let count = 0;

for (const file of files) {
  if (applied.has(file)) {
    console.log(`= ${file} (déjà appliquée)`);
    continue;
  }
  const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('insert into public.schema_migrations (name) values ($1)', [file]);
    await client.query('commit');
    console.log(`+ ${file}`);
    count++;
  } catch (err) {
    await client.query('rollback');
    console.error(`\n✗ ${file} a échoué, rien n'a été appliqué :\n  ${err.message}`);
    await client.end();
    process.exit(1);
  }
}

console.log(count === 0 ? 'Base déjà à jour.' : `${count} migration(s) appliquée(s).`);
await client.end();
