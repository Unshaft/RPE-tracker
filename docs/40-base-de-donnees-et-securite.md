# Base de données et sécurité

C'est le point le plus délicat du projet. La règle fondatrice :

> **L'isolation des données n'est pas assurée par le code client, mais par la
> base.**

Le client web embarque la clé `anon`, qui est publique par nature. N'importe qui
peut l'extraire du bundle et interroger PostgREST directement. Ce qui protège
les données, ce sont les **policies RLS** — et rien d'autre. Un client
malveillant qui demanderait les séances d'un autre joueur ne reçoit pas une
erreur : il reçoit **zéro ligne**.

Corollaire à garder en tête à chaque modification : toute nouvelle table arrive
avec RLS activé et des policies explicites. Une table sans policy et sans RLS
est lisible par tout utilisateur authentifié.

## Le schéma

Trois tables métier fondatrices, dans `public`, définies par
`supabase/migrations/20260911120000_initial_schema.sql`, plus trois tables
ajoutées depuis : `load_models` et `team_load_models`
(`20260919120000_load_models.sql`), et `join_team_attempts`
(`20260919130000_invitations_regenerables.sql`).

### `profiles`

Le miroir applicatif de `auth.users`. Clé primaire = l'`id` de l'utilisateur
Supabase, avec `on delete cascade`.

- `email`, `first_name`, `last_name` (défaut `''`)
- `role` : `'player'` ou `'coach'`, contraint par `check`
- `team_id` → `teams`, `on delete set null` (supprimer une équipe ne supprime
  pas ses joueurs)
- `position` : texte libre, nullable (« Ailier », « Meneur »…)

### `teams`

- `name` : 1 à 80 caractères une fois trimmé
- `coach_id` → `auth.users`, `on delete cascade`
- `invite_code` : **unique**, contraint à `^[A-Z0-9]{6}$`, **nullable** depuis
  `20260919130000` — `null` signifie « invitation révoquée », pas « pas encore
  tirée » : une équipe fermée aux nouvelles arrivées n'a plus de jeton du tout
- `invite_expires_at` : nullable ; `null` = l'invitation n'expire pas
- `invite_rotated_at` : `not null default now()` — date de la dernière
  régénération, affichée au coach

### `training_sessions`

- `user_id` → `profiles`, `on delete cascade`
- `session_date` : un `date`, **pas** un `timestamptz`. Le commentaire SQL le dit :
  c'est le jour de la séance en heure locale du joueur, une date nue, pas un
  instant. Fuseaux horaires volontairement hors du modèle.
- `type` : contraint à la liste des cinq types
- `duration_min` : entier, 1 à 600
- `rpe` : `smallint`, 1 à 10 (échelle CR-10)
- `comment` : ≤ 500 caractères
- `inputs` : `jsonb not null default '{}'` — les entrées propres aux modèles
  étendus (sRPE différencié, volume-load), validées par une contrainte `check`
  qui appelle `private.entrees_seance_valides`. `rpe` et `duration_min` restent
  des colonnes à part entière quel que soit le modèle : un club doit pouvoir
  changer de formule sans perdre l'exploitabilité de son historique.

### `load_models` et `team_load_models`

Le catalogue des formules de charge, et le choix de chaque équipe.

