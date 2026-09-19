# RPE Tracker

Suivi de la **charge d'entraînement** par la méthode *session-RPE* (Foster),
pour un club et son effectif. Deux profils : **joueur** et **coach**.

- Le **joueur** déclare chaque séance en quelques appuis (type, durée, RPE sur
  l'échelle CR-10) et suit sa charge, son ratio aigu/chronique, sa monotonie et
  sa contrainte.
- Le **coach** suit son effectif : participation, charge de la semaine joueur
  par joueur, alertes, et une fiche détaillée par joueur.

L'interface est pensée **exclusivement pour le téléphone**. React + TypeScript +
Vite, Supabase (Postgres + Auth + RLS), déployé sur Vercel.

Ces indicateurs sont des aides au pilotage de l'entraînement ; **ils ne
remplacent pas un avis médical.**

## Démarrer

```bash
npm install
vercel env pull --yes   # récupère la configuration Supabase dans .env.local
npm run dev             # http://localhost:5173
```

⚠️ Le réglage **« Confirm email » doit être désactivé** sur le projet Supabase,
sinon l'inscription échoue. Le pourquoi est dans
[docs/60-mise-en-route.md](docs/60-mise-en-route.md).

| Script | |
|---|---|
| `npm run build` | build de production (tsc + vite) |
| `npm test` | tests unitaires du cœur métier (vitest) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | applique les migrations SQL en attente |
| `npm run db:verify` | vérifie les policies RLS de bout en bout |

## Documentation

Toute la documentation vit dans [`docs/`](docs/). Elle est écrite pour quelqu'un
qui arrive sur le projet et n'en sait rien.

| Document | Ce qu'on y trouve |
|---|---|
| [00 — Contrat : modèles de charge configurables](docs/00-contrat-modeles-de-charge.md) | Le cadrage de la fonctionnalité **en cours de développement**. Fait autorité, ne pas modifier. |
| [10 — Vue d'ensemble](docs/10-vue-d-ensemble.md) | À quoi sert le produit, pour qui, ce qu'il n'est pas, les contraintes assumées. |
| [20 — Le modèle métier](docs/20-modele-metier.md) | **Le cœur.** session-RPE, charge aiguë/chronique, ACWR, monotonie, contrainte, et pourquoi deux ratios coexistent. Formules, unités, seuils, références. |
| [30 — Architecture](docs/30-architecture.md) | Les couches, le rôle de chaque fichier de `src/lib/`, le routage et sa protection par rôle, le flux de données. |
| [40 — Base de données et sécurité](docs/40-base-de-donnees-et-securite.md) | Les tables et surtout le **modèle RLS** : comment l'isolation joueur/coach est réellement garantie, le schéma `private`, les fonctions `security definer`. |
| [50 — Journal des décisions](docs/50-journal-des-decisions.md) | Commit par commit, les décisions structurantes et leur justification. À lire quand on se demande « pourquoi c'est fait comme ça ». |
| [60 — Mise en route développeur](docs/60-mise-en-route.md) | Installation, variables d'environnement, scripts, migrations, tests, déploiement. |

**Par où commencer :** [10](docs/10-vue-d-ensemble.md) →
[20](docs/20-modele-metier.md) → [60](docs/60-mise-en-route.md), puis
[40](docs/40-base-de-donnees-et-securite.md) avant de toucher à la base.

## Repères rapides

Toutes les charges sont en **unités arbitraires (UA)**.

| Indicateur | Définition | Repères |
|---|---|---|
| Charge d'une séance | `RPE (CR-10) × durée (min)` | — |
| Charge aiguë | somme sur **7 jours** glissants | — |
| Charge chronique | charge des **28 jours** ramenée à une semaine | — |
| **ACWR** | aiguë / chronique | < 0,80 sous-charge · 0,80–1,30 optimal · 1,30–1,50 vigilance · > 1,50 risque |
| Ratio hebdomadaire | semaine calendaire en cours / moyenne des 4 précédentes | mêmes seuils |
| Monotonie | moyenne / écart-type des charges quotidiennes sur 7 jours, jours de repos inclus | < 1,5 bien variée · ≥ 2 trop monotone |
| Contrainte (*strain*) | charge hebdomadaire × monotonie | — |

## Organisation du dépôt

```text
src/lib/          domaine, calcul, accès aux données, session   ← le cœur, testé
src/components/   briques d'UI et graphiques SVG maison
src/pages/        un écran par route (player/ et coach/)
supabase/         migrations SQL : schéma, policies RLS, triggers
scripts/          migrations, requêtes ad hoc, smoke-test RLS
docs/             la documentation
```

## Licence

MIT — voir [LICENSE](LICENSE).
