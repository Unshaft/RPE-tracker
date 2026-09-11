/**
 * Exécute une requête SQL ad hoc contre la base (diagnostic / vérification).
 *
 *   node --env-file=.env.local scripts/db-query.mjs "select 1"
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const sql = process.argv[2];
if (!sql) {
  console.error('Usage: node --env-file=.env.local scripts/db-query.mjs "<sql>"');
  process.exit(1);
}

const ca = await readFile(path.join(import.meta.dirname, 'supabase-ca.crt'), 'utf8');
const dsn = new URL(process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL);
dsn.searchParams.delete('sslmode');

const client = new pg.Client({
  connectionString: dsn.toString(),
  ssl: { ca, rejectUnauthorized: true, servername: dsn.hostname },
});

await client.connect();
const { rows } = await client.query(sql);
console.table(rows);
await client.end();
