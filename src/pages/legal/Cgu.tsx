import { Link } from 'react-router-dom';
import { ACompleter, Article, H3, LegalPage, Li, NOM_SERVICE, P, Ul } from './LegalPage';

/**
 * Conditions générales d'utilisation — relation éditeur / utilisateur final
 * (joueur ou coach). La relation commerciale avec le club est traitée à part,
 * dans les CGV.
 *
 * L'avertissement « pas un dispositif médical » est volontairement mis en
 * avant : l'application affiche des indicateurs de charge (ratio aigu/chronique,
 * monotonie) dont la lecture pourrait être confondue avec un avis de santé.
 */
export function Cgu() {
  return (
    <LegalPage
      title="Conditions générales d’utilisation"
      intro={
        <>
          Les passages surlignés doivent être renseignés par l’éditeur avant toute mise en ligne
          publique. Ce document est un premier jet, à faire relire par un juriste.
        </>
      }
    >
      <Article title="Article 1 — Objet">
        <P>
          Les présentes conditions générales d’utilisation (les « CGU ») régissent l’accès et
          l’utilisation du service {NOM_SERVICE} (le « Service »), édité par{' '}
          <ACompleter>raison sociale de l’entreprise éditrice</ACompleter>.
        </P>
        <P>
          Le Service permet à un joueur de déclarer ses séances d’entraînement (date, type, durée,
          ressenti d’effort) et de visualiser sa charge d’entraînement dans le temps ; il permet au
          staff de son équipe de suivre cette charge afin d’adapter la programmation.
        </P>
        <P>
          La création d’un compte vaut acceptation pleine et entière des présentes CGU et de la{' '}
          <Link to="/confidentialite">politique de confidentialité</Link>.
        </P>
      </Article>

      <Article title="Article 2 — Le Service n’est pas un dispositif médical">
        <div
          className="alert alert--error"
          role="note"
          style={{ marginBottom: 10, lineHeight: 1.6 }}
        >
          <strong>{NOM_SERVICE} n’est pas un dispositif médical.</strong> Il ne pose aucun
          diagnostic, ne détecte aucune pathologie, ne prédit aucune blessure et ne remplace en
          aucun cas l’avis d’un médecin, d’un kinésithérapeute ou de tout autre professionnel de
          santé.
        </div>
        <P>
          Les indicateurs affichés — charge hebdomadaire, moyennes, ratio de charge aiguë sur
          chronique, monotonie, tendances — sont des repères d’aide à la programmation sportive,
          calculés à partir de déclarations subjectives du joueur. Ils comportent une marge
          d’incertitude importante et ne doivent jamais être lus comme une évaluation de l’état de
          santé d’une personne.
        </P>
        <P>
          En cas de douleur, de blessure, de fatigue anormale ou de tout symptôme, l’utilisateur
          doit consulter un professionnel de santé et en informer le staff selon les procédures de
          son club. Aucune information issue du Service ne doit conduire à retarder une consultation
          médicale.
        </P>
        <P>
          Le Service ne se substitue pas davantage à la surveillance médicale réglementaire des
          sportifs, ni aux obligations du club en la matière.
        </P>
      </Article>

      <Article title="Article 3 — Accès au Service et comptes">
        <H3>3.1 Conditions d’accès</H3>
        <P>
          L’accès au Service suppose un appareil connecté à internet doté d’un navigateur récent,
          ainsi qu’un abonnement en cours de validité souscrit par le club auquel l’utilisateur est
          rattaché.
        </P>
        <H3>3.2 Création de compte</H3>
        <P>
          L’utilisateur crée son compte avec une adresse e-mail valide et un mot de passe conforme
          aux exigences de robustesse affichées à l’inscription. Il s’engage à fournir des
          informations exactes et à les tenir à jour.
        </P>
        <H3>3.3 Mineurs</H3>
        <P>
          L’utilisation du Service par un joueur mineur suppose l’accord préalable de ses
          représentants légaux, recueilli par le club. Les modalités sont détaillées dans la{' '}
          <Link to="/confidentialite">politique de confidentialité</Link>.
        </P>
        <H3>3.4 Sécurité des identifiants</H3>
        <P>
          Le compte est strictement personnel. L’utilisateur est responsable de la confidentialité
          de son mot de passe et de toute activité réalisée depuis son compte. Toute utilisation
          suspecte doit être signalée sans délai à{' '}
          <ACompleter>adresse e-mail de contact</ACompleter>.
        </P>
      </Article>

      <Article title="Article 4 — Rôles et périmètre des droits">
        <H3>4.1 Joueur</H3>
        <Ul>
          <Li>Déclare ses séances, les modifie et les supprime.</Li>
          <Li>Consulte ses propres indicateurs de charge.</Li>
          <Li>Rejoint une équipe au moyen du code d’invitation fourni par son coach.</Li>
          <Li>
            Est informé que ses séances, commentaires compris, sont visibles nominativement par le
            coach de son équipe.
          </Li>
        </Ul>
        <H3>4.2 Coach</H3>
        <Ul>
          <Li>Crée une équipe et diffuse son code d’invitation aux joueurs concernés.</Li>
          <Li>Consulte, en lecture seule, les séances et indicateurs des joueurs de son équipe.</Li>
          <Li>Ne peut ni saisir, ni modifier, ni supprimer une séance à la place d’un joueur.</Li>
          <Li>
            S’engage à n’utiliser ces données qu’aux fins de suivi et de programmation de
            l’entraînement, à ne pas les diffuser hors du staff habilité par le club, et à ne pas
            en tirer d’appréciation médicale.
          </Li>
        </Ul>
        <P>
          Le code d’invitation permet de rejoindre une équipe : le coach est responsable de sa
          diffusion et doit le traiter comme une information sensible.
        </P>
      </Article>

      <Article title="Article 5 — Engagements de l’utilisateur">
        <P>L’utilisateur s’interdit notamment :</P>
        <Ul>
          <Li>de créer un compte au nom d’un tiers ou d’usurper une identité ;</Li>
          <Li>de partager ses identifiants ou de céder l’accès à son compte ;</Li>
          <Li>
            de saisir, dans le champ de commentaire, des informations médicales détaillées, des
            données concernant des tiers, ou des propos injurieux, diffamatoires ou discriminatoires ;
          </Li>
          <Li>
            d’extraire, de copier ou de diffuser hors du club les données d’entraînement d’autres
            utilisateurs ;
          </Li>
          <Li>
            de perturber le fonctionnement du Service, d’en contourner les mesures de sécurité ou
            d’y accéder par des moyens automatisés non autorisés ;
          </Li>
          <Li>
            de déclarer sciemment des séances inexactes de nature à fausser le suivi de la charge.
          </Li>
        </Ul>
        <P>
          En cas de manquement, l’éditeur peut suspendre ou fermer le compte concerné, après
          information du club, et sans préjudice de tout recours.
        </P>
      </Article>

      <Article title="Article 6 — Disponibilité, évolutions et maintenance">
        <P>
          L’éditeur met en œuvre les moyens raisonnables pour assurer la disponibilité du Service,
          sans garantie d’un accès ininterrompu. Le Service peut être suspendu pour maintenance,
          mise à jour ou en cas d’incident affectant ses prestataires d’hébergement.
        </P>
        <P>
          L’éditeur peut faire évoluer les fonctionnalités du Service. Une évolution réduisant de
          façon substantielle le périmètre fonctionnel est portée à la connaissance du club dans un
          délai raisonnable.
        </P>
      </Article>

      <Article title="Article 7 — Responsabilité">
        <P>
          L’éditeur fournit un outil de saisie et de visualisation. Il ne prend aucune décision
          sportive, médicale ou d’effectif, et ne saurait être tenu responsable :
        </P>
        <Ul>
          <Li>
            des décisions d’entraînement, de sélection ou de gestion prises par le club ou le staff
            au vu des données affichées ;
          </Li>
          <Li>
            des blessures, pathologies ou contre-performances, dont la survenue dépend de facteurs
            que le Service ne mesure pas ;
          </Li>
          <Li>de l’inexactitude des données déclarées par les utilisateurs eux-mêmes ;</Li>
          <Li>
            des conséquences d’une indisponibilité du Service, d’une perte de données imputable à un
            prestataire tiers, ou d’un usage non conforme aux présentes CGU.
          </Li>
        </Ul>
        <P>
          L’utilisateur reste seul responsable de l’écoute de son corps et du signalement de tout
          symptôme aux personnes compétentes.
        </P>
      </Article>

      <Article title="Article 8 — Propriété intellectuelle">
        <P>
          L’éditeur concède à l’utilisateur un droit d’usage personnel, non exclusif et non
          cessible du Service, pour la durée de l’abonnement souscrit par son club. Aucune autre
          cession de droit n’est consentie.
        </P>
      </Article>

      <Article title="Article 9 — Résiliation du compte">
        <P>
          L’utilisateur peut demander à tout moment la suppression de son compte à{' '}
          <ACompleter>adresse e-mail de contact</ACompleter>. La fin de l’abonnement du club
          entraîne la désactivation des comptes qui lui sont rattachés, puis la suppression des
          données selon les durées indiquées dans la{' '}
          <Link to="/confidentialite">politique de confidentialité</Link>.
        </P>
      </Article>

      <Article title="Article 10 — Modification des CGU">
        <P>
          Les présentes CGU peuvent être modifiées. Les utilisateurs sont informés de toute
          modification substantielle ; la poursuite de l’utilisation du Service après cette
          information vaut acceptation de la version modifiée.
        </P>
      </Article>

      <Article title="Article 11 — Droit applicable et juridiction">
        <P>
          Les présentes CGU sont soumises au droit français. À défaut de résolution amiable, tout
          litige relève des juridictions compétentes dans les conditions prévues par le droit commun.
          Le consommateur conserve la faculté de saisir un médiateur de la consommation.{' '}
          <ACompleter>
            désigner un médiateur de la consommation si des utilisateurs contractent à titre
            individuel, et indiquer ses coordonnées ici
          </ACompleter>
        </P>
      </Article>
    </LegalPage>
  );
}
