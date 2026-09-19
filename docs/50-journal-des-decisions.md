# Journal des décisions

Ce fichier reconstitue, commit par commit, les décisions structurantes prises
depuis le début du projet et leur justification. C'est l'information qui a le
plus de valeur et qui disparaît le plus vite : un `git log` se lit une fois, un
diff se relit mal, et la raison d'un choix n'est presque jamais dans le code.

Les justifications ci-dessous viennent des messages de commit et des
commentaires du code. Quand une décision n'est justifiée nulle part, c'est dit.

---

## `494a3c5` — 7 septembre 2026 — Initial commit

Licence **MIT** et un README d'une ligne. Rien d'autre. La licence n'a jamais
été rediscutée depuis, alors qu'une réflexion de monétisation existe par
ailleurs — voir les zones d'ombre.

---

## `83b35d9` — 7 septembre 2026 — L'application, en une fois

Le produit entier arrive d'un bloc : deux rôles, tous les écrans, les métriques,
les graphiques, le thème. Six décisions fondatrices sont prises ici, et elles
tiennent toujours.

**1. Le métier est isolé dans un module pur.** `src/lib/metrics.ts` ne dépend ni
de React ni d'aucune I/O, et arrive avec 25 tests unitaires (vitest). C'est ce
qui rend la suite possible : le changement de backend, puis le changement de
graphiques, n'ont jamais eu à toucher au calcul.

**2. Fenêtres glissantes, pas semaines calendaires.** Les séries temporelles
utilisent des fenêtres de 7 jours glissants. Raison donnée : *une semaine
calendaire en cours est incomplète et produirait un faux décrochage en fin de
courbe*. (Cette décision sera nuancée, pas annulée, par l'arrivée du ratio
calendaire en `cb7ecd7`.)

**3. La persistance est une frontière, dès le premier jour.** Les données vivent
alors en `localStorage`, mais derrière `src/lib/db.ts`, décrit dans le message de
commit comme « remplaçable par un backend sans toucher aux écrans ». C'était une
promesse ; elle sera tenue quatre jours plus tard.

**4. Graphiques SVG maison, pas de librairie.** Justification : tenir les
contraintes d'accessibilité de bout en bout — palette validée pour les
déficiences de la vision des couleurs, vue tableau pour chaque graphique,
statuts portés par une icône **et** un libellé, jamais par la couleur seule.
Aucune librairie de graphiques ne donne ça sans se battre contre elle.

**5. Mobile exclusivement.** Navigation par onglets en bas, cibles ≥ 44 px,
saisie en quelques appuis. Sur grand écran, l'app reste dans une colonne au
format téléphone. Le contexte d'usage est le vestiaire.

**6. Un seul bloc d'analyse partagé.** `LoadDashboard` sert à la fois le tableau
de bord du joueur et la fiche joueur côté coach. Une seule définition des
indicateurs : joueur et staff regardent littéralement le même écran.

Un fichier `src/lib/seed.ts` génère alors des données de démonstration. Il
disparaîtra au commit suivant.

---

## `cb7ecd7` — 11 septembre 2026 — Backend Supabase, identité CBN, validation d'inscription

Le plus gros commit du projet. Trois chantiers en un.

### Passage de localStorage à Supabase

`db.ts` est réécrit pour Postgres + PostgREST, `auth.tsx` pour Supabase Auth.
Les écrans, eux, bougent peu : la frontière de `83b35d9` a tenu. `seed.ts` est
supprimé — avec une vraie base, les données de démo n'ont plus de place.

Les décisions de sécurité prises ici sont détaillées dans
[40-base-de-donnees-et-securite](40-base-de-donnees-et-securite.md). Les trois
qui structurent tout :

- **l'isolation est confiée à RLS, pas au client** — la clé `anon` est publique,
  seule la base peut protéger les données ;
- **les fonctions d'appui aux policies vivent dans un schéma `private`** —
  `security definer` pour casser la récursion d'une policy sur `profiles` qui
  interrogerait `profiles`, et hors de `public` pour que PostgREST ne les
  expose pas ;
- **rejoindre une équipe passe par `join_team(code)` en `security definer`** —
  parce que laisser lister les équipes rendrait les codes énumérables.

Quatre migrations arrivent dans le même commit, ce qui raconte une séquence de
correction en direct :

| Migration | Ce qu'elle règle |
|---|---|
| `…120000_initial_schema` | tables, index, policies, trigger de profil, `join_team` |
| `…120100_lock_schema_migrations` | la table d'outillage était exposée par PostgREST |
| `…120200_fix_helper_grants` | **l'erreur du jour** — voir ci-dessous |
| `…120300_profile_position_from_metadata` | le poste transite par les métadonnées du compte |

