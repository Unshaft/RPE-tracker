# Architecture

## Pile technique

React 18 + TypeScript, bundlé par Vite 5, routé par react-router-dom 6,
adossé à Supabase (Postgres + Auth + PostgREST) et déployé sur Vercel. Les
tests tournent sous Vitest.

**Aucune dépendance d'UI, de graphiques ou de gestion d'état.** Les quatre
dépendances de production sont React, React DOM, react-router-dom et
`@supabase/supabase-js`. Les graphiques sont du SVG écrit à la main, le CSS est
un fichier unique à base de variables (`src/styles/global.css`), l'état global
tient dans un contexte React.

## Les couches

```text
pages/          un écran = une route. Orchestre, ne calcule pas.
components/     briques d'UI réutilisables + graphiques SVG.
lib/            tout le reste : domaine, calcul, accès aux données, session.
```

La règle implicite mais tenue partout : **les pages ne connaissent pas la base**.
Elles appellent des hooks (`src/lib/hooks.ts`) ou le contexte d'auth, et
travaillent sur des types du domaine en `camelCase`. Une seule exception assumée :
`src/pages/player/NewSession.tsx` importe `src/lib/db.ts` directement pour écrire
une séance, parce qu'il n'existe pas de hook de mutation.

## `src/lib/`, fichier par fichier

| Fichier | Rôle |
|---|---|
| `types.ts` | Le modèle du domaine : `User`, `Team`, `TrainingSession`, `Role`, `SessionType`, `LoadModel`, `TeamLoadModel`, plus les libellés `SESSION_TYPES` et `RPE_SCALE`. Aucune logique. |
| `date.ts` | Dates **en heure locale**, manipulées comme des clés `YYYY-MM-DD` et jamais comme des instants. Fournit aussi tous les libellés français (`Aujourd'hui`, `sem. du 9 mars`, `il y a 3 j`). |
| `metrics.ts` | Le cœur métier : charges, ACWR, monotonie, contrainte, semaines calendaires, ratio hebdomadaire. Pur, testé. Voir [20-modele-metier](20-modele-metier.md). |
| `loadModels.ts` | Les quatre formules de charge du catalogue et la résolution « quel modèle s'appliquait ce jour-là ». Pur, testé. Voir [00-contrat-modeles-de-charge](00-contrat-modeles-de-charge.md). |
| `team.ts` | Agrégations d'effectif construites au-dessus de `metrics.ts`. Pur, testé. |
| `validation.ts` | Validation d'e-mail et de mot de passe côté client. Pur, testé. |
| `supabase.ts` | Le client Supabase, et le type `Database` décrivant le schéma tel que PostgREST le voit. |
| `db.ts` | **Le seul fichier qui connaît la forme des tables.** Traduit `snake_case` ↔ domaine, traduit les codes d'erreur Postgres en messages affichables. |
| `auth.tsx` | Contexte React de session : utilisateur courant, équipe, inscription, connexion, rattachement à une équipe. |
| `hooks.ts` | Chargement asynchrone pour les écrans, avec annulation des réponses obsolètes. |
| `theme.ts` | Préférence de thème (clair / sombre / système), persistée en `localStorage`. |

### Pourquoi `db.ts` est une frontière

L'historique explique la forme du fichier : dans la toute première version
(`83b35d9`), `db.ts` implémentait une persistance **localStorage** — avec le
commentaire explicite qu'elle serait « remplaçable par un backend sans toucher
aux écrans ». Le commit `cb7ecd7` a tenu cette promesse : `db.ts` a été
réécrit pour Supabase, et les écrans n'ont quasiment pas bougé.

Deux conséquences pratiques :

- si vous ajoutez une colonne, la traduction se fait dans les fonctions `from*`
  de `db.ts` **et nulle part ailleurs** ;