`load_models` est un **catalogue fermé**, alimenté par la migration seule :
`code` en clé primaire, `domain` (`field` ou `strength`), `label`, `reference`
bibliographique, `input_schema` (le jsonb qui décrit les champs à demander au
joueur — c'est lui qui pilote le formulaire, pour qu'ajouter un modèle ne
demande pas un `switch` de plus dans l'UI) et `is_default`. Un index unique
partiel garantit **un seul modèle par défaut par domaine**, sans quoi
« le modèle par défaut » ne voudrait plus rien dire.

`team_load_models` porte le choix d'une équipe, **versionné par date d'effet** :
`(team_id, domain, effective_from)` est unique, et la résolution se fait
toujours « dernier modèle dont la date d'effet précède la séance ». C'est ce qui
permet d'expliquer la forme d'une courbe de novembre six mois plus tard. Aucune
charge n'est jamais persistée : le calcul reste fait à la lecture, donc changer
de modèle relit tout l'historique sans migration de données.

Deux gardes structurelles méritent d'être connues :

- la clé étrangère est **composite**, `(model_code, domain)` vers
  `load_models (code, domain)` : la base refuse de ranger un modèle musculation
  dans le domaine terrain, ce qu'une simple référence sur `code` aurait laissé
  passer ;
- `params` est contraint par `private.params_charge_valides`, donc les
  surcharges de paramètres d'analyse sont validées **par la base**, pas
  seulement par le formulaire.

### `join_team_attempts`

Le compteur du frein anti-force-brute de `join_team`. Une ligne par tentative
ratée : `user_id` → `auth.users` (`on delete cascade`) et `attempted_at`. Elle
vit dans `public` — donc PostgREST la voit — mais RLS y est activé **sans aucune
policy** et tous les droits sont révoqués : personne ne la lit ni ne l'écrit
depuis l'API, seule la fonction `security definer` y touche.

### Index

- `profiles_team_id_idx` et `teams_coach_id_idx` : sur les colonnes utilisées par
  les policies. Une policy qui fait un `exists` non indexé se paie sur chaque
  ligne.
- `training_sessions (user_id, session_date desc)` : l'historique se lit toujours
  par joueur et par date décroissante.

## Le modèle RLS, en détail

### Le problème de la récursion

Les policies ont besoin de savoir deux choses : **dans quelle équipe est
l'appelant**, et **est-il coach**. Les deux se lisent dans `profiles`.

Or une policy `select` sur `profiles` qui interrogerait `profiles` déclenche une
récursion infinie : évaluer la policy demande de lire la table, ce qui demande
d'évaluer la policy, etc. Postgres échoue.

### La solution : le schéma `private`

Plusieurs fonctions vivent dans un schéma dédié, `private` :

- `private.current_team_id()` — l'équipe de `auth.uid()`
- `private.is_coach()` — vrai si `auth.uid()` a le rôle coach
- `private.entraine_equipe(equipe)` — vrai si `auth.uid()` est le coach de
  cette équipe. `security definer` pour ne pas faire dépendre une policy de
  `team_load_models` des policies de `teams` : la lisibilité de l'une ne doit
  pas conditionner l'autre
- `private.params_charge_valides(params)` et
  `private.entrees_seance_valides(entrees)` — les contraintes `check` des jsonb
  de `team_load_models.params` et `training_sessions.inputs`
- `private.nouveau_code_invitation()` — le tirage du jeton d'invitation

Les trois premières sont `security definer` : elles s'exécutent avec les
privilèges de leur propriétaire et **court-circuitent donc RLS**, ce qui casse
la récursion. Elles sont `stable` (Postgres peut mémoriser le résultat sur la
durée de la requête). Les deux validateurs de jsonb sont `immutable` et ne lisent
aucune table : ils n'ont rien à court-circuiter. **Toutes** posent
`set search_path = ''`, ce qui force à qualifier chaque nom (`public.profiles`)
et empêche un schéma injecté de détourner l'appel.

**Pourquoi un schéma `private` et pas `public` ?** Parce que PostgREST n'expose
que `public`. Une fonction `security definer` dans `public` serait appelable par
n'importe quel client via l'API REST. Dans `private`, elle n'est joignable que
depuis l'intérieur de la base — c'est-à-dire pendant l'évaluation d'une policy.

### Le piège des droits d'exécution

C'est l'erreur qui a coûté une migration entière (`20260911120200_fix_helper_grants.sql`),
et elle est contre-intuitive.

La migration initiale révoquait `execute` sur ces fonctions pour `authenticated`,
en croyant bien faire. Résultat : **plus rien n'était lisible**, avec l'erreur
« permission denied for function is_coach ».

La raison : **une policy est évaluée avec les privilèges du rôle appelant, pas
avec ceux de son auteur.** Quand un utilisateur `authenticated` lit `profiles`,
c'est *lui* qui exécute `private.is_coach()`. Sans `EXECUTE`, la requête échoue.

Le correctif accorde donc à `authenticated` :

- `usage` sur le schéma `private` (nécessaire pour qu'une exécution soit
  seulement possible) ;
- `execute` sur les deux fonctions.

Et le laisse révoqué pour `anon` : rien n'est lisible sans être connecté.

Ce `GRANT` **n'ouvre pas** les fonctions à l'API, parce que PostgREST n'expose
que `public` et que `private` en reste absent. La confusion entre « exposé par
l'API » et « exécutable en interne » est le piège ; ne pas le retomber.

### Les policies

Toutes sont `to authenticated` : un visiteur anonyme ne voit rien, nulle part.

| Table | Opération | Règle |
|---|---|---|
| `profiles` | select | son propre profil **ou** un profil de son équipe |
| `profiles` | update | son propre profil uniquement |
| `teams` | select | son équipe **ou** celle dont on est le coach |
| `teams` | insert | **aucune policy** — le privilège est révoqué, une équipe ne naît que de `create_team` |
| `teams` | update | uniquement le coach, et **sur la seule colonne `name`** |
| `training_sessions` | select | les siennes **ou**, si on est coach, celles d'un joueur de son équipe |
| `training_sessions` | insert / update / delete | **les siennes uniquement** |
| `load_models` | select | tout compte connecté ; **aucune policy d'écriture**, et droits révoqués |
| `team_load_models` | select | le joueur de l'équipe **ou** son coach |
| `team_load_models` | insert / update / delete | uniquement le coach de l'équipe |
| `join_team_attempts` | — | **aucune policy**, tous droits révoqués |

Deux verrous ne sont pas des policies et ne peuvent pas l'être. Les privilèges
et les policies **se cumulent, ils ne se remplacent pas** : aucune policy ne peut
redonner un privilège révoqué, ce qui en fait le verrou le plus solide des deux.

- `revoke update on public.teams` puis `grant update (name)` : le coach ne peut
  pas se fabriquer un jeton choisi ni repousser sa propre expiration, alors que
  la policy `teams_update_own` l'autorise bien à écrire sa ligne. Attention au
  piège : Supabase accorde `update` **au niveau de la table**, et un `revoke` de
  colonne ne rogne pas un droit accordé sur la table entière — il fallait
  révoquer la table puis re-accorder la colonne.
- `revoke insert on public.teams`
  (`20260919130300_fermeture_insertion_directe_teams.sql`) : le chemin PostgREST
  direct est fermé, et la policy `teams_insert` qui le décrivait a été
  supprimée avec lui. Une règle de sécurité qui décrit une opération devenue
  impossible est une règle qu'on finit par croire sur parole.

Deux choses sautent aux yeux et sont volontaires.

**Le coach ne peut pas écrire les séances de ses joueurs.** Le commentaire SQL
est sans ambiguïté : « un joueur est seul maître de ses séances ». La saisie est
déclarative, elle appartient au joueur. C'est une règle métier, pas un oubli.

**Il n'y a toujours aucune policy `delete` sur `profiles` ni sur `teams`.**
Aucune suppression ne passe par l'API : elle passe par `delete_my_account`, qui
supprime la ligne `auth.users` et laisse la cascade faire le reste (voir plus
bas).

**`profiles_select` est symétrique.** Un joueur voit les profils de ses
coéquipiers (nom, poste), pas seulement le coach. Il ne voit en revanche pas
leurs séances.

## La création de profil

Un trigger `on_auth_user_created` sur `auth.users` appelle
`public.handle_new_user()`, `security definer`, qui insère la ligne `profiles`
en reprenant `first_name`, `last_name`, `role` et `position` depuis
`raw_user_meta_data`.

Le rôle est **normalisé défensivement** : tout ce qui n'est pas exactement
`'coach'` devient `'player'`. Les métadonnées sont écrites par le client, donc
par un rôle non fiable ; ce `case` est la frontière.

La migration `20260911120300_profile_position_from_metadata.sql` a ajouté
`position` à ce trigger. Sa justification, telle qu'écrite dans le fichier,
appartient au monde d'avant : quand la confirmation d'e-mail était exigée, il n'y
avait pas de session pour écrire le poste après coup. Depuis `98654f4` la session
est ouverte immédiatement, mais le passage par les métadonnées a été conservé —
il fonctionne dans les deux cas et évite un aller-retour.

## Rejoindre une équipe : `join_team(code)`

Le joueur ne peut pas lister les équipes (la policy `teams_select` ne lui montre
que la sienne). C'est délibéré : **lister les équipes rendrait les codes
d'invitation énumérables**.

La résolution d'un code passe donc par `public.join_team(invite_code text)`,
`security definer`, et par elle seule. `execute` est révoqué pour `public` et
`anon`, accordé à `authenticated`.

### Le contrat a changé : elle renvoie `null`, elle ne lève plus

Un code refusé ne produit **plus d'exception**, mais un `null`. Ce n'est pas un
détail de style : une exception qui remonte hors d'une fonction annule sa
transaction, donc annulerait l'enregistrement de la tentative qui vient d'être
écrit. Le compteur resterait à zéro et le frein ne freinerait rien. **Compter
les échecs et les signaler par une exception sont incompatibles dans une même
transaction PL/pgSQL** ; il fallait choisir, et le frein vaut mieux que le code
d'erreur.

Bénéfice collatéral : code inconnu, code révoqué, code expiré et quota épuisé
produisent tous exactement la même réponse. Rien ne permet de distinguer « ce
code n'existe pas » de « ce code existe mais tu es bloqué », ce qui aurait fait
de la limitation elle-même un oracle d'énumération.

Seul cas qui reste une exception : l'appelant non authentifié (`42501`). Il ne
dépend que de l'état de l'appelant, jamais de l'existence d'un code, et n'a rien
à comptabiliser.

### Le frein anti-force-brute

Deux plafonds, et les deux comptent :

| Fenêtre | Quota | Pourquoi |
|---|---|---|
| 15 minutes | 5 échecs | un coach dicte son code, un joueur le retape deux ou trois fois au pire ; un balayage a besoin de millions |
| 24 heures | 20 échecs | sans lui, une attente patiente entre deux salves rendrait le premier quota cosmétique (480 essais par jour et par compte) |

Quatre détails de mise en œuvre portent l'essentiel de la valeur :

- le test du quota est fait **avant toute lecture de `teams`** : bloqué,
  l'appelant ne doit même pas pouvoir mesurer un écart de temps de réponse ;
- une tentative **bloquée n'est pas enregistrée**. La compter prolongerait le
  blocage aussi longtemps que dure le martèlement, ce qui punirait le joueur
  légitime qui réessaie sans gêner un script ;
- un **succès remet le compteur à zéro** : trois erreurs puis une réussite ne
  doivent pas traîner pour le reste de la journée ;
- la purge des vieilles lignes se fait **à l'écriture**, pas par une tâche
  planifiée — la table n'a de sens que sur la plus longue fenêtre, et le projet
  n'a pas d'ordonnanceur.

Le compteur est par **compte**, pas par adresse IP : la fonction n'est appelable
que connecté, et un compte coûte une inscription.

## Le code d'invitation

Le jeton est tiré **par la base**, par `private.nouveau_code_invitation()`, et
non plus par le navigateur : le secret qui ouvre l'effectif d'un club n'a pas à
être choisi par le client. `random()` est écarté — c'est un générateur
pseudo-aléatoire prévisible, et un code d'invitation est un secret ;
`gen_random_uuid()` fournit 122 bits cryptographiques, dont on prend 32, soit
exactement quatre fois 32⁶ : le modulo ne biaise aucun symbole.

L'alphabet reste `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — **sans `0`/`O` ni
`1`/`I`** — parce qu'un code est lu à voix haute ou recopié depuis un écran.
L'espace est de 32⁶ ≈ 10⁹, ce qui, adossé au frein ci-dessus, rend le balayage
sans objet.

Trois fonctions, toutes `security definer` et réservées à `authenticated` :

| Fonction | Ce qu'elle fait |
|---|---|
| `create_team(team_name)` | crée l'équipe, tire son code et rattache le coach **dans une seule transaction** |
| `rotate_team_invite(expires_at)` | régénère le code, avec expiration facultative ; **invalide immédiatement le précédent** |
| `revoke_team_invite()` | met `invite_code` à `null` : l'équipe n'accepte plus personne |

`create_team` remplace l'ancienne séquence « insert équipe puis update profil »,
qui n'était pas atomique : si le second appel échouait, le coach se retrouvait
avec une équipe à laquelle il n'était pas rattaché — état que RLS rend
quasiment irrécupérable côté client. Étant `security definer`, elle
court-circuite RLS et **porte donc elle-même la règle d'autorisation** (appelant
coach, et une seule équipe par coach), sans quoi n'importe quel joueur se
créerait une équipe et deviendrait lecteur des séances de son effectif. En cas
de collision sur le code (`23505`), elle retente jusqu'à cinq fois plutôt que de
faire échouer la création sous les yeux du coach.

