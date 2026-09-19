/**
 * Compare le type `Database` de `src/lib/supabase.ts` au SQL de
 * `supabase/migrations/`, et signale les écarts.
 *
 *   node scripts/check-schema-types.mjs
 *
 * Le type est écrit à la main : rien, aujourd'hui, ne prévient qu'il a divergé
 * du schéma. Ce script est ce garde-fou. Il ne remplace pas `supabase gen
 * types` — il ne lit ni les types de colonnes, ni les contraintes, ni les
 * valeurs par défaut — mais il attrape le seul oubli qui se produit vraiment :
 * une table ou une colonne ajoutée d'un côté et pas de l'autre.
 *
 * Il ne se connecte à rien : tout est lu sur le disque. Sort en code 1 dès
 * qu'un écart est trouvé.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const RACINE = path.join(import.meta.dirname, '..');
const MIGRATIONS = path.join(RACINE, 'supabase', 'migrations');
const TYPES = path.join(RACINE, 'src', 'lib', 'supabase.ts');

/**
 * Tables volontairement absentes du type TS : elles vivent dans `public` —
 * donc PostgREST les voit — mais RLS les ferme sans aucune policy, et
 * l'application n'a aucune raison de les connaître.
 *
 * - `schema_migrations` : journal de `migrate.mjs`.
 * - `join_team_attempts` : compteur du frein de `join_team`. Le rendre lisible
 *   dirait à l'appelant où il en est de son quota, donc quand relancer.
 */
const TABLES_HORS_TYPE = new Set(['schema_migrations', 'join_team_attempts']);

/**
 * Colonnes présentes en base mais délibérément absentes du type. Vide
 * aujourd'hui ; c'est ici qu'on déclare une exception, avec son motif, plutôt
 * que d'affaiblir le script.
 */
const COLONNES_HORS_TYPE = new Map();

// --------------------------------------------------------------------------
// Lecture du SQL
// --------------------------------------------------------------------------

/**
 * Découpe une liste d'arguments SQL sur les virgules de premier niveau. Un
 * `check (x between 1 and 10)` ou un `'{"a": 1}'::jsonb` contient des virgules
 * qui ne séparent rien : les parenthèses et les littéraux doivent être suivis.
 */
function decouperPremierNiveau(corps) {
  const morceaux = [];
  let courant = '';
  let profondeur = 0;
  let dansChaine = false;
  let dollar = null;

  for (let i = 0; i < corps.length; i++) {
    const c = corps[i];

    if (dollar) {
      courant += c;
      if (corps.startsWith(dollar, i)) {
        courant += corps.slice(i + 1, i + dollar.length);
        i += dollar.length - 1;
        dollar = null;
      }
      continue;
    }
    if (dansChaine) {
      courant += c;
      if (c === "'") dansChaine = false;
      continue;
    }

    const baliseDollar = /^\$[a-z_]*\$/i.exec(corps.slice(i));
    if (baliseDollar) {
      dollar = baliseDollar[0];
      courant += dollar;
      i += dollar.length - 1;
      continue;
    }
    if (c === "'") {
      dansChaine = true;
      courant += c;
      continue;
    }
    if (c === '(') profondeur++;
    if (c === ')') profondeur--;
    if (c === ',' && profondeur === 0) {
      morceaux.push(courant);
      courant = '';
      continue;
    }
    courant += c;
  }
  morceaux.push(courant);
  return morceaux.map((m) => m.trim()).filter(Boolean);
}

/** Vrai si le morceau est une contrainte de table et non une définition de colonne. */
const estContrainte = (morceau) =>
  /^(primary\s+key|foreign\s+key|unique|check|constraint|exclude|like)\b/i.test(morceau);

/** Retire commentaires de ligne et de bloc, pour ne pas lire du SQL commenté. */
const sansCommentaires = (sql) => sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Lit les migrations dans l'ordre des noms — l'ordre dans lequel `migrate.mjs`
 * les applique — et rejoue `create table` / `alter table ... add column` /
 * `drop column` pour reconstituer l'état du schéma `public`.
 */
async function lireSchemaSql() {
  const fichiers = (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort();
  const tables = new Map();

  for (const fichier of fichiers) {
    const sql = sansCommentaires(await readFile(path.join(MIGRATIONS, fichier), 'utf8'));

    for (const m of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)\s*\(([\s\S]*?)\n\s*\);/gi,
    )) {
      const colonnes = new Set();
      for (const morceau of decouperPremierNiveau(m[2])) {
        if (estContrainte(morceau)) continue;
        const nom = /^"?(\w+)"?\s/.exec(morceau);
        if (nom) colonnes.add(nom[1]);
      }
      tables.set(m[1], colonnes);
    }

    for (const m of sql.matchAll(
      /alter\s+table\s+(?:only\s+)?public\.(\w+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?"?(\w+)"?/gi,
    )) {
      tables.get(m[1])?.add(m[2]);
    }

    for (const m of sql.matchAll(
      /alter\s+table\s+(?:only\s+)?public\.(\w+)\s+drop\s+column\s+(?:if\s+exists\s+)?"?(\w+)"?/gi,
    )) {
      tables.get(m[1])?.delete(m[2]);
    }
  }

  return tables;
}

// --------------------------------------------------------------------------
// Lecture du type TypeScript
// --------------------------------------------------------------------------

/** Contenu des accolades ouvertes à `depart`, accolades équilibrées. */
function bloc(source, depart) {
  const ouvrante = source.indexOf('{', depart);
  if (ouvrante < 0) return '';
  let profondeur = 0;
  for (let i = ouvrante; i < source.length; i++) {
    if (source[i] === '{') profondeur++;
    if (source[i] === '}' && --profondeur === 0) return source.slice(ouvrante + 1, i);
  }
  return '';
}

