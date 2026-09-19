import { Link } from 'react-router-dom';
import { ACompleter, Article, H3, LegalPage, Li, NOM_SERVICE, P, Ul } from './LegalPage';

/**
 * Conditions générales de vente — relation éditeur / club.
 *
 * Vente entre professionnels : pas de droit de rétractation de l'article
 * L. 221-18 du code de la consommation, mais des mentions propres au B2B
 * (pénalités de retard, indemnité forfaitaire de recouvrement de 40 €).
 * L'abonnement est calé sur la saison sportive, pas sur l'année civile.
 */
export function Cgv() {
  return (
    <LegalPage
      title="Conditions générales de vente"
      intro={
        <>
          Les passages surlignés doivent être renseignés par l’éditeur avant toute mise en ligne
          publique. Ce document est un premier jet, à faire relire par un juriste.
        </>
      }
    >
      <Article title="Article 1 — Champ d’application">
        <P>
          Les présentes conditions générales de vente (les « CGV ») s’appliquent à toute
          souscription d’un abonnement au service {NOM_SERVICE} par un club, une association
          sportive, une société sportive ou toute autre personne morale (le « Client »), auprès de{' '}
          <ACompleter>raison sociale de l’entreprise éditrice</ACompleter> (l’« Éditeur »).
        </P>
        <P>
          Le Service est destiné à un usage professionnel, dans le cadre de l’activité sportive du
          Client. Il n’est pas proposé à des consommateurs au sens du code de la consommation.
        </P>
        <P>
          Toute commande implique l’acceptation sans réserve des présentes CGV, qui prévalent sur
          les conditions d’achat du Client, sauf accord écrit contraire. Les CGV sont complétées par
          les <Link to="/cgu">conditions générales d’utilisation</Link> et par la{' '}
          <Link to="/confidentialite">politique de confidentialité</Link>.
        </P>
      </Article>

      <Article title="Article 2 — Description de l’abonnement">
        <P>
          L’abonnement donne au Client, pour la durée souscrite, un droit d’accès au Service pour
          les membres qu’il désigne : joueurs et membres du staff, dans la limite du périmètre
          convenu.
        </P>
        <Ul>
          <Li>
            Périmètre inclus :{' '}
            <ACompleter>
              nombre d’équipes et de comptes joueurs inclus, ou formule retenue (par équipe, par
              joueur, par club)
            </ACompleter>
          </Li>
          <Li>
            Prestations incluses : hébergement, mises à jour correctives et évolutives du Service,
            support tel que décrit à l’article 7.
          </Li>
          <Li>
            Prestations en option :{' '}
            <ACompleter>
              options éventuelles (accompagnement au déploiement, formation du staff, export de
              données, engagement de niveau de service renforcé) et leur tarification
            </ACompleter>
          </Li>
        </Ul>
      </Article>

      <Article title="Article 3 — Prix">
        <P>
          Les prix sont exprimés en euros et hors taxes ; la taxe sur la valeur ajoutée au taux en
          vigueur s’y ajoute.
        </P>
        <Ul>
          <Li>
            Tarif de l’abonnement à la saison :{' '}
            <ACompleter>montant HT de l’abonnement par saison et unité facturée</ACompleter>
          </Li>
          <Li>
            Frais de mise en service éventuels :{' '}
            <ACompleter>frais de mise en service, ou mention « néant »</ACompleter>
          </Li>
        </Ul>
        <P>
          Les tarifs peuvent être révisés d’une saison à l’autre. Toute révision est notifiée au
          Client au plus tard{' '}
          <ACompleter>
            délai de préavis de révision tarifaire — proposition : deux mois avant le début de la
            saison suivante
          </ACompleter>
          , le Client restant libre de ne pas renouveler.
        </P>
      </Article>

      <Article title="Article 4 — Durée, saison sportive et renouvellement">
        <H3>4.1 Durée</H3>
        <P>
          L’abonnement est souscrit pour une <strong>saison sportive</strong> complète, définie
          comme la période allant du{' '}
          <ACompleter>
            date de début de saison retenue — proposition : 1er juillet
          </ACompleter>{' '}
          au{' '}
          <ACompleter>date de fin de saison retenue — proposition : 30 juin de l’année suivante</ACompleter>
          , quelle que soit la date effective de souscription.
        </P>
        <P>
          Une souscription intervenant en cours de saison couvre la période restant à courir
          jusqu’à la fin de la saison en cours ; le prix est alors{' '}
          <ACompleter>
            règle de proratisation retenue en cas de souscription en cours de saison — préciser si
            le tarif est proratisé ou dû en totalité
          </ACompleter>
          .
        </P>
        <H3>4.2 Renouvellement</H3>
        <P>
          L’abonnement{' '}
          <ACompleter>
            choisir : « se renouvelle tacitement pour une saison supplémentaire » ou « ne se
            renouvelle pas tacitement et suppose une nouvelle commande »
          </ACompleter>
          . En cas de reconduction tacite, le Client peut y mettre fin par écrit au plus tard{' '}
          <ACompleter>
            délai de préavis de non-reconduction — proposition : un mois avant le terme de la saison
          </ACompleter>
          .
        </P>
      </Article>

      <Article title="Article 5 — Commande, facturation et paiement">
        <H3>5.1 Commande</H3>
        <P>
          La commande est formalisée par la signature d’un devis, d’un bon de commande ou d’un
          contrat d’abonnement. Le contrat est réputé conclu à la date de cette signature.
        </P>
        <H3>5.2 Facturation</H3>
        <P>
          L’abonnement est facturé{' '}
          <ACompleter>
            rythme de facturation retenu — proposition : en une fois, à la souscription, pour la
            saison entière
          </ACompleter>
          . Les factures sont adressées par voie électronique à l’adresse communiquée par le Client.
        </P>
        <H3>5.3 Paiement</H3>
        <P>
          Le délai de paiement est de{' '}
          <ACompleter>
            délai de paiement retenu — proposition : 30 jours à compter de la date de facture,
            plafond légal de 60 jours à ne pas dépasser
          </ACompleter>
          . Moyens de paiement acceptés :{' '}
          <ACompleter>moyens de paiement acceptés (virement, prélèvement, carte…)</ACompleter>.
        </P>
        <H3>5.4 Retard de paiement</H3>
        <P>
          Tout retard de paiement entraîne de plein droit, sans mise en demeure préalable,
          l’application de pénalités de retard au taux d’intérêt appliqué par la Banque centrale
          européenne à son opération de refinancement la plus récente majoré de 10 points de
          pourcentage, ainsi qu’une indemnité forfaitaire pour frais de recouvrement de 40 euros
          (art. L. 441-10 et D. 441-5 du code de commerce), sans préjudice d’une indemnisation
          complémentaire sur justificatifs.
        </P>
        <P>
          En cas d’impayé persistant plus de{' '}
          <ACompleter>délai retenu avant suspension — proposition : 15 jours</ACompleter> après mise
          en demeure restée infructueuse, l’Éditeur peut suspendre l’accès au Service jusqu’à
          régularisation, sans que cette suspension ouvre droit à indemnité ni ne dispense du
          paiement des sommes dues.
        </P>
      </Article>

      <Article title="Article 6 — Absence de droit de rétractation">
        <P>
          Le Client contracte dans le cadre de son activité professionnelle. Le droit de
          rétractation de quatorze jours prévu à l’article L. 221-18 du code de la consommation ne
          lui est donc pas applicable.
        </P>
        <P>
          Il n’est pas davantage applicable au titre de l’article L. 221-3 du même code, l’objet du
          contrat entrant dans le champ de l’activité principale du Client{' '}
          <ACompleter>
            faire vérifier ce point par un juriste : un club employant cinq salariés ou moins peut,
            dans certains cas, bénéficier du régime protecteur des consommateurs
          </ACompleter>
          .
        </P>
      </Article>

      <Article title="Article 7 — Support et niveau de service">
        <P>
          Le support est accessible à <ACompleter>adresse e-mail du support</ACompleter>, du{' '}
          <ACompleter>jours et horaires d’ouverture du support</ACompleter>.
        </P>
        <P>
          Délai de première réponse visé :{' '}
          <ACompleter>délai de première réponse — proposition : un jour ouvré</ACompleter>. Ces
          délais constituent des objectifs et non des engagements contractuels de résultat, sauf
          convention de niveau de service distincte.
        </P>
        <P>
          L’Éditeur ne garantit pas une disponibilité ininterrompue du Service. Les interruptions
          programmées sont annoncées dans la mesure du possible et planifiées en dehors des périodes
          d’usage intense.{' '}
          <ACompleter>
            indiquer, le cas échéant, un taux de disponibilité mensuel garanti et les pénalités
            associées
          </ACompleter>
        </P>
      </Article>

      <Article title="Article 8 — Obligations du Client">
        <Ul>
          <Li>
            Désigner les utilisateurs autorisés, et retirer sans délai l’accès de toute personne
            quittant le club.
          </Li>
          <Li>
            Informer les joueurs et les membres du staff des traitements de données réalisés, et
            recueillir, pour les joueurs mineurs, l’autorisation des représentants légaux.
          </Li>
          <Li>
            Veiller à ce que les données d’entraînement ne soient consultées que par les membres du
            staff habilités et pour les seules finalités sportives prévues.
          </Li>
          <Li>
            S’abstenir de tirer des données affichées une quelconque appréciation médicale, le
            Service n’étant pas un dispositif médical.
          </Li>
          <Li>Payer le prix convenu aux échéances prévues.</Li>
        </Ul>
      </Article>

      <Article title="Article 9 — Données à caractère personnel">
        <P>
          Dans le cadre de l’exécution du contrat, le Client agit en qualité de responsable de
          traitement et l’Éditeur en qualité de sous-traitant au sens de l’article 28 du RGPD. Les
          obligations réciproques sont définies dans un accord de traitement des données annexé au
          contrat d’abonnement, et décrites dans la{' '}
          <Link to="/confidentialite">politique de confidentialité</Link>.
        </P>
        <P>
          <ACompleter>
            rédiger et annexer l’accord de traitement des données (article 28 du RGPD) : il n’existe
            pas à ce jour et il est obligatoire avant toute mise en production chez un club
          </ACompleter>
        </P>
      </Article>

      <Article title="Article 10 — Réversibilité et sort des données en fin de contrat">
        <P>
          Le coach exporte à tout moment les données de son équipe depuis son profil, en JSON et en
          CSV, sans demande préalable ni intervention de l’Éditeur : profils des joueurs, séances et
          charges. Ces formats sont structurés et couramment utilisés au sens de l’article 20 du
          RGPD. La réversibilité ne dépend donc d’aucune démarche commerciale.
        </P>
        <P>
          Ce libre-service reste accessible pendant un délai de{' '}
          <ACompleter>
            délai de réversibilité retenu — proposition : 30 jours suivant la fin de l’abonnement
          </ACompleter>{' '}
          après la fin de l’abonnement. Passé ce délai, les données sont supprimées selon les durées
          de conservation indiquées dans la politique de confidentialité.
        </P>
        <P>
          L’export en libre-service est compris dans l’abonnement.{' '}
          <ACompleter>
            préciser le tarif d’une reprise assistée ou d’un format spécifique, si l’Éditeur en
            propose — l’export standard, lui, n’a pas à être facturé
          </ACompleter>
        </P>
      </Article>

      <Article title="Article 11 — Responsabilité">
        <P>
          La responsabilité de l’Éditeur au titre du contrat, toutes causes confondues, est limitée
          au montant hors taxes effectivement payé par le Client au titre de la saison au cours de
          laquelle le fait générateur est survenu. Sont exclus les dommages indirects, notamment
          perte de chance sportive, perte d’image, perte de résultats ou préjudice commercial.
        </P>
        <P>
          Ces limitations ne s’appliquent ni en cas de faute lourde ou dolosive, ni en cas de
          dommage corporel, ni dans les cas où la loi les interdit.
        </P>
      </Article>

      <Article title="Article 12 — Résiliation">
        <P>
          En cas de manquement grave de l’une des parties à ses obligations, non réparé dans un
          délai de trente jours suivant une mise en demeure écrite, l’autre partie peut résilier le
          contrat de plein droit, sans préjudice de dommages et intérêts.
        </P>
        <P>
          La résiliation à l’initiative du Client avant le terme de la saison ne donne lieu à aucun
          remboursement des sommes versées, sauf manquement imputable à l’Éditeur.
        </P>
      </Article>

      <Article title="Article 13 — Confidentialité et références">
        <P>
          Chaque partie s’engage à préserver la confidentialité des informations échangées.
          L’Éditeur ne pourra citer le Client comme référence commerciale ou utiliser son nom et son
          logo qu’avec son accord écrit préalable.
        </P>
      </Article>

      <Article title="Article 14 — Droit applicable et litiges">
        <P>
          Les présentes CGV sont soumises au droit français. À défaut de résolution amiable dans un
          délai de trente jours, tout litige sera porté devant{' '}
          <ACompleter>
            tribunal compétent retenu (clause attributive de compétence, valable entre
            professionnels) — par exemple le tribunal de commerce du ressort du siège de l’Éditeur
          </ACompleter>
          .
        </P>
      </Article>
    </LegalPage>
  );
}
