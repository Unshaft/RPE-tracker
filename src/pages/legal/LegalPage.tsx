import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Header, Main } from '../../components/Layout';
import { Card } from '../../components/ui';
import { useAuth } from '../../lib/auth';

/**
 * Socle commun aux pages légales.
 *
 * Ces pages sont publiques : elles doivent rester lisibles sans session (un
 * joueur mineur, un parent ou un club doivent pouvoir les consulter avant de
 * créer le moindre compte). D'où l'usage de `useAuth` uniquement pour ajuster
 * la marge basse quand la barre d'onglets est affichée, jamais pour filtrer.
 *
 * Aucune classe CSS nouvelle n'est introduite : on réutilise `card`, `alert`,
 * `tag` et les variables de thème, pour que le rendu suive le mode clair /
 * sombre et reste confortable sur téléphone.
 */

/** Date de dernière mise à jour, affichée en tête de chaque page. */
export const DERNIERE_MAJ = '19 septembre 2026';

/** Nom commercial du service, utilisé dans tous les textes. */
export const NOM_SERVICE = 'RPE Tracker';

const proseStyle: React.CSSProperties = {
  fontSize: 14.5,
  lineHeight: 1.7,
  color: 'var(--text-secondary)',
};

export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  const { user } = useAuth();

  return (
    <>
      <Header title={title} subtitle={`Mise à jour : ${DERNIERE_MAJ}`} back />
      <Main noNav={!user}>
        <div className="stack" style={{ gap: 12, paddingTop: 12 }}>
          {intro && (
            <div className="alert alert--info" style={{ lineHeight: 1.6 }}>
              {intro}
            </div>
          )}
          {children}
          <LegalNav />
        </div>
      </Main>
    </>
  );
}

/** Un article de texte légal : un titre, du corps de texte. */
export function Article({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card title={title}>
      <div style={proseStyle}>{children}</div>
    </Card>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p style={{ margin: '0 0 10px' }}>{children}</p>;
}

export function Ul({ children }: { children: ReactNode }) {
  return (
    <ul style={{ margin: '0 0 10px', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {children}
    </ul>
  );
}

export function Li({ children }: { children: ReactNode }) {
  return <li>{children}</li>;
}

/** Sous-titre à l'intérieur d'un article (niveau 3). */
export function H3({ children }: { children: ReactNode }) {
  return (
    <h3
      style={{
        fontSize: 13,
        fontWeight: 650,
        letterSpacing: '0.02em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        margin: '16px 0 6px',
      }}
    >
      {children}
    </h3>
  );
}

/**
 * Information d'identité que l'éditeur doit renseigner lui-même.
 *
 * Rien n'est inventé dans ces pages : chaque donnée d'identité, de contact ou
 * de facturation manquante apparaît comme un marqueur visible, impossible à
 * rater en relecture et impossible à publier par inadvertance.
 */
export function ACompleter({ children }: { children: ReactNode }) {
  return (
    <mark
      style={{
        display: 'inline',
        padding: '1px 6px',
        borderRadius: 6,
        fontWeight: 650,
        fontSize: 13,
        color: 'var(--status-critical-ink)',
        background: 'color-mix(in srgb, var(--status-critical) 14%, transparent)',
        boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--status-critical) 34%, transparent)',
      }}
    >
      [[À COMPLÉTER : {children}]]
    </mark>
  );
}

const PAGES: { to: string; label: string }[] = [
  { to: '/mentions-legales', label: 'Mentions légales' },
  { to: '/confidentialite', label: 'Confidentialité' },
  { to: '/cgu', label: 'CGU' },
  { to: '/cgv', label: 'CGV' },
  { to: '/cookies', label: 'Cookies' },
];

/** Navigation entre les pages légales, en pied de chaque page. */
export function LegalNav() {
  return (
    <nav
      aria-label="Pages légales"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        justifyContent: 'center',
        padding: '14px 0 4px',
      }}
    >
      {PAGES.map(({ to, label }) => (
        <Link key={to} to={to} className="tag" style={{ padding: '8px 12px' }}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