> **L'erreur à ne pas refaire.** La migration initiale révoquait `EXECUTE` sur
> les fonctions d'appui pour `authenticated`, en croyant durcir. Plus rien
> n'était lisible : « permission denied for function is_coach ». Une policy est
> évaluée **avec les privilèges du rôle appelant**, pas de son auteur. Le
> correctif rend `USAGE` sur le schéma et `EXECUTE` sur les fonctions à
> `authenticated` — sans rien ouvrir à l'API, puisque PostgREST n'expose que
> `public`.

Décision d'outillage associée : les migrations sont appliquées par un script
maison (`scripts/migrate.mjs`), pas par le CLI Supabase, chacune dans sa propre
transaction, l'état mémorisé dans `schema_migrations`. Et le certificat racine
de Supabase est **épinglé** (`scripts/supabase-ca.crt`) plutôt que de désactiver
la vérification TLS.

Décision de configuration : `vite.config.ts` **réinjecte** les variables
`SUPABASE_*` fournies par l'intégration Vercel sous le nom `VITE_*` attendu par
le client, plutôt que de dupliquer les valeurs dans une seconde paire de
variables — *deux sources de vérité à garder synchronisées*.

Décision de typage : le type `Database` est **écrit à la main** dans
`src/lib/supabase.ts`, parce que le modèle tient en trois tables et que la
génération demanderait le CLI Supabase dans la boucle de build.

Déploiement : `vercel.json` arrive, framework `vite`, avec la réécriture SPA.

### Le ratio hebdomadaire calendaire

C'est ici qu'apparaît le **second** ratio, avec `RatioTrendChart`. Le
commentaire de `metrics.ts` le présente comme une *lecture demandée par le
staff* : la charge de la semaine en cours comparée à la moyenne des 4 semaines
précédentes. Même famille que l'ACWR, deux différences assumées — fenêtres
calendaires et non glissantes, référence qui exclut la semaine en cours.

Les deux ratios sont exposés côte à côte et partagent la même grille de lecture
(`riskZone = acwrZone`). Voir [20-modele-metier](20-modele-metier.md) pour le
détail, notamment l'exclusion des semaines antérieures à la première séance du
joueur, qui évite qu'un nouvel arrivant passe en rouge dès sa première semaine.

### Identité CBN et accessibilité

Les tokens de thème reprennent l'identité crème / encre / rouge du CBN, **tout
en conservant** la palette data-viz validée CVD-safe pour les séries, les
statuts de risque et la rampe RPE. Le fichier CSS signale lui-même le
compromis : le rouge de marque est proche du rouge de statut critique, donc le
rouge porte deux rôles.

### Validation de l'inscription

`src/lib/validation.ts` arrive : format d'e-mail, détection de fautes de frappe
courantes **avec suggestion** (`gmial.com` → `gmail.com`), longueur et
composition du mot de passe, rejet des mots de passe courants et de ceux qui
contiennent le nom ou l'identifiant e-mail, jauge de robustesse. Les erreurs
n'apparaissent **qu'après sortie du champ** — on ne gronde pas quelqu'un qui est
en train de taper.

La philosophie du fichier est explicite : *RFC 5322 en entier n'a pas d'intérêt
ici ; on veut attraper les fautes de frappe réelles sans rejeter une adresse
valide. Le serveur reste l'autorité finale.*

---

## `98654f4` — 11 septembre 2026 — Suppression de la confirmation par e-mail

Onze minutes après le commit précédent. C'est un **retrait** de complexité, et
la justification est belle.

Le détour par les métadonnées `pending_*` et la fonction `settlePendingTeam`
n'existait, dit le message de commit, *que parce qu'une inscription sans session
ne peut rien écrire sous RLS*. Tant que Supabase exigeait une confirmation
d'e-mail, `signUp` ne renvoyait pas de session : impossible de créer l'équipe du
coach ou de rattacher le joueur dans la foulée. L'intention était donc stockée
dans les métadonnées du compte et réglée à la première connexion.

En désactivant « Confirm email » côté Supabase, la session s'ouvre
immédiatement et tout ce mécanisme devient inutile. Il est supprimé.

Deux décisions de robustesse l'accompagnent :

- **si la session n'est pas ouverte, on échoue franchement**, avec un message
  qui nomme le réglage Supabase à désactiver — plutôt que de laisser un compte
  sans équipe, que RLS rendrait de toute façon inutilisable ;
- **un code d'invitation invalide n'interrompt pas une inscription déjà actée**
  (le `joinTeamByCode` est dans un `try/catch` silencieux) : le compte existe, le
  joueur rejoindra son équipe depuis son profil.

Contrepartie assumée, inscrite dans le README : **l'application dépend d'un
réglage du tableau de bord Supabase** qui n'est pas versionné dans le dépôt.
C'est une dette d'exploitation, pas de code.

