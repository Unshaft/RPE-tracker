import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { IconBack, IconChart, IconHome, IconList, IconPlus, IconUser, IconUsers } from './icons';

export function AppShell({ children }: { children: ReactNode }) {
  return <div className="app-shell">{children}</div>;
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

export function Main({ children, noNav }: { children: ReactNode; noNav?: boolean }) {
  return <main className={noNav ? 'app-main app-main--no-nav' : 'app-main'}>{children}</main>;
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
