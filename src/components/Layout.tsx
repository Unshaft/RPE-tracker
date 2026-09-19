import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import {
  IconBack,
  IconChart,
  IconHome,
  IconList,
  IconPlus,
  IconSliders,
  IconUser,
  IconUsers,
} from './icons';
import { LoadModelsProvider } from './loadContext';

/**
 * Enveloppe de l'application.
 *
 * `data-layout` porte le rôle sur le shell : c'est lui, et non la seule largeur
 * de fenêtre, qui décide de la mise en page. Le joueur saisit une séance au
 * vestiaire, sur un téléphone : sa colonne reste étroite même ouverte sur un
 * écran de 1440 px, parce qu'une ligne de saisie de 1400 px se lit et se vise
 * moins bien, pas parce que la place manquerait. Le coach travaille sur un
 * portable : à partir de 900 px, il obtient un rail latéral et un contenu qui
 * occupe la largeur. Les deux sont décrits dans `global.css`.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const layout = !user ? 'public' : user.role === 'coach' ? 'coach' : 'player';
  return (
    <div className="app-shell" data-layout={layout}>
      {/* Rendu avant le contenu pour que la tabulation suive l'ordre visuel du
          bureau. En dessous de 900 px il est en `display: none`, donc hors de
          l'ordre de tabulation comme de l'arbre d'accessibilité : jamais deux
          navigations principales annoncées en même temps. */}
      {user?.role === 'coach' && <SideNav />}
      {/* Le modèle de charge de l'équipe conditionne tous les chiffres affichés :
          il est chargé ici, une fois, plutôt que par chaque écran. */}
      <LoadModelsProvider>{children}</LoadModelsProvider>
      {/* Hors session, la barre d'onglets est masquée : la place est libre pour
          un pied de page légal. Une fois connecté, la barre d'onglets occupe le
          bas de l'écran et le pied de page n'est pas affiché pour ne pas passer
          dessous — les pages légales restent atteignables par leurs liens, et
          par le pied du rail côté coach. */}
      {!user && <LegalFooter />}
    </div>
  );
}

const LEGAL_LINKS: { to: string; label: string }[] = [
  { to: '/mentions-legales', label: 'Mentions légales' },
  { to: '/confidentialite', label: 'Confidentialité' },
  { to: '/cgu', label: 'CGU' },
  { to: '/cgv', label: 'CGV' },
  { to: '/cookies', label: 'Cookies' },
];

/** Pied de page légal, affiché sur les écrans accessibles sans compte. */
export function LegalFooter() {
  return (
    <footer
      aria-label="Informations légales"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '4px 10px',
        padding: '10px 16px calc(10px + var(--safe-bottom))',
        borderTop: '1px solid var(--border)',
        background: 'var(--surface-1)',
        fontSize: 12,
      }}
    >
      {LEGAL_LINKS.map(({ to, label }) => (
        <Link key={to} to={to} style={{ color: 'var(--text-muted)', padding: '2px 0' }}>
          {label}
        </Link>
      ))}
    </footer>
  );
}

export function Header({
  title,
  subtitle,
  back,
  right,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <header className="app-header">
      {back && (
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Retour">
          <IconBack />
        </button>
      )}
      <div style={{ minWidth: 0 }}>
        <div className="app-header__title">{title}</div>
        {subtitle && <div className="app-header__sub">{subtitle}</div>}
      </div>
      <div className="app-header__spacer" />
      {right}
    </header>
  );
}

export function Main({
  children,
  noNav,
  narrow,
}: {
  children: ReactNode;
  noNav?: boolean;
  /** Écran de texte ou de formulaire : la colonne reste lisible sur bureau. */
  narrow?: boolean;
}) {
  const classes = ['app-main'];
  if (noNav) classes.push('app-main--no-nav');
  if (narrow) classes.push('app-main--narrow');
  return <main className={classes.join(' ')}>{children}</main>;
}

const PLAYER_TABS = [
  { to: '/', label: 'Tableau', Icon: IconHome, end: true },
  { to: '/saisie', label: 'Saisir', Icon: IconPlus, end: false },
  { to: '/historique', label: 'Historique', Icon: IconList, end: false },
  { to: '/profil', label: 'Profil', Icon: IconUser, end: false },
];

const COACH_TABS = [
  { to: '/coach', label: 'Équipe', Icon: IconChart, end: true },
  { to: '/coach/effectif', label: 'Effectif', Icon: IconUsers, end: false },
  { to: '/coach/modeles', label: 'Modèles', Icon: IconSliders, end: false },
  { to: '/profil', label: 'Profil', Icon: IconUser, end: false },
];

export function BottomNav() {
  const { user } = useAuth();
  if (!user) return null;
  const tabs = user.role === 'coach' ? COACH_TABS : PLAYER_TABS;

  return (
    <nav className="bottom-nav" aria-label="Navigation principale">
      {tabs.map(({ to, label, Icon, end }) => (
        <NavLink key={to} to={to} end={end} className="bottom-nav__item">
          <Icon />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

/**
 * Navigation du coach sur grand écran.
 *
 * La barre basse est faite pour le pouce : sur un portable, elle est au plus
 * loin du curseur et coûte une bande de fenêtre à chaque écran. Le rail reste
 * visible pendant le défilement, nomme l'équipe en cours et laisse la place
 * d'écrire les libellés en entier.
 *
 * `display: none` en dessous de 900 px (voir `global.css`) : le composant n'est
 * alors ni tabulable ni annoncé, et la barre basse reste seule en charge.
 */
export function SideNav() {
  const { team } = useAuth();

  return (
    <nav className="side-nav" aria-label="Navigation principale">
      <div className="side-nav__brand">
        <div className="side-nav__product">RPE Tracker</div>
        <div className="side-nav__team">{team?.name ?? 'Sans équipe'}</div>
      </div>
      {COACH_TABS.map(({ to, label, Icon, end }) => (
        <NavLink key={to} to={to} end={end} className="side-nav__item">
          <Icon />
          {label}
        </NavLink>
      ))}
      {/* Le pied de page légal n'apparaît que hors session : le rail rend ces
          pages à nouveau atteignables en un clic pour un coach connecté. */}
      <div className="side-nav__legal">
        {LEGAL_LINKS.map(({ to, label }) => (
          <Link key={to} to={to}>
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
