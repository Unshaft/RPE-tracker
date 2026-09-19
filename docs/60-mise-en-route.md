# Mise en route développeur

## Prérequis

- **Node ≥ 20.6** — les scripts de base utilisent `node --env-file=` et
  `import.meta.dirname`.
- Un **projet Supabase** (base Postgres + Auth).
- Le **CLI Vercel** si vous voulez récupérer la configuration automatiquement.

## Installation

```bash
npm install
vercel env pull --yes   # écrit .env.local à partir du projet Vercel
npm run dev             # http://localhost:5173
```

`.env*` est ignoré par git : aucun secret n'est versionné.

Si l'application démarre mais lève `Configuration Supabase absente` au
chargement, c'est `src/lib/supabase.ts` qui échoue volontairement tout de suite —
plutôt que de laisser chaque requête partir en erreur réseau opaque une fois
l'utilisateur dans l'app.

## Variables d'environnement

`.env.example` est versionné (`.gitignore` ignore `.env*` **sauf** lui) et fait
foi : chaque variable y est documentée avec son rôle, l'écran de la console
Supabase où la trouver, et son caractère public ou secret. Le tableau ci-dessous
n'en est que le résumé.

| Variable | Utilisée par | Rôle |
|---|---|---|
| `SUPABASE_URL` | build Vite, `smoke-rls.mjs` | URL du projet Supabase |
| `SUPABASE_ANON_KEY` | build Vite, `smoke-rls.mjs` | clé publique, portée bornée par RLS |
| `POSTGRES_URL_NON_POOLING` | `migrate.mjs`, `db-query.mjs` | connexion **directe** (le DDL n'aime pas pgbouncer) |
| `POSTGRES_URL` | idem, en repli | connexion poolée |
| `SUPABASE_SERVICE_ROLE_KEY` | `smoke-rls.mjs` uniquement | **contourne RLS** — jamais côté client |

Ces noms sont ceux que produit l'intégration Supabase de Vercel. `vite.config.ts`
accepte aussi les variantes `NEXT_PUBLIC_SUPABASE_*` et `VITE_SUPABASE_*`.

### Le tour de passe-passe `VITE_`

Vite n'expose au navigateur que les variables préfixées `VITE_`, alors que
l'intégration Vercel fournit `SUPABASE_URL` / `SUPABASE_ANON_KEY`. Plutôt que de
dupliquer les valeurs dans une seconde paire de variables — deux sources de
vérité à garder synchronisées — `vite.config.ts` les **réinjecte** au build sous
le nom attendu (`define`). En local elles viennent de `.env.local`, sur Vercel
de l'environnement de build.

Ces deux valeurs sont **publiques par nature** : l'URL du projet et la clé anon,
dont la portée est bornée par les policies RLS. Elles se retrouvent dans le
bundle, et c'est normal. La clé `service_role`, elle, ne doit jamais y être.

## Réglage Supabase obligatoire

> **« Confirm email » doit être DÉSACTIVÉ** dans
> *Authentication → Sign In / Providers*.

Ce n'est pas un détail. Depuis le commit `98654f4`, l'inscription ouvre la
session immédiatement et crée l'équipe (coach) ou la rejoint (joueur) dans la
foulée. Sans session, RLS interdit toute écriture et le compte serait
inutilisable ; l'application échoue alors explicitement, avec un message qui
nomme ce réglage.

Ce réglage vit dans le tableau de bord Supabase et **n'est pas versionné** :
c'est un point de configuration à refaire sur chaque nouveau projet Supabase.

Deuxième point d'exploitation : le service d'e-mail intégré de Supabase est
plafonné à **2 envois par heure** et n'est prévu que pour le développement.
Avant d'ouvrir l'app à de vrais utilisateurs, configurer un SMTP dans
*Authentication → Emails*. `src/lib/auth.tsx` traduit déjà les messages de
rate-limit en français, pour éviter qu'un utilisateur prenne un plafond d'envoi
pour un bug.

## Scripts npm

| Script | Ce qu'il fait |
|---|---|
| `npm run dev` | serveur de développement, port 5173, exposé sur le réseau (`host: true`) |
| `npm run build` | `tsc -b` puis `vite build` — le typage bloque le build |
| `npm run preview` | sert le build de production |
| `npm test` | tests unitaires (vitest, un passage) |
| `npm run test:watch` | tests en continu |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` / `lint:fix` | ESLint sur `src/`, `scripts/` et la configuration |
| `npm run format` / `format:check` | Prettier, en écriture ou en simple contrôle |
| `npm run check:schema` | concordance du type `Database` et des migrations SQL |
| `npm run validate:palette` | contrastes et rampes de `src/styles/global.css` |
| `npm run db:migrate` | applique les migrations SQL manquantes |
| `npm run db:query "<sql>"` | requête SQL ad hoc, résultat en table |
| `npm run db:verify` | vérifie les policies RLS **contre la vraie base** |

Les trois scripts `db:*` passent `--env-file=.env.local` : ils ne fonctionnent
pas sans ce fichier.

ESLint (`eslint.config.js`, format plat) et Prettier (`.prettierrc.json`) sont
configurés, et réglés sur le style **déjà écrit** plutôt que sur un autre :
`eslint-config-prettier` neutralise en dernier toutes les règles de mise en
forme, pour que les deux outils ne se contredisent jamais. `tsconfig.json` reste
strict (`strict`, `noUnusedLocals`, `noUnusedParameters`,
`noFallthroughCasesInSwitch`) et porte l'essentiel du filet. Le détail des
périmètres et des choix est dans [80-outillage](80-outillage.md).

> `npm run format` n'a jamais été passé sur `src/` : le premier qui le lancera
> produira un large diff de reformatage, à isoler dans son propre commit.

## Migrations

Le schéma est versionné dans `supabase/migrations/`, nommé
`AAAAMMJJHHMMSS_description.sql`. `scripts/migrate.mjs` :

1. crée `public.schema_migrations` si besoin ;
2. lit les fichiers `.sql` **triés par nom** ;
3. saute ceux déjà appliqués ;
4. exécute chaque fichier restant **dans sa propre transaction** — un échec
   déclenche un `rollback` et arrête tout, la base n'est jamais à moitié migrée.

Pour ajouter une migration : créer un fichier avec un horodatage postérieur,
puis `npm run db:migrate`. **Ne jamais modifier une migration déjà appliquée** :
elle ne sera pas rejouée.

Si vous touchez au schéma, mettez à jour **à la main** le type `Database` dans
`src/lib/supabase.ts` — il n'est pas généré. `npm run check:schema` compare
désormais ce type aux migrations et signale la table, la colonne ou la fonction
exposée qui n'existe que d'un côté ; il tourne en CI. Il ne lit ni les types de
colonnes ni les contraintes : il attrape l'oubli, pas l'erreur de frappe.

Toute migration qui touche à RLS, à une fonction `security definer` ou au
contrat d'une RPC s'accompagne en outre d'une section dans
`scripts/smoke-rls.mjs` : c'est le seul endroit où les policies sont réellement
éprouvées.

### TLS

Supabase signe ses serveurs Postgres avec sa propre autorité racine, absente du
magasin système. Plutôt que de désactiver la vérification du certificat, les
scripts **épinglent** `scripts/supabase-ca.crt`. Ils suppriment aussi `sslmode`
de l'URL de connexion, car ce paramètre prendrait le pas sur l'option `ssl` du
driver `pg` et ferait ignorer le CA épinglé.

## Tests

`npm test` couvre les modules purs, 138 tests en 7 fichiers :

- `metrics.test.ts` — calcul de charge, fenêtres glissantes, ACWR et ses zones,
  monotonie et contrainte (écart-type de population, jours de repos inclus),
  semaines calendaires et ratio hebdomadaire, cas limites (historique vide,
  division par zéro, bornes de fenêtre) ;
- `team.test.ts` — agrégations d'effectif, tris, joueurs sans saisie ;
- `validation.test.ts` — e-mail et mot de passe ;
- `loadModels.test.ts` — les quatre modèles de charge, leurs paramètres et le
  RPE dérivé du modèle différencié ;
- `loadModelInfo.test.ts` — libellés, champs et validation des paramètres du
  modèle actif ;
- `invitations.test.ts` — lien d'invitation, lecture d'un code venu de l'URL,
  état et expiration du jeton ;
- `dataExport.test.ts` — sérialisation JSON et CSV des exports RGPD.

Ni les composants React ni les pages ne sont testés : pas de testing-library, pas
de test de bout en bout navigateur. Le pari du projet est que tout ce qui peut
casser silencieusement est dans les modules purs, et que le reste se voit à
l'écran.

`npm run db:verify` est d'une autre nature : il attaque la base réelle avec la
clé anon et vérifie ce que chaque rôle **ne doit pas** pouvoir lire ou écrire.
Voir [40-base-de-donnees-et-securite](40-base-de-donnees-et-securite.md). Il crée
et supprime des comptes jetables, donc à ne pas lancer distraitement contre une
base contenant de vraies données.

## Déploiement Vercel

`vercel.json` : framework `vite`, plus une réécriture qui renvoie tout vers
`/index.html` sauf `assets/` et `favicon.svg` — la réécriture SPA classique.

Le build est `npm run build` (typage puis bundle). Les variables d'environnement
viennent de l'intégration Supabase du projet Vercel ; `vite.config.ts` les lit
depuis `process.env` au moment du build.

`.github/workflows/ci.yml` tourne sur push de n'importe quelle branche et sur
pull request : `npm ci`, puis typage, tests, lint, build, contrôle de schéma et
contrôle de palette. Il n'utilise **aucun secret** et ne touche à aucune base.

Ce qui reste hors CI, et donc **toujours manuel** : les migrations sont
appliquées à la main, depuis un poste, avant ou après le déploiement. Aucune
branche de préproduction n'est identifiée à ce jour.

## Où commencer à lire

1. [20-modele-metier](20-modele-metier.md) puis `src/lib/metrics.ts` — c'est le
   produit.
2. [40-base-de-donnees-et-securite](40-base-de-donnees-et-securite.md) puis
   `supabase/migrations/20260911120000_initial_schema.sql` — c'est ce qui casse
   le plus dangereusement.
3. [30-architecture](30-architecture.md) puis `src/lib/db.ts` et
   `src/components/LoadDashboard.tsx`.
4. [50-journal-des-decisions](50-journal-des-decisions.md) quand vous vous
   demanderez « mais pourquoi c'est fait comme ça ».

## Zones d'ombre

Trois de ces questions sont refermées, et ne sont rappelées ici que parce que
d'autres documents y renvoyaient : `.env.example` existe et documente chaque
variable, ESLint et Prettier sont configurés et passent en CI, et le certificat
`scripts/supabase-ca.crt` a sa provenance et sa procédure de renouvellement
dans [80-outillage](80-outillage.md).

Restent ouvertes :

- Pas de hook de pré-commit : rien n'empêche de pousser un commit qui ne passe
  pas le lint, la CI le dira après coup.
- Les migrations ne sont pas jouées automatiquement au déploiement. Quelle est
  la procédure attendue pour une mise en production ?
- Aucun environnement de préproduction identifié : `db:verify` et `db:migrate`
  pointent vers la base de `.env.local`, quelle qu'elle soit. `db:verify` crée
  et supprime de vrais comptes : tant qu'il n'y a qu'une base, c'est elle qu'il
  attaque.