- les erreurs Postgres ne remontent jamais brutes à l'écran. La fonction `fail`
  traduit les codes qui correspondent à une erreur d'usage réelle (`23505`
  unicité, `23514` contrainte, `42501` droits, `P0002` code d'équipe inconnu,
  `P0003` suppression d'équipe non confirmée, `P0004` équipe déjà existante) et
  renvoie un message générique pour le reste, plutôt que d'exposer le détail
  interne de la base. Attention : `join_team` ne lève **plus** `P0002` — un code
  refusé revient en `null`, et c'est l'appelant qui formule le message. Voir
  [40-base-de-donnees-et-securite](40-base-de-donnees-et-securite.md).

### Le type `Database` est écrit à la main

`src/lib/supabase.ts` décrit le schéma manuellement : le générer demanderait le
CLI Supabase dans la boucle de build. La migration et le type doivent donc
bouger ensemble — et `npm run check:schema`
(`scripts/check-schema-types.mjs`) le vérifie désormais, en rejouant les
migrations pour reconstituer le schéma et le comparer au type. Il tourne en CI.
Voir [80-outillage](80-outillage.md).

### Le contexte de modèle de charge

`src/components/loadContext.tsx` monte le catalogue et l'historique des choix de
l'équipe **au-dessus** de tous les écrans, plutôt que de les passer en props.

Le motif est précis : tout chiffre affiché dépend du modèle en vigueur. Une page
qui aurait oublié de recevoir la prop n'aurait affiché **aucune erreur** — elle
aurait affiché silencieusement les chiffres du modèle par défaut, c'est-à-dire
un faux plausible. Un contexte React rend cet oubli impossible à commettre.
`src/components/loadModelInfo.ts` en dérive les libellés, les champs de saisie
et la validation des paramètres.

## Routage et protection par rôle

Tout est dans `src/App.tsx`, avec un **`HashRouter`** (URLs en `/#/...`).

Deux gardes :

- `<Protected role?>` — si la session n'est pas encore résolue (`!ready`), on
  n'affiche **rien** plutôt que de faire clignoter l'écran de login. Sans
  session, redirection vers `/login` en mémorisant la page demandée. Avec un
  rôle qui ne correspond pas, redirection vers l'accueil de **son** rôle :
  chaque rôle a son espace, on ne montre pas un 403.
- `<Guest>` — l'inverse, pour `/login` et `/inscription`.

| Route | Accès | Écran |
|---|---|---|
| `/login`, `/inscription` | invité | `pages/Login.tsx`, `pages/Register.tsx` |
| `/` | joueur | `pages/player/PlayerDashboard.tsx` |
| `/saisie` | joueur | `pages/player/NewSession.tsx` (aussi l'édition, via `?id=`) |
| `/historique` | joueur | `pages/player/History.tsx` |
| `/coach` | coach | `pages/coach/CoachDashboard.tsx` |
| `/coach/effectif` | coach | `pages/coach/Roster.tsx` |
| `/coach/joueur/:playerId` | coach | `pages/coach/PlayerDetail.tsx` |
| `/profil` | connecté | `pages/Profile.tsx` |
| `*` | — | redirection vers `/` |

`NavGate` masque la barre d'onglets tant qu'on n'est pas connecté et sur les
écrans d'authentification.

S'y ajoutent `/coach/modeles` (`pages/coach/LoadModelSettings.tsx`, réservé au
coach) et cinq routes publiques, accessibles sans session parce qu'un parent ou
un club doivent pouvoir les lire avant de créer le moindre compte :
`/mentions-legales`, `/confidentialite`, `/cgu`, `/cgv`, `/cookies`
(`pages/legal/`).

## Flux de données

```text
Supabase (Postgres + RLS)
        │  PostgREST / supabase-js
        ▼
   src/lib/db.ts          traduction lignes ↔ domaine, erreurs lisibles
        │
        ├──► src/lib/auth.tsx   session + profil + équipe (contexte React)
        │
        └──► src/lib/hooks.ts   usePlayerSessions / useTeamSessions / useTeamPlayers
                     │
                     ▼
                 pages/*      orchestration, état d'écran
                     │
                     ▼
        src/lib/metrics.ts + team.ts   calcul à la lecture, en mémoire
                     │
                     ▼
        components/LoadDashboard + components/charts/*
```

