# RPE Tracker

Application mobile de suivi de la **charge d'entraînement** par la méthode
*session-RPE* (Foster), avec deux profils d'utilisateurs : **joueur** et **coach**.

- Le **joueur** saisit chaque séance (type, durée, RPE sur l'échelle CR-10) et
  suit sa charge, son ratio aigu/chronique, sa monotonie et sa contrainte.
- Le **coach** suit l'ensemble de son effectif : charge moyenne, participation,
  joueurs en zone de risque, et fiche détaillée par joueur.

L'interface est pensée **exclusivement pour le téléphone** (navigation par
onglets en bas, cibles tactiles ≥ 44 px, saisie en quelques appuis). Sur grand
écran, l'app reste dans une colonne au format téléphone.

## Démarrer

```bash
npm install
vercel env pull --yes   # récupère la configuration Supabase dans .env.local
npm run dev             # http://localhost:5173
```

Autres scripts :

```bash
npm run build      # build de production (tsc + vite)
npm run preview    # sert le build
npm test           # tests unitaires des métriques (vitest)
npm run typecheck  # tsc --noEmit
npm run db:migrate # applique les migrations SQL en attente
npm run db:verify  # vérifie les policies RLS de bout en bout
```

Les comptes sont créés depuis l'application. Un coach saisit le nom de son
équipe à l'inscription et obtient un code d'invitation à six caractères, que
ses joueurs renseignent à leur tour pour rejoindre l'effectif.

L'inscription ouvre la session immédiatement : l'équipe est créée (coach) ou
rejointe (joueur) dans la foulée. Cela suppose que *Confirm email* soit
**désactivé** dans Authentication → Sign In / Providers du tableau de bord
Supabase ; sinon l'inscription s'arrête sur un message explicite.

Le service d'e-mail intégré de Supabase est plafonné à 2 envois par heure et
n'est prévu que pour le développement. Avant d'ouvrir l'app à de vrais
utilisateurs, configurer un SMTP personnel dans Authentication → Emails.

## Métriques

Toutes les charges sont exprimées en **unités arbitraires (UA)**.

| Indicateur | Définition | Repères |
|---|---|---|
| Charge d'une séance | `RPE (CR-10) × durée (min)` | — |
| Charge aiguë | somme des charges sur **7 jours** glissants | — |
| Charge chronique | charge des **28 jours** ramenée à une semaine | — |
| **ACWR** | charge aiguë / charge chronique | < 0,80 sous-charge · 0,80–1,30 optimal · 1,30–1,50 vigilance · > 1,50 risque |
| Monotonie | moyenne / écart-type des charges quotidiennes sur 7 jours, **jours de repos inclus** (écart-type de population) | < 1,5 bien variée · ≥ 2 trop monotone |
| Contrainte (*strain*) | charge hebdomadaire × monotonie | — |

Les séries temporelles utilisent des **fenêtres glissantes de 7 jours** et non
des semaines calendaires : la semaine en cours étant incomplète, une découpe
calendaire produirait un faux décrochage en fin de courbe.

Ces indicateurs sont des aides au pilotage de l'entraînement ; ils ne
remplacent pas un avis médical.

## Architecture

```
src/
  lib/
    types.ts      modèle de données (User, Team, TrainingSession)
    metrics.ts    calcul de charge, ACWR, monotonie, contrainte  ← testé
    team.ts       agrégations d'équipe (classements, alertes, moyennes)
    date.ts       utilitaires de date en heure locale (clés YYYY-MM-DD)
    supabase.ts   client Supabase et schéma typé de la base
    db.ts         accès aux données : seul fichier qui connaît les tables
    auth.tsx      contexte d'authentification (Supabase Auth) et de session
    hooks.ts      chargement asynchrone des données pour les écrans
  components/
    charts/       graphiques SVG maison (barres, lignes, jauge, sparkline)
    LoadDashboard.tsx  bloc d'analyse partagé joueur / fiche coach
  pages/
    player/       tableau de bord, saisie, historique
    coach/        tableau de bord équipe, effectif, fiche joueur
supabase/
  migrations/     schéma SQL, policies RLS, triggers
scripts/
  migrate.mjs     applique les migrations en attente
  smoke-rls.mjs   vérifie le cloisonnement des données
```

### Persistance

Les données vivent dans **Postgres, chez Supabase**. `src/lib/db.ts` est le seul
fichier qui connaît la forme des tables : il traduit les colonnes `snake_case`
en types du domaine, et les écrans n'en savent rien.

L'authentification est déléguée à **Supabase Auth** (e-mail / mot de passe,
jetons JWT). L'application ne manipule aucun mot de passe.

#### Cloisonnement

L'isolation n'est pas assurée par le code client mais par les **policies RLS**,
c'est-à-dire par la base elle-même. Un client malveillant qui utiliserait la clé
anon pour demander les séances d'un autre joueur ne reçoit pas une erreur : il
reçoit zéro ligne.

| Qui | Voit | Écrit |
|---|---|---|
| Joueur | son profil, ses séances, son équipe | ses séances, son profil |
| Coach | les profils et séances de son effectif | son équipe, son profil |
| Tiers | rien | rien |

Deux détails qui comptent :

- les fonctions d'appui aux policies vivent dans un schéma `private`, que
  PostgREST n'expose pas — mais `authenticated` doit pouvoir les **exécuter**,
  puisqu'une policy est évaluée avec les privilèges de l'appelant ;
- rejoindre une équipe passe par la fonction `join_team(code)` en
  `SECURITY DEFINER`, car lister les équipes rendrait les codes d'invitation
  énumérables.

`npm run db:verify` vérifie tout cela contre la vraie base, avec la clé anon :
il crée des comptes jetables, tente les accès interdits et les supprime.

#### Migrations

Le schéma est versionné dans `supabase/migrations`. `npm run db:migrate`
applique celles qui manquent, chacune dans une transaction, et mémorise le
résultat dans `schema_migrations`.

La connexion est chiffrée avec vérification du certificat : Supabase signe ses
serveurs Postgres avec sa propre autorité racine, absente du magasin système,
donc `scripts/supabase-ca.crt` est épinglé explicitement.

### Visualisations

Les graphiques sont écrits en SVG, sans librairie, pour tenir les contraintes
d'accessibilité de bout en bout :

- palette catégorielle et rampe ordinale RPE validées pour les déficiences de
  la vision des couleurs (écart CVD ΔE ≥ 8, contraste vérifié sur les deux
  surfaces claire et sombre) ;
- une seule série ⇒ une seule couleur ; deux séries ⇒ légende **et** étiquettes
  directes, jamais deux axes ;
- chaque graphique a une **vue tableau** dépliable donnant les valeurs exactes ;
- les couleurs de statut (zones ACWR) sont toujours accompagnées d'une icône et
  d'un libellé, jamais seules ;
- thème clair / sombre / système, respect de `prefers-reduced-motion`.

## Tests

`npm test` couvre le cœur métier (`src/lib/metrics.ts`) : calcul de charge,
fenêtres glissantes, ACWR et ses zones, monotonie et contrainte (écart-type de
population, jours de repos inclus), agrégats hebdomadaires et cas limites
(historique vide, division par zéro, bornes de fenêtre).

`npm run db:verify` couvre le cloisonnement des données contre la base réelle :
création de profil par trigger, code d'invitation, rattachement différé à
l'équipe, contraintes de validation, et surtout ce que chaque rôle ne doit
**pas** pouvoir lire ou écrire.

## Licence

MIT — voir [LICENSE](LICENSE).