Régénérer **invalide** le code précédent : il n'y a qu'un jeton par équipe, pas
une collection de liens vivants. C'est l'effet recherché le jour où un joueur
est exclu du club.

## Suppression de compte : `delete_my_account(confirm_team_deletion)`

`security definer`, réservée à `authenticated`. Elle exécute **une seule
instruction** — `delete from auth.users where id = caller` — et laisse la
cascade faire le reste :

```
auth.users → profiles          → training_sessions
auth.users → teams (coach_id)  → team_load_models
auth.users → join_team_attempts
```

Une seule instruction, et c'est le point : la cascade ne peut pas oublier une
table que quelqu'un ajouterait plus tard avec la bonne clé étrangère, là où une
liste de `delete` écrite à la main l'oublierait en silence.

Le paramètre de confirmation existe parce que `teams.coach_id` est `not null` :
une équipe sans coach n'existe pas dans ce modèle, donc la suppression d'un
coach emporte forcément son équipe. La fonction **refuse** (`P0003`) tant que
l'appelant ne l'a pas explicitement confirmé, et l'interface lui dit combien de
joueurs seront détachés avant de le laisser confirmer. Les joueurs, eux,
conservent leur compte et leurs séances : `profiles.team_id` est
`on delete set null`.

## `schema_migrations`

