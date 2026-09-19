import { Link } from 'react-router-dom';
import { ACompleter, Article, H3, LegalPage, Li, NOM_SERVICE, P, Ul } from './LegalPage';

/**
 * Politique de confidentialité (RGPD).
 *
 * Point d'attention : le RPE est un ressenti d'effort nominatif, associé à une
 * durée et parfois à un commentaire libre. Ce n'est pas formellement une donnée
 * de santé au sens de l'article 9 du RGPD, mais on en est proche, et le
 * commentaire libre peut en contenir (blessure, douleur, fatigue). Le texte
 * adopte donc le niveau d'exigence des données sensibles.
 *
 * Les destinataires décrits ici correspondent exactement aux politiques RLS
 * définies dans `supabase/migrations/20260911120000_initial_schema.sql` :
 *  - un joueur voit ses propres séances ;
 *  - le coach de l'équipe voit, en lecture seule, les séances de ses joueurs ;
 *  - tout membre d'une équipe voit le profil (nom, e-mail, poste) des autres
 *    membres de cette équipe.
 */
export function Confidentialite() {
  return (
    <LegalPage
      title="Politique de confidentialité"
      intro={
        <>
          Les passages surlignés doivent être renseignés par l’éditeur avant toute mise en ligne
          publique. Ce document est un premier jet, à faire relire par un juriste.
        </>
      }
    >
      <Article title="En bref">
        <Ul>
          <Li>
            Ton coach voit tes séances : date, type, durée, RPE et commentaire. Il ne peut ni les
            modifier ni les supprimer.
          </Li>
          <Li>Les autres joueurs de ton équipe voient ton nom, ton e-mail et ton poste — pas tes séances.</Li>
          <Li>Tes données ne sont ni vendues, ni louées, ni utilisées à des fins publicitaires.</Li>
          <Li>Aucun cookie publicitaire, aucun traceur, aucune mesure d’audience tierce.</Li>
          <Li>
            Tu exportes tes données et tu supprimes ton compte toi-même, depuis l’écran « Profil ».
            Aucune demande à formuler, aucun délai à attendre.
          </Li>
        </Ul>
        <P>
          Ce résumé n’a pas de valeur contractuelle : seules les sections détaillées ci-dessous
          font foi.
        </P>
      </Article>

      <Article title="1. Qui traite les données et à quel titre">
        <P>
          {NOM_SERVICE} est mis à disposition d’un club, qui décide de l’utiliser pour suivre la
          charge d’entraînement de ses joueurs, désigne les personnes concernées et fixe les usages
          qu’il fait des résultats.
        </P>
        <Ul>
          <Li>
            <strong>Le club</strong> (<ACompleter>raison sociale du club client, par contrat</ACompleter>)
            agit en qualité de <strong>responsable de traitement</strong> pour les données des
            joueurs et du staff saisies dans l’application.
          </Li>
          <Li>
            <strong>L’éditeur</strong> (<ACompleter>raison sociale de l’entreprise éditrice</ACompleter>)
            agit en qualité de <strong>sous-traitant</strong> au sens de l’article 28 du RGPD : il
            héberge, exploite et maintient le Service pour le compte du club, et ne traite les
            données que sur instruction de celui-ci.
          </Li>
          <Li>
            L’éditeur est en revanche <strong>responsable de traitement</strong> pour ses propres
            traitements : gestion de la relation client, facturation, comptabilité, sécurité et
            journalisation technique.
          </Li>
        </Ul>
        <P>
          Cette répartition est formalisée dans un contrat de sous-traitance (accord de traitement
          des données) conclu entre le club et l’éditeur.{' '}
          <ACompleter>
            confirmer ce schéma avec un juriste et annexer le contrat de sous-traitance au contrat
            d’abonnement
          </ACompleter>
        </P>
      </Article>

      <Article title="2. Données collectées">
        <H3>Données de compte</H3>
        <Ul>
          <Li>Prénom, nom.</Li>
          <Li>Adresse e-mail (identifiant de connexion).</Li>
          <Li>Mot de passe, stocké sous forme d’empreinte chiffrée par le service d’authentification ; l’éditeur n’y a jamais accès en clair.</Li>
          <Li>Rôle : joueur ou coach.</Li>
          <Li>Poste ou spécialité, facultatif et saisi librement (ex. « ailier », « meneur »).</Li>
          <Li>Équipe de rattachement et date de création du compte.</Li>
        </Ul>

        <H3>Données d’entraînement</H3>
        <Ul>
          <Li>Date de la séance.</Li>
          <Li>Type de séance : entraînement, match, musculation, individuel, récupération.</Li>
          <Li>Durée en minutes.</Li>
          <Li>
            RPE : ressenti d’effort sur l’échelle CR-10 de Borg (de 1 à 10), déclaré par le joueur
            lui-même.
          </Li>
          <Li>
            Commentaire libre, facultatif. Ce champ est optionnel et ne doit pas servir à
            consigner des informations médicales (diagnostic, blessure, traitement) : pour cela,
            adresse-toi au staff médical du club par les canaux prévus à cet effet.
          </Li>
        </Ul>
        <P>
          Les indicateurs affichés dans l’application (charge hebdomadaire, moyennes, ratio de
          charge aiguë sur chronique, monotonie) sont <strong>calculés</strong> à partir de ces
          données et ne sont pas stockés séparément.
        </P>

        <H3>Données techniques</H3>
        <Ul>
          <Li>
            Journaux techniques produits par l’hébergement et le service d’authentification
            (adresse IP, horodatage, type de requête, agent utilisateur), à des fins de sécurité et
            de diagnostic.
          </Li>
        </Ul>

        <H3>Statut de ces données</H3>
        <P>
          Le ressenti d’effort et la durée d’entraînement ne constituent pas, en eux-mêmes, des
          données concernant la santé au sens de l’article 9 du RGPD. Ils relèvent néanmoins du
          bien-être physique et permettent, par recoupement, d’inférer un état de fatigue. L’éditeur
          leur applique donc par précaution le niveau de protection réservé aux données sensibles :
          minimisation, cloisonnement par équipe, accès restreint, chiffrement des flux.{' '}
          <ACompleter>
            faire qualifier ce point par un juriste : si le club associe ces données à un suivi
            médical, une analyse d’impact (AIPD) devient probablement nécessaire
          </ACompleter>
        </P>
      </Article>

      <Article title="3. Finalités et bases légales">
        <Ul>
          <Li>
            <strong>Permettre au joueur de suivre sa charge d’entraînement</strong> et au staff
            d’ajuster la programmation et de prévenir le surentraînement — base légale :{' '}
            <strong>intérêt légitime</strong> du club à assurer la préparation et la sécurité de ses
            joueurs (art. 6.1.f), ou <strong>exécution du contrat</strong> liant le joueur au club
            lorsque le suivi de la charge en fait partie (art. 6.1.b).
          </Li>
          <Li>
            <strong>Gérer les comptes, l’authentification et le rattachement aux équipes</strong> —
            base légale : <strong>exécution du contrat</strong> d’utilisation du Service (art. 6.1.b).
          </Li>
          <Li>
            <strong>Assurer la sécurité du Service</strong> (journalisation, détection d’abus) —
            base légale : <strong>intérêt légitime</strong> de l’éditeur (art. 6.1.f).
          </Li>
          <Li>
            <strong>Gérer la relation client et la facturation</strong> du club — bases légales :{' '}
            <strong>exécution du contrat</strong> (art. 6.1.b) et <strong>obligation légale</strong>{' '}
            comptable (art. 6.1.c).
          </Li>
          <Li>
            <strong>Enregistrer un commentaire libre sur une séance</strong> — base légale :{' '}
            <strong>consentement</strong> du joueur, ce champ étant facultatif et laissé à sa seule
            initiative (art. 6.1.a).
          </Li>
        </Ul>
        <P>
          Aucune décision produisant des effets juridiques ou affectant significativement une
          personne n’est prise de façon exclusivement automatisée par le Service. Les indicateurs
          affichés sont des aides à la décision : l’interprétation et les décisions sportives
          relèvent du staff.
        </P>
      </Article>

      <Article title="4. Qui voit quoi">
        <P>
          Le cloisonnement décrit ci-dessous est imposé techniquement par la base de données
          (politiques de sécurité au niveau des lignes), et pas seulement par l’interface.
        </P>
        <H3>Le joueur</H3>
        <Ul>
          <Li>Voit, modifie et supprime ses propres séances.</Li>
          <Li>Voit le nom, l’e-mail et le poste des autres membres de son équipe.</Li>
          <Li>Ne voit pas les séances des autres joueurs.</Li>
        </Ul>
        <H3>Le coach de l’équipe</H3>
        <Ul>
          <Li>
            <strong>Voit, en lecture seule, l’intégralité des séances des joueurs de son
            équipe</strong> : date, type, durée, RPE, commentaire libre, ainsi que tous les
            indicateurs calculés à partir de ces séances (charge hebdomadaire, ratio de charge,
            tendances).
          </Li>
          <Li>Ne peut ni créer, ni modifier, ni supprimer une séance à la place d’un joueur.</Li>
          <Li>
            Gère le nom de l’équipe et son code d’invitation. Le code se régénère et se révoque à
            tout moment, et peut être assorti d’une date d’expiration : régénérer invalide
            immédiatement le code précédent, révoquer ferme l’équipe à toute nouvelle arrivée. Un
            joueur exclu du club ne peut donc pas revenir avec un code qu’il aurait conservé.
          </Li>
          <Li>
            Exporte les données de son équipe, en JSON et en CSV, depuis l’écran « Profil ».
          </Li>
        </Ul>
        <P>
          <strong>
            Ce point doit être compris avant toute saisie : ce que tu déclares est visible par ton
            coach, nominativement.
          </strong>{' '}
          Le Service n’offre pas de mode anonyme ni de saisie masquée.
        </P>
        <H3>L’éditeur</H3>
        <Ul>
          <Li>
            Accède aux données uniquement dans le cadre de l’exploitation technique du Service
            (maintenance, correction d’incident, restauration de sauvegarde), sur instruction du
            club, et en limitant l’accès aux seules personnes habilitées.
          </Li>
          <Li>Ne consulte pas les données à des fins sportives, commerciales ou statistiques nominatives.</Li>
        </Ul>
        <H3>Tiers</H3>
        <Ul>
          <Li>
            Aucune donnée n’est vendue, louée, échangée ni transmise à des annonceurs, courtiers en
            données ou réseaux sociaux.
          </Li>
          <Li>
            Les seuls tiers destinataires sont les sous-traitants techniques listés à la section 6.
          </Li>
        </Ul>
      </Article>

      <Article title="5. Durées de conservation">
        <Ul>
          <Li>
            <strong>Compte et profil</strong> : conservés pendant toute la durée d’utilisation du
            Service, puis supprimés{' '}
            <ACompleter>
              délai retenu après la fin de l’abonnement du club — proposition : 3 mois
            </ACompleter>
            .
          </Li>
          <Li>
            <strong>Séances d’entraînement</strong> : conservées pendant la durée de l’abonnement du
            club, afin de permettre la comparaison d’une saison à l’autre, puis supprimées{' '}
            <ACompleter>
              délai retenu après la fin de l’abonnement — proposition : 3 mois, le temps d’un export
            </ACompleter>
            . Le joueur peut supprimer une séance à tout moment, sans délai.
          </Li>
          <Li>
            <strong>Journaux techniques</strong> : conservés{' '}
            <ACompleter>
              durée retenue pour les journaux — proposition : 12 mois maximum, conformément à la
              recommandation de la CNIL
            </ACompleter>
            .
          </Li>
          <Li>
            <strong>Pièces comptables et factures</strong> : conservées 10 ans, en application de
            l’article L. 123-22 du code de commerce.
          </Li>
        </Ul>
        <P>
          À l’expiration de ces durées, les données sont supprimées ou anonymisées de façon
          irréversible.
        </P>
      </Article>

      <Article title="6. Sous-traitants et localisation des données">
        <P>
          L’éditeur fait appel aux prestataires suivants, sélectionnés pour leurs garanties de
          sécurité et liés par un engagement de confidentialité :
        </P>
        <Ul>
          <Li>
            <strong>Vercel Inc.</strong> — hébergement et diffusion de l’interface web. Aucune donnée
            d’entraînement n’est stockée par ce prestataire ; il sert les fichiers de l’application
            et journalise les requêtes.
          </Li>
          <Li>
            <strong>Supabase</strong> — base de données PostgreSQL et service d’authentification :
            c’est là que résident les comptes, les équipes et les séances. Région d’hébergement du
            projet :{' '}
            <ACompleter>
              région du projet Supabase (Settings → General) ; privilégier une région de l’Union
              européenne, par exemple eu-west-3 (Paris) ou eu-central-1 (Francfort)
            </ACompleter>
            .
          </Li>
          <Li>
            <ACompleter>
              ajouter, le cas échéant, le prestataire de facturation ou de paiement utilisé pour les
              abonnements des clubs
            </ACompleter>
          </Li>
        </Ul>
        <H3>Transferts hors Union européenne</H3>
        <P>
          Vercel Inc. et Supabase Inc. sont des sociétés de droit américain. Même lorsque les
          données sont stockées dans une région européenne, un accès depuis les États-Unis par leurs
          équipes de support ne peut être totalement exclu. Ces transferts sont encadrés par les
          clauses contractuelles types de la Commission européenne et, le cas échéant, par
          l’adhésion du prestataire au cadre de protection des données UE–États-Unis.{' '}
          <ACompleter>
            vérifier et documenter, pour chaque prestataire, l’instrument de transfert effectivement
            applicable (clauses contractuelles types, certification DPF) et conserver la preuve au
            registre des traitements
          </ACompleter>
        </P>
      </Article>

      <Article title="7. Joueurs mineurs">
        <P>
          Le Service est susceptible d’être utilisé par des joueurs mineurs, notamment dans les
          catégories de formation.
        </P>
        <Ul>
          <Li>
            <strong>Moins de 15 ans</strong> : l’inscription et l’utilisation du Service supposent le
            consentement du ou des titulaires de l’autorité parentale, recueilli par le club
            préalablement à la création du compte (art. 8 du RGPD et art. 45 de la loi
            Informatique et Libertés).
          </Li>
          <Li>
            <strong>De 15 à 18 ans</strong> : le mineur peut consentir seul aux traitements fondés
            sur le consentement, l’information des représentants légaux restant recommandée.
          </Li>
          <Li>
            Le club se porte garant du recueil, de la conservation et de la preuve de cette
            autorisation parentale, ainsi que de la remise d’une information adaptée à l’âge du
            joueur.
          </Li>
          <Li>
            Les représentants légaux d’un joueur mineur exercent les droits décrits à la section 9
            pour le compte de celui-ci.
          </Li>
        </Ul>
        <P>
          <ACompleter>
            prévoir un formulaire d’autorisation parentale type, fourni au club avec le contrat
            d’abonnement — à date, l’application ne recueille ni ne conserve cette autorisation
          </ACompleter>
        </P>
      </Article>

      <Article title="8. Sécurité">
        <Ul>
          <Li>Chiffrement des échanges entre l’appareil et les serveurs (HTTPS/TLS).</Li>
          <Li>
            Authentification par e-mail et mot de passe, avec exigences de robustesse contrôlées à
            l’inscription ; le mot de passe n’est jamais stocké en clair.
          </Li>
          <Li>
            Cloisonnement des données au niveau de la base : chaque requête est filtrée selon
            l’identité et le rôle de l’utilisateur, indépendamment de l’interface.
          </Li>
          <Li>Sauvegardes gérées par l’hébergeur de base de données.</Li>
        </Ul>
        <P>
          En cas de violation de données présentant un risque pour les personnes, le club en est
          informé sans délai injustifié afin qu’il procède, s’il y a lieu, à la notification à la
          CNIL dans les 72 heures et à l’information des personnes concernées.
        </P>
      </Article>

      <Article title="9. Tes droits">
        <P>
          Conformément au RGPD et à la loi Informatique et Libertés, tu disposes des droits
          suivants :
        </P>
        <Ul>
          <Li>
            <strong>Accès</strong> : obtenir une copie des données te concernant.
          </Li>
          <Li>
            <strong>Rectification</strong> : corriger une donnée inexacte. Le prénom, le nom et le
            poste sont directement modifiables depuis l’écran « Profil ».
          </Li>
          <Li>
            <strong>Effacement</strong> : supprimer toi-même ton compte depuis l’écran « Profil ».
            La suppression est immédiate et définitive : identité, profil, séances et tentatives de
            rattachement partent ensemble, sans demande préalable ni délai de traitement. Si tu es
            coach, elle emporte aussi ton équipe, et tu dois le confirmer explicitement — les
            joueurs, eux, sont détachés de l’équipe mais conservent leur compte et leurs séances.
            Chaque séance peut par ailleurs être supprimée seule depuis l’historique.
          </Li>
          <Li>
            <strong>Limitation</strong> et <strong>opposition</strong> : demander le gel d’un
            traitement, ou t’opposer à un traitement fondé sur l’intérêt légitime pour des raisons
            tenant à ta situation particulière.
          </Li>
          <Li>
            <strong>Portabilité</strong> : recevoir tes données dans un format structuré et
            couramment utilisé. L’écran « Profil » les télécharge à la demande, en JSON et en CSV :
            ton profil et l’intégralité de tes séances, sans passer par nous.
          </Li>
          <Li>
            <strong>Retrait du consentement</strong> à tout moment, pour les traitements qui en
            dépendent, sans effet sur la licéité des traitements déjà réalisés.
          </Li>
          <Li>
            <strong>Directives post mortem</strong> : définir le sort de tes données après ton décès.
          </Li>
        </Ul>
        <H3>Comment les exercer</H3>
        <P>
          L’accès, la portabilité et l’effacement s’exercent directement dans l’application, sans
          nous écrire : l’écran « Profil » télécharge l’export et supprime le compte. Pour les
          autres droits, ou si l’un de ces écrans ne répond pas, la voie écrite reste ouverte.
        </P>
        <P>
          Adresse ta demande à <ACompleter>adresse e-mail dédiée aux demandes RGPD</ACompleter>, ou
          par courrier à <ACompleter>adresse postale du siège social</ACompleter>. Une réponse est
          apportée dans un délai d’un mois, prolongeable de deux mois en cas de demande complexe. Un
          justificatif d’identité peut être demandé en cas de doute raisonnable.
        </P>
        <P>
          Si ta demande porte sur les données d’entraînement, elle peut être adressée indifféremment
          au club ou à l’éditeur : l’éditeur la transmettra au club, responsable de traitement.
        </P>
        <H3>Référent protection des données</H3>
        <P>
          Contact du référent (ou délégué à la protection des données, s’il en est désigné un) :{' '}
          <ACompleter>nom et adresse e-mail du DPO ou du référent RGPD</ACompleter>.{' '}
          <ACompleter>
            déterminer avec un juriste si la désignation d’un DPO est obligatoire ici — le suivi
            régulier et systématique de joueurs, dont des mineurs, peut le rendre nécessaire
          </ACompleter>
        </P>
        <H3>Réclamation</H3>
        <P>
          Si tu estimes, après nous avoir contactés, que tes droits ne sont pas respectés, tu peux
          introduire une réclamation auprès de la Commission nationale de l’informatique et des
          libertés (CNIL), 3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07, ou sur cnil.fr.
        </P>
      </Article>

      <Article title="10. Cookies et stockage local">
        <P>
          Le Service n’utilise aucun cookie publicitaire ni outil de mesure d’audience tiers. Le
          détail de ce qui est réellement conservé dans le navigateur figure dans la{' '}
          <Link to="/cookies">politique de cookies et de stockage local</Link>.
        </P>
      </Article>

      <Article title="11. Modification de la présente politique">
        <P>
          Cette politique peut évoluer, notamment en cas d’évolution du Service ou de la
          réglementation. Toute modification substantielle est portée à la connaissance des
          utilisateurs et des clubs par un moyen approprié. La date de dernière mise à jour figure
          en tête de page.
        </P>
      </Article>
    </LegalPage>
  );
}
