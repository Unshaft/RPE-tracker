# Le modèle métier : charge d'entraînement

C'est le cœur du produit. Tout ce qui suit est implémenté dans
`src/lib/metrics.ts`, fichier pur (aucune dépendance React, aucune I/O) et
couvert par `src/lib/__tests__/metrics.test.ts`. Les agrégations d'équipe qui
s'appuient dessus vivent dans `src/lib/team.ts`.

Aucune de ces valeurs n'est stockée en base : **tout est recalculé à la lecture**
à partir des séances brutes. C'est déjà vrai aujourd'hui, et c'est le premier
principe non négociable du contrat des modèles de charge à venir.

## L'unité : l'UA

Toutes les charges sont exprimées en **unités arbitraires (UA)**. Une UA n'a pas
de signification physique ; elle n'a de sens que comparée à une autre UA du même
joueur. Ne jamais afficher une UA comme une grandeur absolue interprétable, ni
comparer les UA de deux joueurs comme si elles mesuraient la même chose.

## La donnée d'entrée : la séance

Une séance, c'est un jour (`YYYY-MM-DD`, en heure locale du joueur — une date
nue, pas un instant), un type, une durée en minutes et un RPE.

Le **RPE** est noté sur l'échelle **CR-10 de Borg**, de 1 « très très facile » à
10 « maximal ». Les dix paliers sont libellés en français dans `RPE_SCALE`
(`src/lib/types.ts`) : le joueur choisit un ressenti, pas un nombre.

Les types de séance (`SESSION_TYPES`) sont : `entrainement`, `match`, `muscu`,
`individuel`, `recuperation`.

## Les formules

| Indicateur | Formule | Fonction |
|---|---|---|
| Charge d'une séance | `RPE × durée_min` | `sessionLoad` |
| Charge aiguë | somme des charges sur **7 jours glissants** | `acuteLoad` |
| Charge chronique | charge des **28 derniers jours ÷ 4** (ramenée à une semaine) | `chronicLoad` |
| **ACWR** | charge aiguë ÷ charge chronique | `acwr` |
| Monotonie | moyenne ÷ écart-type des charges quotidiennes sur 7 jours | `monotony` |
| Contrainte (*strain*) | charge hebdomadaire × monotonie | `strain` |

Les constantes `ACUTE_WINDOW = 7` et `CHRONIC_WINDOW = 28` sont exportées et
utilisées partout : elles ne sont jamais réécrites en dur ailleurs.

### Détails qui comptent

**Les jours de repos comptent.** `dailySeries` produit une valeur par jour de la
fenêtre, y compris `0` pour les jours sans séance. C'est essentiel pour la
monotonie : un joueur qui s'entraîne tous les jours au même niveau a une
monotonie élevée précisément parce qu'il n'a aucun jour à zéro.

**Écart-type de population, pas d'échantillon.** `stdDev` divise par `n` et non
par `n-1`. C'est la convention retenue par Foster ; le commentaire du code le
dit explicitement. Changer ce dénominateur changerait toutes les valeurs de
monotonie et de contrainte.

**`null` plutôt que zéro.** `acwr` renvoie `null` quand la charge chronique est
nulle, `monotony` renvoie `null` quand l'écart-type est nul. Un ratio indéfini
n'est pas un ratio de zéro, et un graphique doit interrompre sa ligne plutôt que
la ramener à zéro, ce qui se lirait à tort comme une sous-charge.

## Les seuils

### Zones ACWR (Gabbett)

`acwrZone` classe un ratio en quatre zones. Chaque zone porte un libellé, une
version courte pour les listes étroites, un rôle de statut, une icône et un
conseil.

| Ratio | Zone | Statut | Lecture |
|---|---|---|---|
| < 0,80 | Sous-charge | `warning` | baisse marquée, désentraînement possible si ça dure |
| 0,80 – 1,30 | Zone optimale | `good` | progression de charge maîtrisée |
| 1,30 – 1,50 | Vigilance | `serious` | montée rapide, surveiller la récupération |
| > 1,50 | Risque élevé | `critical` | pic de charge, alléger |

L'icône et le libellé accompagnent **toujours** la couleur : c'est une exigence
d'accessibilité, pas une préférence esthétique.

### Monotonie

`monotonyStatus` : `< 1,5` bien variée, `1,5 – 2` à surveiller, `≥ 2` trop
monotone.

## Pourquoi deux ratios coexistent

C'est le point le moins évident du modèle, et il est justifié dans les
commentaires de `src/lib/metrics.ts`. Il faut le comprendre avant de toucher à
quoi que ce soit ici.

L'application calcule **deux** estimations du même rapport « charge récente /
charge habituelle » :

**1. L'ACWR glissant** (`acwr`) — charge des 7 derniers jours rapportée à la
moyenne hebdomadaire des 28 derniers jours. C'est l'indicateur de la
littérature. Les deux fenêtres sont glissantes et **se recouvrent** : les 7
derniers jours sont inclus dans les 28.

**2. Le ratio hebdomadaire calendaire** (`weeklyRatio`) — charge de la semaine
calendaire en cours (lundi → dimanche) rapportée à la moyenne des **4 semaines
calendaires précédentes**, la semaine en cours étant **exclue** de la référence.

Le commentaire du fichier l'énonce ainsi : c'est la même famille d'indicateur,
avec deux différences assumées — fenêtres calendaires et non glissantes,
référence qui exclut la semaine en cours. Les deux sont exposés côte à côte.

