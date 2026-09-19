# Vue d'ensemble

## Le problème

Un staff sportif qui veut piloter la charge d'entraînement de son effectif se
heurte à trois choses : les joueurs ne déclarent pas ce qu'ils ont ressenti, les
données finissent dans un tableur que personne ne relit, et les indicateurs de
la littérature (ACWR, monotonie, contrainte) demandent un calcul hebdomadaire
que personne n'a le temps de faire à la main.

RPE Tracker répond à ce problème avec la méthode **session-RPE** (Foster) : le
joueur note, après chaque séance, combien elle lui a coûté sur une échelle de 1
à 10, et combien de temps elle a duré. Le produit fait le reste.

## Pour qui

Deux profils, deux espaces distincts dans l'application. Le rôle est choisi à
l'inscription et ne change pas ensuite (voir les zones d'ombre en fin de
document).

### Le joueur

- saisit une séance en quelques appuis : date, type, durée, RPE ;
- consulte son tableau de bord : charge des 7 derniers jours, ratio de charge et
  sa zone de risque, monotonie, contrainte ;
- voit sa charge quotidienne sur 14 jours, sa tendance sur 8 fenêtres
  glissantes, la répartition de sa charge par type de séance ;
- relit et corrige son historique, groupé par semaine.

Un joueur ne voit **que** ses propres données. Il ne voit pas celles de ses
coéquipiers.

### Le coach

- suit son effectif : participation, charge de la semaine, joueurs hors de la
  zone optimale, classement triable par charge / risque / nom ;
- ouvre la fiche d'un joueur, qui reprend exactement le même bloc d'analyse que
  le tableau de bord de ce joueur ;
- gère son effectif et diffuse son code d'invitation à six caractères.

Le coach lit les séances de ses joueurs mais **ne peut pas les écrire** : un
joueur reste seul maître de ce qu'il déclare (`training_sessions_insert_own` et
ses jumelles, voir [40-base-de-donnees-et-securite](40-base-de-donnees-et-securite.md)).

## Ce que le produit n'est pas

- ce n'est pas un outil médical : les indicateurs sont des aides au pilotage,
  jamais un diagnostic. Le README le dit et l'app doit continuer à le dire ;
- il n'y a **aucune mesure instrumentée** (GPS, fréquence cardiaque) : tout ce
  qui entre est déclaré par le joueur, tonnage de musculation compris ;
- il n'y a pas de notion de saison, de compétition, ni de blessure enregistrée.

## Contraintes de conception assumées

**Mobile d'abord, et même mobile exclusivement.** La navigation est une barre
d'onglets en bas d'écran, les cibles tactiles font au moins 44 px, et sur grand
écran l'application reste dans une colonne au format téléphone. Le contexte
d'usage est le vestiaire, pas le bureau.

**Accessibilité prise au sérieux dans les graphiques.** Tous les graphiques sont
du SVG écrit à la main, sans librairie, pour garder la main de bout en bout :
palette validée pour les déficiences de la vision des couleurs, vue tableau
dépliable sous chaque graphique, statut toujours accompagné d'une icône et d'un
libellé (jamais la couleur seule), thème clair / sombre / système.

**Identité visuelle CBN.** Depuis le commit `cb7ecd7`, les tokens de thème
reprennent une identité crème / encre / rouge (`src/styles/global.css`). Le
rouge de marque est proche du rouge de statut critique, ce que le fichier signale
lui-même comme un compromis assumé.

**Modèle de charge configurable par équipe.** Le `RPE × durée` n'est plus codé
en dur : chaque équipe choisit sa formule dans un catalogue fermé issu de la
littérature (Foster, sRPE différencié de Weston, volume-load), séparément pour
le domaine terrain et le domaine musculation. Le choix est **daté** : changer de
modèle en novembre n'efface pas la manière dont octobre a été mesuré. Aucune
charge n'est persistée — le calcul se refait à la lecture, donc un changement de
modèle relit tout l'historique sans migration de données. Le cadrage fait
autorité et se lit dans
[`00-contrat-modeles-de-charge.md`](00-contrat-modeles-de-charge.md).

**Invitations révocables et suppression de compte.** Le code d'équipe se
régénère, s'assortit d'une expiration et se révoque ; il est freiné contre
l'énumération par force brute. Chacun exporte ses données (JSON et CSV) et
supprime son compte depuis son profil, sans passer par nous.

## Zones d'ombre

Ces questions ont été tranchées, voir
[70-arbitrages](70-arbitrages-2026-09-19.md) :

- « CBN » est le Club Badminton Nice, club d'origine du projet. **Le produit
  sort de ce périmètre** et vise plus large, multi-club et multi-sport :
  l'identité visuelle CBN est à neutraliser. Le dé-brandage du code est léger
  (trois occurrences) ; le choix entre une palette neutre unique et un thème par
  club, lui, n'est pas tranché et reste un chantier distinct.
- Un utilisateur ne change pas de rôle, un coach n'a qu'une équipe et une équipe
  qu'un coach : **limite temporaire assumée pour la V1**, pas une règle métier.

Reste ouvert :

- Le sport visé n'est jamais nommé. Les exemples de poste (« Ailier »,
  « Meneur ») et les types de séance sont volontairement génériques — ce qui
  sert directement l'ouverture multi-sport décidée ci-dessus.