> Note : `scripts/smoke-rls.mjs` teste encore ce mécanisme disparu (section 6).
> Le test passe parce qu'il rejoue le flux lui-même, mais il ne vérifie plus rien
> d'existant.

---

## `1e13a7b` — 12 septembre 2026 — Charge 7 jours **par joueur**, au lieu de la moyenne d'effectif

Le bandeau du tableau de bord coach affichait une moyenne de l'effectif sur 7
jours glissants. Elle est supprimée. Diagnostic du message de commit : **elle
masquait les écarts entre joueurs**. Une moyenne d'équipe correcte peut
parfaitement cacher un joueur en surcharge et un joueur à l'arrêt.

Elle est remplacée par un **histogramme trié, une barre par joueur**, avec la
vue tableau associée (`acuteByPlayer` dans `src/lib/team.ts`).

Deuxième décision, plus fine : **les joueurs sans saisie restent affichés, à
zéro**. Justification : *côté staff, l'absence de déclaration est une
information*. Ne pas masquer une ligne vide.

Troisième : `avgAcute` est retiré de `TeamSummary`, n'ayant plus d'usage. Une
donnée dérivée sans consommateur est supprimée plutôt que conservée « au cas
où ».

Un fichier de tests `src/lib/__tests__/team.test.ts` arrive avec ce commit : les
agrégations d'équipe deviennent, elles aussi, du code testé.

---

## `3bff7e7` — 19 septembre 2026 — Échelle fixe 0–2 sur le graphique de ratio

L'axe du graphique de ratio ne s'adapte plus aux données : il va **toujours de 0
à 2**. Graduations fines tous les 0,1 ; valeurs chiffrées tous les 0,2 plus les
seuils de décision 0,8 / 1,3 / 1,5. La bande 0,8–1,3 est nommée dans le
graphique.

Justification, dans le commentaire du composant : *deux semaines, deux joueurs,
deux écrans se comparent sans relire l'axe*. Une échelle auto-adaptative fait
mentir la forme d'une courbe — une progression douce et un pic dangereux se
ressemblent quand l'axe se recale à chaque fois.

Un ratio au-delà de 2 est **ramené au plafond**, sa valeur exacte restant lisible
dans l'infobulle.

---

## 19 septembre 2026 — La vague des six chantiers (non committée)

Six chantiers menés en parallèle, à la suite des
[arbitrages du 19 septembre](70-arbitrages-2026-09-19.md) : modèles de charge,
invitations régénérables et freinées, création d'équipe atomique, suppression de
compte RGPD, pages légales, et outillage (ESLint, Prettier, CI, contrôle de
schéma, contrôle de palette).

Ce qui suit n'est pas la liste de ce qui a été fait — elle se lit dans le diff —
mais les décisions de conception dont la raison ne survivrait pas au diff.

### `join_team` renvoie `null` au lieu de lever une exception

Le contrat de la RPC a changé : un code refusé ne produit plus d'erreur, mais un
`null`.

Ce n'est pas un choix de style. **Compter les échecs et lever une exception sont
incompatibles dans une même transaction PL/pgSQL** : une exception qui remonte
hors de la fonction annule sa transaction, donc annulerait l'insertion de la
tentative qui vient d'être écrite. Le compteur serait resté à zéro et le frein
n'aurait rien freiné — un frein qui ne freine pas étant pire qu'aucun frein,
puisqu'on cesse de surveiller.

Bénéfice collatéral non recherché mais décisif : code inconnu, code révoqué,
code expiré et quota épuisé rendent tous exactement la même réponse. Distinguer
ces cas aurait fait de la limitation elle-même un oracle d'énumération.

Prix payé : `db.ts` ne peut plus s'appuyer sur le code d'erreur `P0002` pour
formuler son message, et le seul cas resté exceptionnel est l'appelant non
authentifié — parce qu'il ne dépend que de l'état de l'appelant et n'a rien à
comptabiliser.

### Le contexte de modèle passe par un provider React, pas par des props

`src/components/loadContext.tsx` monte le catalogue et l'historique des choix de
l'équipe au-dessus de tous les écrans.

La raison est une asymétrie de mode de défaillance. Une page qui aurait oublié
de recevoir la prop n'aurait produit **aucune erreur** : elle aurait affiché les
chiffres du modèle par défaut, silencieusement. Un faux plausible dans un outil
de pilotage de charge est plus dangereux qu'un écran cassé, parce que rien ne le
signale — ni au développeur, ni au coach. Le contexte rend l'oubli impossible à
commettre plutôt que détectable à la relecture.

Le catalogue voyage avec l'historique, pour que le formulaire de saisie sache
quels champs demander sans une requête de plus au moment précis où le joueur
ouvre l'écran.

### Autres décisions de la vague