**Pourquoi les deux ?** Parce qu'ils répondent à deux questions différentes.

- L'ACWR glissant répond à « où en suis-je aujourd'hui, par rapport à mon
  habitude ». Il est toujours défini, toujours comparable, il ne saute pas le
  lundi matin. C'est la lecture de référence côté **joueur**.
- Le ratio calendaire répond à « cette semaine, est-ce que je charge plus que
  d'habitude ». C'est la **lecture demandée par le staff**, qui raisonne en
  semaines de travail et non en fenêtres glissantes. C'est ce ratio, et pas
  l'ACWR, qui sert de zone de risque de référence dans `src/lib/team.ts`
  (`PlayerRow.zone`) et qui pilote le tri « Risque » du tableau de bord coach.

Les deux partagent la **même grille de lecture** : `riskZone` est un alias
explicite de `acwrZone` en fin de `metrics.ts`, avec le commentaire qui le
justifie. Si un jour les seuils devaient diverger entre les deux ratios, c'est
cet alias qu'il faudrait casser en premier.

### Deux pièges déjà traités dans le code

**Le faux décrochage de la semaine en cours.** Les séries temporelles
(`weeklySeries`) utilisent des fenêtres glissantes de 7 jours et non des
semaines calendaires : une semaine calendaire en cours est incomplète et
produirait une chute artificielle en bout de courbe. Quand une série est
malgré tout calendaire (`calendarWeeks`), chaque semaine porte `elapsedDays` et
`partial` pour que l'affichage puisse le signaler.

**Le nouvel arrivant en zone rouge.** `weeklyRatio` **exclut de la moyenne de
référence les semaines antérieures à la toute première séance du joueur**. Sans
cela, un joueur qui vient d'arriver aurait une référence artificiellement basse
(des semaines à zéro parce qu'il n'existait pas encore) et passerait en zone
rouge dès sa première semaine. En revanche, une semaine sans séance
**postérieure** à ses débuts compte bien pour 0 : c'est une vraie semaine de
repos, et elle doit peser.

**L'historique du ratio.** `weeklyRatioSeries` recalcule chaque point *tel qu'il
se présentait à la fin de sa propre semaine*, pour que la courbe reproduise ce
que le staff a vu sur le moment — et non une réécriture a posteriori.

## L'échelle du graphique de ratio

Depuis `3bff7e7`, l'axe de `RatioTrendChart` est **figé de 0 à 2**, quelles que
soient les données : graduations fines tous les 0,1, valeurs chiffrées tous les
0,2 plus les seuils de décision 0,8 / 1,3 / 1,5, et la bande 0,8–1,3 nommée dans
le graphique. La raison est dans le commentaire du composant : deux semaines,
deux joueurs, deux écrans doivent se comparer **sans relire l'axe**. Un ratio
au-delà de 2 est ramené au plafond, sa valeur exacte restant lisible dans
l'infobulle.

## La date de référence

`referenceDay` renvoie aujourd'hui, **ou** la date de la dernière séance si elle
est dans le futur. Une séance saisie en avance ne doit pas sortir des fenêtres
de calcul.

## Agrégations d'équipe

`src/lib/team.ts` construit une ligne par joueur (`buildTeamRows`) puis en tire :

- `summarizeTeam` : effectif, joueurs actifs sur la semaine, nombre de séances
  sur 7 jours, charge hebdomadaire moyenne des **joueurs actifs**, et la liste
  des alertes (tout joueur dont la zone n'est pas `optimal`) ;
- `sortRows` : tri par charge de la semaine, par ratio (les plus risqués en
  tête) ou par nom ;
- `teamWeeklyAverage` : charge hebdomadaire moyenne de l'effectif, semaine
  calendaire par semaine calendaire ;
- `acuteByPlayer` : charge des 7 derniers jours **joueur par joueur**, triée
  décroissante, les joueurs sans saisie restés à zéro — voir le journal des
  décisions, commit `1e13a7b`.

Attention à une subtilité : `avgWeekLoad` moyenne sur les joueurs **actifs**
seulement, alors que `acuteByPlayer` liste **tout le monde**. Ce n'est pas une
incohérence : une moyenne diluée par les absents ne veut rien dire, alors qu'une
liste qui masque les absents cache une information.

## Références citées dans le code

- **Foster, 1998 / 2001** — méthode session-RPE, monotonie, contrainte.
- **Gabbett** — zones de l'ACWR (0,80 / 1,30 / 1,50).
- **Borg** — échelle CR-10.

Le code cite ces auteurs sans référence bibliographique complète. Si la doc
produit doit un jour citer ses sources précisément, c'est une question à poser à
l'auteur.

## Zones d'ombre

- Le choix de `4` semaines de référence (`WEEKLY_LOOKBACK`) pour le ratio
  calendaire n'est justifié nulle part : cohérence avec la fenêtre chronique de
  28 jours, ou demande du staff ? Le contrat en fait un paramètre configurable
  (2 à 8), ce qui suggère qu'il n'y a pas de valeur canonique.
- Les seuils de monotonie (1,5 / 2) ne sont rattachés à aucune référence dans le
  code, contrairement aux seuils ACWR.
- Le seuil de monotonie n'a pas de quatrième palier alors que l'ACWR en a
  quatre : `monotonyStatus` ne renvoie jamais `serious`. Volontaire ?
