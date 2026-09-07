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
npm run dev        # http://localhost:5173
```

Autres scripts :

```bash
npm run build      # build de production (tsc + vite)
npm run preview    # sert le build
npm test           # tests unitaires des métriques (vitest)
npm run typecheck  # tsc --noEmit
```

### Comptes de démonstration

Au premier lancement, un jeu de données déterministe est créé : une équipe,
8 joueurs et ~10 semaines de séances (dont un joueur en surcharge, un en reprise
après blessure, un irrégulier).

| Rôle   | E-mail            | Mot de passe |
|--------|-------------------|--------------|
| Joueur | `joueur@demo.fr`  | `demo1234`   |
| Coach  | `coach@demo.fr`   | `demo1234`   |

Code d'invitation de l'équipe de démo : `RIV2026`.

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
    db.ts         persistance (localStorage) derrière une API isolée
    auth.tsx      contexte d'authentification et de session
    seed.ts       jeu de démonstration déterministe
  components/
    charts/       graphiques SVG maison (barres, lignes, jauge, sparkline)
    LoadDashboard.tsx  bloc d'analyse partagé joueur / fiche coach
  pages/
    player/       tableau de bord, saisie, historique
    coach/        tableau de bord équipe, effectif, fiche joueur
```

### Persistance

Les données vivent dans le `localStorage` du navigateur, derrière l'API
asynchrone de `src/lib/db.ts`. **Brancher un vrai backend (REST, Supabase…)
revient à réécrire ce seul fichier**, sans toucher aux écrans.

Le hachage des mots de passe (SHA-256 salé, WebCrypto) suffit pour une démo
locale : une mise en production doit déléguer l'authentification au backend
(bcrypt/argon2, jetons de session).

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

## Licence

MIT — voir [LICENSE](LICENSE).
