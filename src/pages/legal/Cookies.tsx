import { Link } from 'react-router-dom';
import { ACompleter, Article, H3, LegalPage, Li, NOM_SERVICE, P, Ul } from './LegalPage';

/**
 * Politique de cookies et de stockage local.
 *
 * Contenu établi par lecture du code, pas à partir d'un modèle :
 *  - `src/lib/theme.ts` écrit la clé `rpe.theme` dans localStorage ;
 *  - `src/lib/supabase.ts` crée le client avec `persistSession: true`, ce qui
 *    fait écrire le jeton de session par supabase-js dans localStorage, sous
 *    une clé de la forme `sb-<référence du projet>-auth-token` ;
 *  - `detectSessionInUrl: false` : aucun jeton n'est récupéré depuis l'URL ;
 *  - une recherche sur `document.cookie` dans `src/` et `index.html` ne
 *    remonte rien : l'application ne dépose aucun cookie de son fait ;
 *  - aucune dépendance d'analytique ou de publicité dans `package.json`.
 *
 * Si l'une de ces trois choses change (ajout d'une mesure d'audience, passage
 * à un stockage par cookie, ajout d'un lecteur vidéo embarqué), cette page doit
 * être mise à jour.
 */
export function Cookies() {
  return (
    <LegalPage
      title="Cookies et stockage local"
      intro={
        <>
          Cette page décrit ce que {NOM_SERVICE} conserve réellement dans ton navigateur, relevé
          dans le code de l’application. À revérifier à chaque ajout d’outil tiers.
        </>
      }
    >
      <Article title="Ce que l’application ne fait pas">
        <Ul>
          <Li>Aucun cookie publicitaire ni de reciblage.</Li>
          <Li>
            Aucun outil de mesure d’audience tiers (pas de Google Analytics, pas de Matomo, pas de
            pixel de réseau social).
          </Li>
          <Li>Aucun traceur de session tiers, aucun enregistrement de navigation.</Li>
          <Li>Aucun contenu tiers embarqué déposant des cookies (vidéo, carte, police distante).</Li>
        </Ul>
        <P>
          Pour cette raison, aucune bannière de consentement aux cookies n’est affichée : les
          éléments décrits ci-dessous sont strictement nécessaires au fonctionnement du service
          demandé, et sont dispensés de consentement au titre de l’article 82 de la loi
          Informatique et Libertés.
        </P>
      </Article>

      <Article title="Ce qui est réellement stocké sur ton appareil">
        <P>
          {NOM_SERVICE} ne dépose pas de cookie. Il utilise le <strong>stockage local</strong> du
          navigateur (<em>localStorage</em>), qui reste sur ton appareil et n’est pas transmis
          automatiquement à chaque requête, contrairement à un cookie.
        </P>

        <H3>1. Jeton de session</H3>
        <Ul>
          <Li>
            <strong>Clé</strong> : <code>sb-&lt;référence du projet&gt;-auth-token</code>, créée par
            la bibliothèque d’authentification Supabase.
          </Li>
          <Li>
            <strong>Contenu</strong> : les jetons d’accès et de rafraîchissement de ta session, ainsi
            que les informations de compte qui y sont attachées.
          </Li>
          <Li>
            <strong>Finalité</strong> : te garder connecté d’une visite à l’autre, et rafraîchir
            automatiquement ta session sans redemander ton mot de passe.
          </Li>
          <Li>
            <strong>Durée</strong> : conservé jusqu’à la déconnexion, jusqu’à l’expiration du jeton
            de rafraîchissement, ou jusqu’à l’effacement des données du site depuis le navigateur.
          </Li>
          <Li>
            <strong>Nature</strong> : strictement nécessaire. Sans lui, il faudrait se reconnecter à
            chaque chargement de page.
          </Li>
        </Ul>

        <H3>2. Préférence de thème</H3>
        <Ul>
          <Li>
            <strong>Clé</strong> : <code>rpe.theme</code>.
          </Li>
          <Li>
            <strong>Contenu</strong> : la valeur <code>light</code> ou <code>dark</code>.
          </Li>
          <Li>
            <strong>Finalité</strong> : retenir le thème clair ou sombre que tu as choisi dans
            l’écran « Profil ».
          </Li>
          <Li>
            <strong>Durée</strong> : conservée jusqu’à ce que tu reviennes au réglage « Système »,
            auquel cas la clé est effacée, ou jusqu’à l’effacement des données du site.
          </Li>
          <Li>
            <strong>Nature</strong> : préférence d’affichage, sans identifiant ni suivi.
          </Li>
        </Ul>
        <P>
          Ces deux éléments sont cloisonnés par navigateur et par appareil : ils ne permettent pas
          de te suivre d’un site à l’autre, ni de recouper ton activité en dehors de
          l’application.
        </P>
      </Article>

      <Article title="Journaux serveur">
        <P>
          Indépendamment de ton navigateur, les prestataires d’hébergement (Vercel pour
          l’application, Supabase pour la base de données et l’authentification) enregistrent des
          journaux techniques contenant notamment l’adresse IP, l’horodatage et le type de requête,
          à des fins de sécurité et de diagnostic. Ces journaux ne relèvent pas de la
          réglementation sur les traceurs mais du RGPD : voir la{' '}
          <Link to="/confidentialite">politique de confidentialité</Link>.
        </P>
      </Article>

      <Article title="Comment supprimer ces données">
        <P>
          Se déconnecter depuis l’écran « Profil » efface le jeton de session. Pour tout supprimer,
          efface les données du site depuis les réglages de ton navigateur (rubrique
          « Confidentialité », « Données de sites » ou « Cookies et données de sites »). Tu seras
          alors déconnecté et le thème reviendra au réglage système.
        </P>
        <P>
          Le blocage du stockage local par le navigateur empêche la connexion de fonctionner
          normalement.
        </P>
      </Article>

      <Article title="Évolutions">
        <P>
          Si un outil de mesure d’audience, un service de paiement ou un contenu tiers venait à être
          intégré, cette page serait mise à jour et, si la réglementation l’exige, un mécanisme de
          recueil du consentement serait mis en place avant tout dépôt.{' '}
          <ACompleter>
            à réexaminer lors de l’ajout d’un prestataire de paiement pour les abonnements des clubs
          </ACompleter>
        </P>
      </Article>
    </LegalPage>
  );
}
