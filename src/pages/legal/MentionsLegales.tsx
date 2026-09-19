import { Link } from 'react-router-dom';
import { ACompleter, Article, H3, LegalPage, Li, NOM_SERVICE, P, Ul } from './LegalPage';

/**
 * Mentions légales — art. 6 III de la LCEN (loi n° 2004-575 du 21 juin 2004).
 *
 * Les informations relatives à l'hébergement sont tirées du dépôt lui-même
 * (`vercel.json` pour le front, `src/lib/supabase.ts` pour la base et l'auth) :
 * ce sont des faits vérifiables, ils sont donc écrits en clair. Tout ce qui
 * relève de l'identité de l'éditeur reste marqué « à compléter ».
 */
export function MentionsLegales() {
  return (
    <LegalPage
      title="Mentions légales"
      intro={
        <>
          Les passages surlignés doivent être renseignés par l’éditeur avant toute mise en ligne
          publique. Ce document est un premier jet, à faire relire par un juriste.
        </>
      }
    >
      <Article title="Éditeur du service">
        <P>
          Le service {NOM_SERVICE} (ci-après « le Service ») est édité par :
        </P>
        <Ul>
          <Li>
            Raison sociale : <ACompleter>raison sociale de l’entreprise éditrice</ACompleter>
          </Li>
          <Li>
            Forme juridique et capital social :{' '}
            <ACompleter>forme juridique (SAS, SASU, EURL…) et montant du capital social</ACompleter>
          </Li>
          <Li>
            Siège social : <ACompleter>adresse postale complète du siège social</ACompleter>
          </Li>
          <Li>
            Immatriculation : <ACompleter>numéro SIREN / SIRET et ville du greffe (RCS)</ACompleter>
          </Li>
          <Li>
            Numéro de TVA intracommunautaire :{' '}
            <ACompleter>numéro de TVA intracommunautaire</ACompleter>
          </Li>
          <Li>
            Contact : <ACompleter>adresse e-mail de contact</ACompleter> —{' '}
            <ACompleter>numéro de téléphone (facultatif mais recommandé)</ACompleter>
          </Li>
        </Ul>
      </Article>

      <Article title="Directeur de la publication">
        <P>
          Le directeur de la publication est{' '}
          <ACompleter>nom et prénom du directeur de la publication</ACompleter>, en qualité de{' '}
          <ACompleter>fonction (président, gérant…)</ACompleter>.
        </P>
      </Article>

      <Article title="Hébergement">
        <H3>Application web</H3>
        <P>
          L’interface du Service est hébergée par <strong>Vercel Inc.</strong>, société de droit
          américain, sur son réseau de diffusion. Adresse postale et coordonnées de contact :{' '}
          <ACompleter>adresse postale de Vercel Inc., telle que publiée sur vercel.com</ACompleter>.
        </P>
        <H3>Base de données et authentification</H3>
        <P>
          Les comptes, les équipes et les séances d’entraînement sont stockés chez{' '}
          <strong>Supabase</strong> (base de données PostgreSQL et service d’authentification).
          Coordonnées de l’hébergeur :{' '}
          <ACompleter>raison sociale et adresse postale de l’entité Supabase contractante</ACompleter>.
          Région d’hébergement du projet :{' '}
          <ACompleter>
            région du projet Supabase, à relever dans le tableau de bord (Settings → General)
          </ACompleter>
          .
        </P>
        <P>
          Le détail des transferts de données et des garanties associées figure dans la{' '}
          <Link to="/confidentialite">politique de confidentialité</Link>.
        </P>
      </Article>

      <Article title="Propriété intellectuelle">
        <P>
          Le Service, sa charte graphique, ses textes, son code source et sa marque sont protégés
          par le droit de la propriété intellectuelle et demeurent la propriété exclusive de
          l’éditeur. Toute reproduction, représentation, adaptation ou exploitation, totale ou
          partielle, sans autorisation écrite préalable, est interdite.
        </P>
        <P>
          Les données saisies par les utilisateurs (séances, ressentis, commentaires) restent la
          propriété de ces derniers et du club qui les emploie ou les licencie ; l’éditeur ne s’en
          attribue aucun droit d’exploitation commerciale.
        </P>
      </Article>

      <Article title="Signalement d’un contenu ou d’un dysfonctionnement">
        <P>
          Tout signalement peut être adressé à{' '}
          <ACompleter>adresse e-mail de contact</ACompleter>. L’éditeur s’efforce d’y répondre dans
          les meilleurs délais.
        </P>
      </Article>
    </LegalPage>
  );
}
