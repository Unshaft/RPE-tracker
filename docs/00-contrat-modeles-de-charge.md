# Contrat — modèles de charge configurables (v1)

> Document de cadrage écrit par le chef de projet. **Il fait autorité** : les
> agents base de données et frontend travaillent tous les deux contre ce
> contrat. Aucun agent ne modifie ce fichier — toute divergence constatée doit
> être signalée dans le rapport final, pas corrigée unilatéralement.

## Objectif

Chaque équipe doit pouvoir choisir **comment sa charge est calculée**, parmi un
catalogue fermé de modèles issus de la littérature, plutôt que de subir le
`RPE × durée` codé en dur aujourd'hui dans `src/lib/metrics.ts`.

## Trois principes non négociables

1. **Stocker le brut, calculer à la lecture.** Aucune charge (`load`, `acwr`,
   `monotony`…) n'est jamais persistée en base. Seules les entrées saisies par
   le joueur le sont. Changer de modèle relit tout l'historique sans migration.
2. **Le modèle est versionné et daté.** Un changement de modèle porte une date
   d'effet ; on doit pouvoir expliquer pourquoi une courbe de novembre a
   la forme qu'elle a.
3. **Catalogue fermé, jamais de formule libre.** Des modèles préréglés
   paramétrables — pas d'éditeur d'expressions saisi par l'utilisateur.

## Deux domaines distincts

La charge **terrain** et la charge **musculation** ne sont pas dans la même
unité et ne s'additionnent pas naïvement. Une équipe configure donc **deux
modèles indépendants** :

- `field` — séances `entrainement`, `match`, `individuel`, `recuperation`
- `strength` — séances `muscu`

## Catalogue v1

Seuls ces modèles sont implémentés dans cette première itération. Les entrées
supplémentaires demandées par les modèles non encore livrés sont hors périmètre.

| code | domaine | libellé | entrées | formule |
|---|---|---|---|---|
| `foster_srpe` | field | session-RPE (Foster) | `rpe` (1-10), `duration_min` | `rpe × duration_min` |
| `srpe_differentiated` | field | sRPE différencié | `rpe_breathing` (1-10), `rpe_muscular` (1-10), `duration_min` | `((rpe_breathing + rpe_muscular) / 2) × duration_min` |
| `foster_srpe_strength` | strength | session-RPE muscu | `rpe`, `duration_min` | `rpe × duration_min` |
| `volume_load` | strength | Volume-load (tonnage) | liste d'exercices `{sets, reps, weight_kg}` | `Σ sets × reps × weight_kg` |

`foster_srpe` et `foster_srpe_strength` sont les **valeurs par défaut** : une
équipe existante qui n'a rien configuré doit voir exactement les mêmes chiffres
qu'aujourd'hui. C'est un test de non-régression obligatoire.

## Paramètres configurables (communs à tous les modèles)

| paramètre | défaut | plage |
|---|---|---|
| `acute_window_days` | 7 | 3–14 |
| `chronic_window_days` | 28 | 14–56 |
| `chronic_method` | `rolling_average` | `rolling_average` \| `ewma` |
| `acwr_thresholds` | `{low: 0.80, optimal_max: 1.30, caution_max: 1.50}` | croissants, 0–3 |
| `weekly_lookback_weeks` | 4 | 2–8 |

## Forme des données (contrat)

```
load_models          (catalogue, en lecture seule pour les clients)
  code            text PK        -- 'foster_srpe', 'volume_load', ...
  domain          text           -- 'field' | 'strength'
  label           text
  reference       text           -- citation littérature, ex. 'Foster et al., 1998'
  input_schema    jsonb          -- champs requis, pour piloter le formulaire
  is_default      boolean

team_load_models     (choix d'une équipe, versionné)
  id              uuid PK
  team_id         uuid FK teams
  domain          text           -- 'field' | 'strength'
  model_code      text FK load_models
  params          jsonb          -- surcharges des paramètres ci-dessus
  effective_from  date not null
  created_at      timestamptz
  -- unicité : (team_id, domain, effective_from)

training_sessions    (table existante, étendue)
  ... colonnes actuelles conservées telles quelles (rpe, duration_min) ...
  inputs          jsonb not null default '{}'  -- entrées additionnelles
```

`rpe` et `duration_min` **restent des colonnes à part entière** (contraintes,
index, historique). `inputs` ne porte que les entrées propres aux modèles
étendus : `rpe_breathing`, `rpe_muscular`, `exercises: [{sets, reps, weight_kg}]`.

### Côté TypeScript

```ts
export type LoadDomain = 'field' | 'strength';
export type LoadModelCode =
  | 'foster_srpe' | 'srpe_differentiated'
  | 'foster_srpe_strength' | 'volume_load';

export interface LoadModelParams { /* cf. tableau des paramètres */ }

export interface TeamLoadModel {
  id: string;
  teamId: string;
  domain: LoadDomain;
  modelCode: LoadModelCode;
  params: LoadModelParams;
  effectiveFrom: string; // YYYY-MM-DD
}

export interface SessionInputs {
  rpeBreathing?: number;
  rpeMuscular?: number;
  exercises?: { sets: number; reps: number; weightKg: number }[];
}
```

`sessionLoad()` dans `src/lib/metrics.ts` prend désormais le modèle en
paramètre. Toutes les fonctions dérivées (`acuteLoad`, `acwr`, `monotony`,
`weeklyRatio`…) suivent.

## Sécurité

- Seul le **coach** de l'équipe peut lire et écrire `team_load_models`.
  Un joueur peut **lire** celui de son équipe (pour que son formulaire de saisie
  affiche les bons champs), jamais l'écrire.
- `load_models` est lisible par tout utilisateur authentifié, écrit par personne.
- Toute nouvelle table arrive avec RLS activé et des policies explicites.

## Hors périmètre v1

TRIMP / fréquence cardiaque, GPS et charge externe, conversion entre charge
terrain et charge muscu, import de capteurs.