- **`create_team` en une transaction.** L'ancienne séquence insert + update
  laissait, en cas d'échec du second appel, un coach non rattaché à l'équipe
  qu'il venait de créer — état que RLS rend quasiment irrécupérable côté client.
  Étant `security definer`, la fonction porte elle-même la règle d'autorisation
  que la policy portait.
- **Le chemin d'insertion directe dans `teams` est fermé** et la policy
  `teams_insert` supprimée avec lui. Une règle de sécurité qui décrit une
  opération devenue impossible est une règle qu'on finit par croire sur parole.
- **`delete_my_account` n'écrit qu'un seul `delete`**, sur `auth.users`, et
  laisse la cascade faire le reste. Une liste de suppressions écrite à la main
  aurait oublié en silence la table ajoutée six mois plus tard.
- **Le jeton d'invitation est tiré par la base**, jamais par le navigateur, et
  `random()` est écarté au profit de `gen_random_uuid()` : un code d'invitation
  est un secret, pas un identifiant.
- **`revoke update` sur la table puis `grant update (name)`**, et non un
  `revoke` colonne par colonne : Supabase accorde `update` au niveau de la
  table, et révoquer une colonne ne rogne pas un droit accordé sur la table
  entière. Écrit dans l'autre ordre, le verrou n'aurait rien verrouillé.
- **Le type `Database` reste écrit à la main, mais n'est plus cru sur parole.**
  `npm run check:schema` rejoue les migrations et compare. Une divergence
  délibérée se déclare dans une liste d'exception nommée, avec son motif —
  jamais en affaiblissant la règle.
- **La palette est passée d'une promesse à un contrôle.** `global.css`
  s'annonçait « CVD-safe » depuis `cb7ecd7` et renvoyait à un script absent du
  dépôt ; le script existe, il échouait sur sept points bien réels, et
  `npm run validate:palette` tourne désormais en CI. La contrainte des 3:1 sur
  fond crème a imposé d'assombrir nettement les séries data-viz 4 et 5 : sur
  cette surface, une couleur ambre ou rose ne peut pas être à la fois vive et
  lisible, et c'est la lisibilité qui l'emporte.

---

## Cadrage : modèles de charge

**Modèles de charge configurables.** Cadré par
[`00-contrat-modeles-de-charge.md`](00-contrat-modeles-de-charge.md), écrit par
le chef de projet et faisant autorité. L'objectif : permettre à chaque équipe de
choisir comment sa charge est calculée, dans un catalogue fermé de modèles issus
de la littérature, plutôt que de subir le `RPE × durée` codé en dur.

Trois principes du contrat méritent d'être connus même si on ne travaille pas
dessus, parce qu'ils décrivent des règles que le projet respecte déjà :

1. **stocker le brut, calculer à la lecture** — aucune charge n'est jamais
   persistée ; changer de modèle relit tout l'historique sans migration ;
2. **le modèle est versionné et daté** — un changement porte une date d'effet,
   pour pouvoir expliquer la forme d'une courbe de novembre ;
3. **catalogue fermé, jamais de formule libre**.

Le contrat introduit aussi la séparation entre charge **terrain** (`field`) et
charge **musculation** (`strength`), qui ne sont pas dans la même unité et ne
s'additionnent pas naïvement.

Ce cadrage est **livré** :
`supabase/migrations/20260919120000_load_models.sql` pour le schéma,
`src/lib/loadModels.ts` pour les formules, `src/components/loadContext.tsx` pour
leur diffusion dans l'app, et `src/pages/coach/LoadModelSettings.tsx` pour
l'écran de réglage.

---

## Ce que l'historique ne dit pas

- **Pourquoi MIT**, alors qu'une piste de commercialisation auprès de clubs
  existe par ailleurs. La licence n'a jamais été rediscutée.
- ~~**Qui est le CBN.**~~ Tranché : Club Badminton Nice, club d'origine. Le
  produit sort de ce périmètre — reste ouvert le choix entre une palette neutre
  unique et un thème par club.
- **Pourquoi un `HashRouter`** alors que `vercel.json` porte déjà la réécriture
  SPA qui permettrait un `BrowserRouter`.
- ~~**D'où vient la palette CVD-safe.**~~ Le script existe désormais et tourne
  en CI. Son *origine* reste inconnue : on sait ce que la palette respecte, pas
  qui l'a dessinée ni d'après quelle source.
- ~~**Qui a décidé des seuils de monotonie**~~ (1,5 / 2) : demande de Mateo,
  co-développeur et référent métier. Ils restent rattachés à aucune référence
  publiée — une page bibliographie dédiée est prévue.
- **S'il existe des utilisateurs réels en production.** Le README avertit que le
  service d'e-mail intégré de Supabase est plafonné à 2 envois par heure et
  réservé au développement, mais rien ne dit si un SMTP a été configuré depuis.