/**
 * Extrait `Tables.<nom>.Row` du type `Database`. C'est `Row` qui décrit la
 * table telle qu'elle est ; `Insert` et `Update` n'en sont que des vues
 * partielles, légitimement incomplètes.
 */
function lireSchemaTs(source) {
  const tables = new Map();
  const corpsTables = bloc(source, source.indexOf('Tables: {'));

  // Une table par entrée de premier niveau de `Tables`.
  let profondeur = 0;
  let nomCourant = null;
  let debutCorps = 0;

  for (let i = 0; i < corpsTables.length; i++) {
    if (corpsTables[i] === '{') {
      if (profondeur === 0) {
        const entete = /(\w+)\s*:\s*$/.exec(corpsTables.slice(0, i));
        nomCourant = entete ? entete[1] : null;
        debutCorps = i;
      }
      profondeur++;
    } else if (corpsTables[i] === '}') {
      profondeur--;
      if (profondeur === 0 && nomCourant) {
        const corps = corpsTables.slice(debutCorps, i + 1);
        const row = bloc(corps, corps.indexOf('Row:'));
        const colonnes = new Set();
        for (const m of row.matchAll(/^\s*(\w+)\??\s*:/gm)) colonnes.add(m[1]);
        tables.set(nomCourant, colonnes);
        nomCourant = null;
      }
    }
  }

  return tables;
}

/** Noms des fonctions déclarées dans `Functions` du type `Database`. */
function lireFonctionsTs(source) {
  const corps = bloc(source, source.indexOf('Functions: {'));
  const noms = new Set();
  let profondeur = 0;
  for (let i = 0; i < corps.length; i++) {
    if (corps[i] === '{') {
      if (profondeur === 0) {
        const entete = /(\w+)\s*:\s*$/.exec(corps.slice(0, i));
        if (entete) noms.add(entete[1]);
      }
      profondeur++;
    } else if (corps[i] === '}') profondeur--;
  }
  return noms;
}

/**
 * Fonctions du schéma `public` exécutables par `authenticated` : ce sont les
 * seules que PostgREST expose, donc les seules que le type doit décrire. Une
 * fonction `private.*` n'a rien à y faire.
 */
async function lireFonctionsSql() {
  const fichiers = (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort();
  const exposees = new Set();

  for (const fichier of fichiers) {
    const sql = sansCommentaires(await readFile(path.join(MIGRATIONS, fichier), 'utf8'));
    for (const m of sql.matchAll(
      /grant\s+execute\s+on\s+function\s+public\.(\w+)\s*\([^)]*\)\s+to\s+([^;]+);/gi,
    )) {
      if (/\bauthenticated\b|\banon\b/i.test(m[2])) exposees.add(m[1]);
    }
    for (const m of sql.matchAll(
      /revoke\s+execute\s+on\s+function\s+public\.(\w+)\s*\([^)]*\)\s+from\s+([^;]+);/gi,
    )) {
      if (/\bauthenticated\b/i.test(m[2])) exposees.delete(m[1]);
    }
  }
  return exposees;
}

// --------------------------------------------------------------------------
// Comparaison
// --------------------------------------------------------------------------

const ecarts = [];
const signaler = (message) => ecarts.push(message);

const sql = await lireSchemaSql();
const source = await readFile(TYPES, 'utf8');
const ts = lireSchemaTs(source);

if (sql.size === 0)
  throw new Error('Aucune table lue dans supabase/migrations : le script est cassé.');
if (ts.size === 0)
  throw new Error('Aucune table lue dans le type `Database` : le script est cassé.');

for (const [table, colonnes] of sql) {
  if (TABLES_HORS_TYPE.has(table)) continue;
  if (!ts.has(table)) {
    signaler(`table \`${table}\` présente en SQL, absente du type Database`);
    continue;
  }
  const declarees = ts.get(table);
  const tolerees = COLONNES_HORS_TYPE.get(table) ?? new Set();
  for (const colonne of colonnes) {
    if (!declarees.has(colonne) && !tolerees.has(colonne)) {
      signaler(`\`${table}.${colonne}\` présente en SQL, absente de Row`);
    }
  }
  for (const colonne of declarees) {
    if (!colonnes.has(colonne)) {
      signaler(`\`${table}.${colonne}\` déclarée dans Row, absente du SQL`);
    }
  }
}

for (const table of ts.keys()) {
  if (!sql.has(table))
    signaler(`table \`${table}\` déclarée dans le type Database, absente du SQL`);
}

const fonctionsSql = await lireFonctionsSql();
const fonctionsTs = lireFonctionsTs(source);
for (const fn of fonctionsSql) {
  if (!fonctionsTs.has(fn))
    signaler(`fonction \`public.${fn}()\` exposée par le SQL, absente de Functions`);
}
for (const fn of fonctionsTs) {
  if (!fonctionsSql.has(fn))
    signaler(`fonction \`${fn}\` déclarée dans Functions, non exposée par le SQL`);
}

// --------------------------------------------------------------------------
// Sortie
// --------------------------------------------------------------------------

console.log(
  `Schéma : ${sql.size} table(s) en SQL, ${ts.size} dans le type Database ` +
    `(${fonctionsSql.size} fonction(s) exposée(s)).\n`,
);

if (ecarts.length === 0) {
  console.log('  ok  le type `Database` et les migrations concordent.');
  process.exit(0);
}

for (const ecart of ecarts) console.log(`  ÉCART  ${ecart}`);
console.log(
  `\n${ecarts.length} écart(s). Mettre à jour \`src/lib/supabase.ts\`, ` +
    "ou déclarer l'exception en tête de ce script si elle est délibérée.",
);
process.exit(1);