La table d'outillage du script de migration vit dans `public`, donc PostgREST
l'expose. La migration `20260911120100_lock_schema_migrations.sql` la rend
invisible : RLS activé **sans aucune policy** (ce qui la rend illisible pour
`anon` et `authenticated`), plus une révocation des droits par sécurité. Le
script de migration, lui, s'y connecte en tant que propriétaire et continue d'y
écrire.

## Vérification : `npm run db:verify`

`scripts/smoke-rls.mjs` ne teste pas des mocks : il attaque **la vraie base**
avec la clé `anon`, donc soumis aux policies, et vérifie autant ce qui doit
marcher que ce qui doit échouer. Il crée trois comptes jetables (un coach, un
joueur, un tiers hors équipe) via la clé `service_role`, puis les supprime dans
un `finally`.

Il couvre aujourd'hui **51 vérifications en neuf sections** :

- le trigger crée bien le profil, avec le rôle et le prénom des métadonnées ;
- la création d'équipe passe par `create_team` : code tiré par la base,
  rattachement du coach dans la même transaction, refus pour un joueur, refus
  d'une seconde équipe ;
- le joueur rejoint par code ; un code inconnu renvoie `null` sans exception ;
  un tiers ne voit aucune équipe ;
- le joueur enregistre une séance ; écrire au nom d'un autre échoue ; un RPE
  hors échelle et un `inputs` invalide sont refusés (contraintes `check`) ;
