# Outillage

Ce que le dépôt sait vérifier tout seul, et comment le lancer. Complète
[60-mise-en-route](60-mise-en-route.md), qui décrit l'installation et les
scripts de base — plusieurs des « zones d'ombre » listées en fin de ce
document-là sont refermées ici.

## En un coup d'œil

| Commande | Ce qu'elle vérifie | Réseau / base |
|---|---|---|
| `npm run typecheck` | typage TypeScript (`tsc --noEmit`) | non |
| `npm test` | tests unitaires (vitest) | non |
| `npm run lint` | ESLint sur `src/`, `scripts/` et la configuration | non |
| `npm run format` | reformate tout avec Prettier | non |
| `npm run format:check` | signale ce qui n'est pas formaté, sans rien écrire | non |
| `npm run check:schema` | cohérence du type `Database` et des migrations SQL | non |
| `npm run validate:palette` | contrastes et rampes de `src/styles/global.css` | non |
| `npm run build` | `tsc -b` puis bundle Vite | non |
| `npm run db:migrate` / `db:query` / `db:verify` | **touchent la vraie base** | oui |

Les six premières et le build tournent en CI. Les trois dernières, non : elles
demandent des identifiants, et la CI n'en a aucun.

## ESLint et Prettier

Le dépôt n'avait ni l'un ni l'autre, alors qu'un
`// eslint-disable-next-line react-hooks/exhaustive-deps` traînait déjà dans
`src/lib/hooks.ts` — un commentaire qui ne désactivait rien, faute de linter.

**Le parti pris est de figer le style déjà écrit, pas d'en imposer un autre.**
Concrètement :

- **Prettier** (`.prettierrc.json`) est réglé sur ce que le code fait déjà :
  guillemets simples, points-virgules, indentation de 2, virgule finale
  partout, parenthèses autour des paramètres de flèche, largeur 100.