Trois mécanismes méritent d'être connus avant de toucher à cette chaîne.

**La révision.** `AuthContext` expose un compteur `revision`, incrémenté à
chaque mutation (`refresh()`). Les hooks l'utilisent comme dépendance : après
une saisie de séance, la révision change, les hooks rechargent. C'est un
invalidateur de cache d'une ligne, en lieu et place d'une librairie de data
fetching.

**L'annulation des réponses obsolètes.** `useAsync` (dans `hooks.ts`) ignore la
réponse d'une requête si le composant a changé de dépendances entre-temps : si
l'utilisateur change d'écran ou de joueur pendant une requête lente, la réponse
tardive n'écrase pas l'affichage courant. `auth.tsx` fait la même chose avec un
`loadingFor` pour le chargement du profil, contre les enchaînements d'événements
d'authentification (reconnexion rapide, rafraîchissement de jeton).

**`data` a toujours une valeur.** `Async<T>` garantit une liste ou une map vide
plutôt qu'un `undefined` : les écrans n'ont pas à distinguer « pas encore
chargé » de « vide » dans leurs calculs. `loading` sert uniquement à choisir quoi
afficher.

**Une seule requête pour tout l'effectif.** `getSessionsByTeam` charge les
séances de tous les joueurs en un `in(...)`, et pas une requête par joueur : le
tableau de bord coach serait inutilisable autrement. La map est initialisée à
partir de l'effectif pour que les joueurs **sans aucune séance** apparaissent
quand même.

## Composants

`components/LoadDashboard.tsx` est le bloc d'analyse partagé entre le tableau de
bord du joueur et la fiche joueur côté coach : une seule définition des
indicateurs, donc joueur et staff regardent littéralement le même écran.

`components/charts/` contient les graphiques SVG : `BarSeriesChart` (séries de
barres), `WeeklyLoadChart`, `RatioTrendChart` (le ratio hebdomadaire sur ses
zones), `AcwrGauge` (jauge), `Sparkline` (micro-tendance dans les listes),
`TypeBreakdown` (répartition par type). `chartUtils.ts` porte le calcul d'échelle
(`niceScale`), les chemins SVG et les formateurs (`formatLoad`, `formatRatio`,
`plural`).

`components/ui.tsx` : `Card`, `Section`, `Tile`, `StatusBadge`, `Delta`,
`EmptyState`, `Loading`, `Avatar`, et surtout `TableView` — la vue tableau
dépliable que **chaque** graphique doit proposer.

## Thème et styles

Un seul fichier CSS, `src/styles/global.css`, organisé en variables. Le mode
sombre est déclaré **deux fois** : une media query `prefers-color-scheme` pour le
réglage système, et un scope `[data-theme]` pour la bascule dans l'app, qui doit
gagner dans les deux sens. `src/lib/theme.ts` pose l'attribut et persiste la
préférence dans `localStorage` sous la clé `rpe.theme`.

La palette distingue trois familles : les couleurs de **série** (`--series-1..5`,
catégorielles), les couleurs de **statut** (`--status-good/warning/serious/critical`,
avec une variante « ink » pour le texte) et la **rampe ordinale RPE**
(`--rpe-1..5`, une seule teinte, cinq paliers de clarté).

## Zones d'ombre

- `global.css` renvoie à `scripts/validate_palette.js --ordinal` pour justifier
  la rampe RPE. **Ce script n'existe pas dans le dépôt.** Palette validée
  ailleurs puis recopiée, ou script perdu ?
- Le choix de `HashRouter` plutôt que `BrowserRouter` n'est justifié nulle part,
  alors que `vercel.json` contient déjà la réécriture SPA qui rendrait
  `BrowserRouter` possible. Historique, ou contrainte d'hébergement oubliée ?
- Il n'y a ni ESLint ni Prettier configurés, alors que le code contient un
  commentaire `eslint-disable-next-line react-hooks/exhaustive-deps`. La
  configuration a-t-elle été retirée, ou n'a-t-elle jamais été committée ?