- le coach voit la séance de son joueur, son effectif, et **ne peut pas**
  modifier une séance ; un tiers ne voit que son propre profil ;
- l'invitation : normalisation du code (casse, espaces), refus pour un visiteur
  non connecté, impossibilité pour le coach de choisir son code à la main,
  régénération qui invalide l'ancien, refus d'une expiration déjà passée,
  révocation, changement d'équipe, et le frein — cinq essais ratés puis un code
  **valide** toujours refusé, sans message distinct ;
- les modèles de charge : catalogue lisible mais en lecture seule, choix
  réservé au coach, invisible pour un tiers, clé étrangère composite qui
  interdit de ranger un modèle muscu en domaine terrain, refus d'un paramètre
  inconnu ;
- la suppression de compte : refus tant que le coach n'a pas confirmé la
  disparition de son équipe, cascade effective pour un joueur ;
- `schema_migrations` est inaccessible.

**Il faut la clé `service_role`** (`SUPABASE_SERVICE_ROLE_KEY`) pour créer et
supprimer les comptes de test. Cette clé contourne RLS : elle n'a rien à faire
dans un bundle client, seulement dans `.env.local`.

> **Toute migration qui touche à RLS, à une fonction `security definer` ou au
> contrat d'une RPC s'accompagne d'une section ici.** La section 6 a longtemps
> testé le rattachement différé par `pending_invite_code`, mécanisme supprimé du
> produit par le commit `98654f4` : elle passait au vert sans rien vérifier
> d'existant. Une vérification qui décrit un mécanisme disparu est plus
> dangereuse qu'une vérification absente — elle donne une assurance fausse sur
> un script de sécurité.

## Zones d'ombre

Quatre des cinq points listés ici sont soldés : le frein sur `join_team`, la
régénération et la révocation des invitations, la suppression de compte RGPD, et
la provenance du certificat épinglé (documentée dans
[80-outillage](80-outillage.md)). Restent :

- Rien ne relie une équipe à plusieurs coachs, ni un coach à plusieurs équipes,
  alors que `teams.coach_id` et `profiles.team_id` sont tous deux uniques par
  construction. Tranché : **limite temporaire assumée pour la V1**
  ([70-arbitrages](70-arbitrages-2026-09-19.md), point 5).
- `delete_my_account` suppose que le rôle propriétaire de la fonction a le droit
  de supprimer dans `auth.users` — c'est le cas par défaut sur Supabase, mais
  c'est une hypothèse sur une table qui ne nous appartient pas, à revérifier
  après toute mise à jour de la plateforme.
- Le frein de `join_team` compte par compte. Un attaquant qui crée des comptes
  en série retrouve du débit ; ce que cela coûte dépend du réglage
  d'inscription de Supabase, qui n'est pas versionné.