- **ESLint** (`eslint.config.js`, format « flat » d'ESLint 9) ne garde que ce
  qui attrape des erreurs réelles. Toutes les règles de mise en forme sont
  neutralisées par `eslint-config-prettier`, appliqué en dernier : les deux
  outils ne se contredisent jamais.
- Les jeux `type-checked` de typescript-eslint ne sont **pas** activés. Le
  `tsconfig.json` est déjà strict (`strict`, `noUnusedLocals`,
  `noUnusedParameters`, `noFallthroughCasesInSwitch`) et couvre l'essentiel ;
  les activer imposerait de reconstruire un programme TypeScript complet à
  chaque passage du linter pour un gain marginal.

Trois périmètres distincts dans la configuration : `src/**` (navigateur, React,
hooks, Fast Refresh), `scripts/**` et `*.config.js` (Node, où `console.log` est
la raison d'être du fichier), et `*.config.ts` (Node, mais parsé en
TypeScript).

```bash
npm run lint         # rapport
npm run lint:fix     # corrige ce qui est corrigible automatiquement
npm run format       # reformate tout le dépôt
npm run format:check # en CI ou avant commit, sans écrire
```

> `npm run format` n'a **jamais été passé sur `src/`**. Le premier qui le
> lancera produira un diff de reformatage large (environ 250 lignes dépassent
> aujourd'hui la largeur de 100). À faire dans un commit séparé, qui ne contient
> que ça, pour ne pas noyer une vraie modification.

### Fins de ligne

Un `.gitattributes` a été ajouté (`* text=auto eol=lf`). Sans lui, un poste
Windows avec `core.autocrlf=true` sort les fichiers en CRLF alors que git les
stocke en LF, et `prettier --check` signale alors **tout le dépôt** comme mal
formaté. Un faux positif de cette taille n'apprend qu'une chose : à ne plus
lire l'outil. C'était le cas ici avant la correction — `scripts/migrate.mjs` et
`scripts/db-query.mjs` étaient signalés sans qu'un seul caractère de leur
contenu soit en cause.

## Contrôle de la palette

`src/styles/global.css` se décrit lui-même comme une « palette data-viz validée
(CVD-safe) » et renvoie, en commentaire, à `scripts/validate_palette.js
--ordinal`. Le script n'existait pas ; il existe maintenant et vérifie ce que le
CSS annonce.

```bash
npm run validate:palette                    # toutes les règles
node scripts/validate_palette.js --ordinal  # la rampe RPE seulement
```

Il ne dépend de rien : sRGB, luminance WCAG 2.1, OKLab et les matrices de
simulation Viénot–Brettel–Mollon (1999) sont calculés dans le fichier. Il lit
les trois blocs de tokens du CSS — `:root`, la media query sombre, le scope
`[data-theme='dark']` — et applique :

| Règle | Seuil | Bloquante |
|---|---|---|
| texte (`--text-*`, `--status-*-ink`, `--accent`) sur les quatre surfaces | 4,5:1 (3:1 pour `--text-muted`) | oui |
| encres explicites : `--accent-ink` sur `--accent` / `--accent-deep`, `--rpe-ink-N` sur `--rpe-N` | 4,5:1 | oui |
| rampe ordinale RPE : teinte unique, clarté monotone, pas minimal | 12° de dispersion, 0,06 de clarté OKLab | oui |
| les deux déclarations du thème sombre sont identiques | égalité stricte | oui |
| `--series-N` sur `--plane` / `--surface-1` | 3:1 (WCAG 1.4.11) | non |
| `--series-N` distinguables sous protanopie, deutéranopie, tritanopie | ΔOKLab ≥ 0,05 | non |

Les deux dernières sont des **avertissements** : ce sont des marques
graphiques, pas du texte, et le seuil y est une heuristique. Elles n'affectent
pas le code de sortie.

La palette passe aujourd'hui **sans échec ni avertissement**, dans les deux
thèmes. Ça n'a pas toujours été le cas : à sa mise en place, le script a
révélé sept contrastes insuffisants et une rampe sombre indiscernable sous
daltonisme, tous soldés depuis en ajustant clartés et saturations à teintes
constantes. Le script est donc **branché sur la CI** : toute régression de
contraste fait échouer le build plutôt que d'attendre d'être vue.

## Cohérence du type `Database`

Le type `Database` de `src/lib/supabase.ts` est écrit à la main. Rien ne
prévenait qu'il avait divergé du SQL — risque devenu concret avec l'arrivée de
`load_models` et `team_load_models`.

```bash
npm run check:schema
```

`scripts/check-schema-types.mjs` lit les migrations de `supabase/migrations/`
dans l'ordre des noms, rejoue les `create table` / `add column` / `drop column`
pour reconstituer l'état du schéma `public`, extrait les `Row` du type
TypeScript, et compare. Il signale :

- une table présente d'un côté et pas de l'autre ;
- une colonne présente en SQL et absente de `Row`, ou l'inverse ;
- une fonction `public.*` dont l'`execute` est accordé à `authenticated` (donc
  exposée par PostgREST) et qui n'est pas déclarée dans `Functions`.

Il ne se connecte à rien et ne remplace pas `supabase gen types` : il ignore
les **types** de colonnes, les contraintes et les valeurs par défaut. Il attrape
en revanche le seul oubli qui se produit vraiment, celui de la colonne ajoutée
d'un seul côté.

Deux listes d'exception sont déclarées en tête du fichier :

- `TABLES_HORS_TYPE` — aujourd'hui `schema_migrations` (journal des migrations)
  et `join_team_attempts` (compteur du frein de `join_team`). Toutes deux
  vivent dans `public`, donc PostgREST les voit, mais RLS les ferme sans
  aucune policy : l'application n'a aucune raison de les connaître.
- `COLONNES_HORS_TYPE` — vide.

**Une divergence délibérée se déclare là, avec son motif** — jamais en
affaiblissant une règle.

## Vérification RLS

`npm run db:verify` (`scripts/smoke-rls.mjs`) attaque la **vraie base** avec la
clé anon et vérifie ce que chaque rôle ne doit pas pouvoir lire ou écrire. Il
crée et supprime des comptes jetables : à ne pas lancer distraitement contre une
base contenant de vraies données.

Sa section 6 testait encore le rattachement différé par `pending_invite_code`,
mécanisme supprimé du produit par le commit `98654f4`. Elle passait au vert sans
rien vérifier d'existant — pire qu'absente, puisqu'elle donnait une assurance
fausse sur un script de sécurité. Le script a été réaligné sur le mécanisme
d'invitation tel qu'il est aujourd'hui, et couvre désormais 51 vérifications
réparties en neuf sections.

Ce qui a changé :

- **Section 2, création d'équipe.** Passe par `create_team` et non plus par un
  `insert` suivi d'un `update` : code tiré par la base, rattachement du coach
  dans la même transaction, refus pour un joueur, refus d'une seconde équipe.
  Et surtout : **un code inconnu ne lève plus d'exception, il renvoie `null`** —
  contrat changé par `20260919130000_invitations_regenerables.sql`, parce
  qu'une exception annulerait l'enregistrement de la tentative, donc le frein.
- **Section 6, invitation.** Normalisation du code (casse, espaces), refus pour
  un visiteur non connecté, impossibilité pour le coach de choisir son code à
  la main (privilège d'`UPDATE` retiré au niveau colonne), régénération qui
  invalide l'ancien code, refus d'une expiration déjà passée, révocation,
  changement d'équipe, et le frein : cinq essais ratés puis un code **valide**
  toujours refusé, sans message distinct.
- **Section 7, modèles de charge** — que `20260919120000_load_models.sql` avait
  laissés sans couverture : catalogue lisible mais en lecture seule, choix
  réservé au coach, invisible pour un tiers, clé étrangère composite qui
  interdit de ranger un modèle muscu en domaine terrain, refus d'un paramètre
  inconnu.
- **Section 9, suppression de compte** : refus tant que le coach n'a pas
  confirmé la disparition de son équipe, et cascade effective pour un joueur.
- Le `check` sur `training_sessions.inputs` a rejoint la section 4.

> Ce script est le seul endroit où les policies sont réellement éprouvées.
> **Toute migration qui touche à RLS, à une fonction `security definer` ou au
> contrat d'une RPC doit s'accompagner d'une section ici.** Une vérification qui
> décrit un mécanisme disparu est plus dangereuse qu'une vérification absente.

## Intégration continue

`.github/workflows/ci.yml`, sur **push de n'importe quelle branche** et sur
**pull request** : `npm ci`, puis typage, tests, lint, build, contrôle de
schéma — dans cet ordre, du plus rapide au plus lent, pour que l'échec le plus
probable arrive le plus tôt.

Le workflow **n'utilise aucun secret** et ne touche à aucune base : ni
migration, ni `db:verify`, ni clé Supabase. Le build s'en passe —
`vite.config.ts` tolère des variables absentes et produit alors un bundle qui
échouera au chargement, ce qui est précisément le contrat voulu : la CI vérifie
que le code compile, pas qu'il est configuré.

`npm ci` et non `npm install` : installation reproductible depuis
`package-lock.json`, et échec net si le lock a divergé de `package.json`.

Reste hors CI, et donc **toujours manuel** : l'application des migrations. Voir
60-mise-en-route.

## Variables d'environnement

`.env.example` est versionné (`.gitignore` ignore `.env*` **sauf** lui) et
documente chaque variable : à quoi elle sert, où la trouver dans la console
Supabase, et laquelle est secrète.

En résumé : `SUPABASE_URL` et `SUPABASE_ANON_KEY` sont publiques et partent
dans le bundle, c'est attendu. `SUPABASE_SERVICE_ROLE_KEY`,
`POSTGRES_URL_NON_POOLING` et `POSTGRES_URL` sont **secrètes** et ne doivent
apparaître ni dans un bundle, ni dans le dépôt, ni dans la CI.

## Le certificat `scripts/supabase-ca.crt`

`migrate.mjs` et `db-query.mjs` **épinglent** ce certificat plutôt que de
désactiver la vérification TLS : Supabase signe ses serveurs Postgres avec sa
propre autorité racine, absente du magasin système.

### Ce qu'il est

| | |
|---|---|
| Sujet et émetteur | `CN=Supabase Root 2021 CA, O=Supabase Inc, L=New Castle, ST=Delware, C=US` |
| Nature | racine **auto-signée** (`CA:TRUE`) |
| Valide du | 28 avril 2021, 10:56:53 UTC |
| **Valide jusqu'au** | **26 avril 2031, 10:56:53 UTC** |
| Numéro de série | `6CBC4CA1DEB63F692D0A2024C67289C2D13D54F6` |
| Empreinte SHA-256 | `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA` |

Il s'agit de la racine publique que Supabase distribue pour toutes ses bases,
pas d'un certificat propre à ce projet : il n'y a donc aucun secret dans ce
fichier, et le versionner est normal.

Pour revérifier ces informations à tout moment, sans réseau :

```bash
node -e "const {X509Certificate}=require('crypto');const c=new X509Certificate(require('fs').readFileSync('scripts/supabase-ca.crt'));console.log(c.subject,c.validTo,c.fingerprint256)"
```

### Quand et comment le renouveler

Trois déclencheurs, et un seul est daté :

1. **Avant avril 2031** — l'expiration. Loin, mais c'est la seule échéance
   certaine.
2. **Si Supabase change d'autorité racine.** Le symptôme est net :
   `db:migrate` et `db:query` échouent sur
   `unable to verify the first certificate` ou
   `self-signed certificate in certificate chain`, alors que la base répond
   par ailleurs. Rien d'autre ne casse — l'application front passe par
   l'API HTTPS et n'utilise pas ce fichier.
3. **Sur un nouveau projet Supabase**, si celui-ci est hébergé sur une
   infrastructure dont la racine diffère.

Procédure :

1. Console Supabase, projet concerné : *Project Settings → Database → SSL
   Configuration*, bouton de téléchargement du certificat.
2. Remplacer `scripts/supabase-ca.crt` par le fichier téléchargé.
3. Vérifier ce qu'on vient d'épingler **avant** de faire confiance :
   relancer la commande `node -e` ci-dessus et lire le sujet, l'émetteur et la
   date d'expiration. Un certificat épinglé sans avoir été regardé ne vaut pas
   mieux qu'un `rejectUnauthorized: false`.
4. Confirmer par un aller-retour réel : `npm run db:query "select 1"`.
5. Commiter en indiquant dans le message la nouvelle date d'expiration.

Ne **jamais** contourner l'échec en passant `rejectUnauthorized: false` ou
`sslmode=disable` : les chaînes de connexion contiennent le mot de passe de la
base, et les scripts suppriment déjà `sslmode` de l'URL précisément pour que ce
paramètre ne prenne pas le pas sur le CA épinglé.
