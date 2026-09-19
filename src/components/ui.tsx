import type { ReactNode } from 'react';
import { formatLoad } from './charts/chartUtils';

export function Avatar({
  user,
  large,
}: {
  user: { firstName: string; lastName: string };
  large?: boolean;
}) {
  const initials = `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase();
  return <span className={large ? 'avatar avatar--lg' : 'avatar'}>{initials}</span>;
}

export type StatusRole = 'good' | 'warning' | 'serious' | 'critical' | 'neutral';

/** Statut : couleur + icone + libelle, jamais la couleur seule. */
export function StatusBadge({
  status,
  icon,
  children,
}: {
  status: StatusRole;
  icon?: string;
  children: ReactNode;
}) {
  return (
    <span className={`badge badge--${status}`}>
      {icon && (
        <span className="badge__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}

export function Tile({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="tile">
      <span className="tile__label">{label}</span>
      <span className="tile__value">{value}</span>
      {hint && <span className="tile__hint">{hint}</span>}
      {children}
    </div>
  );
}

export function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="delta delta--flat">Pas de référence</span>;
  const pct = Math.round(value * 100);
  if (Math.abs(pct) < 3)
    return <span className="delta delta--flat">= stable vs semaine passée</span>;
  const up = pct > 0;
  return (
    <span className="delta delta--flat">
      {up ? '▲' : '▼'} {Math.abs(pct)} % vs semaine passée
    </span>
  );
}

export function Card({
  title,
  hint,
  action,
  children,
  flush,
}: {
  title?: string;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <div className={flush ? 'card card--flush' : 'card'}>
      {(title || action) && (
        <div className="card__head" style={flush ? { padding: '14px 14px 0' } : undefined}>
          <div>
            {title && <div className="card__title">{title}</div>}
            {hint && <div className="card__hint">{hint}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Section({
  title,
  action,
  children,
  full,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  /**
   * Dans une grille `.dash-grid` (bureau coach), la section prend toute la
   * largeur au lieu d'une colonne. Réservé à ce qui perd son sens à moitié
   * moins large : une courbe sur 8 semaines, une frise de 14 jours.
   */
  full?: boolean;
}) {
  return (
    <section className={full ? 'section dash-grid__full' : 'section'}>
      <div className="section__head">
        <h2 className="section__title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__title">{title}</div>
      {children}
    </div>
  );
}

/**
 * Attente d'un chargement distant.
 *
 * Annoncé en `role="status"` : sans cela, un lecteur d'écran ne signale rien
 * entre la navigation et l'arrivée des données.
 */
export function Loading({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="empty" role="status" aria-live="polite">
      <div className="empty__title">{label}</div>
    </div>
  );
}

/** Vue tableau : equivalent accessible de chaque graphique (valeurs exactes). */
export function TableView({
  summary = 'Voir les valeurs',
  columns,
  rows,
}: {
  summary?: string;
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <details className="disclosure">
      <summary>{summary}</summary>
      <table className="table-view">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j}>{typeof cell === 'number' ? formatLoad(cell) : cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** Palier d’intensité (1-5) associé à un RPE, pour la rampe ordinale. */
export function rpeBand(rpe: number): number {
  return Math.min(5, Math.max(1, Math.ceil(rpe / 2)));
}

export function rpeVars(rpe: number): React.CSSProperties {
  const band = rpeBand(rpe);
  return {
    ['--rpe-color' as string]: `var(--rpe-${band})`,
    ['--rpe-ink' as string]: `var(--rpe-ink-${band})`,
  };
}
