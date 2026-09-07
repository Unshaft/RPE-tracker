import { SESSION_TYPES } from '../../lib/types';
import { formatLoad } from './chartUtils';

/**
 * Répartition de la charge par type de séance. Categories nominales : une
 * seule couleur pour toutes les barres, la longueur porte la magnitude.
 * Chaque barre est directement etiquetee (valeur + part).
 */
export function TypeBreakdown({ byType }: { byType: Map<string, number> }) {
  const rows = SESSION_TYPES.map((t) => ({ ...t, load: byType.get(t.value) ?? 0 })).filter(
    (r) => r.load > 0,
  );
  const total = rows.reduce((a, r) => a + r.load, 0);
  const max = Math.max(...rows.map((r) => r.load), 1);

  if (rows.length === 0) {
    return <p className="empty">Aucune séance sur la période.</p>;
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      {rows
        .sort((a, b) => b.load - a.load)
        .map((r) => (
          <div key={r.value}>
            <div className="row row--between" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 620 }}>{r.label}</span>
              <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                {formatLoad(r.load)} UA · {Math.round((r.load / total) * 100)} %
              </span>
            </div>
            <div style={{ height: 8, background: 'var(--surface-inset)', borderRadius: 4 }}>
              <div
                style={{
                  width: `${(r.load / max) * 100}%`,
                  height: '100%',
                  borderRadius: 4,
                  background: 'var(--series-1)',
                }}
              />
            </div>
          </div>
        ))}
    </div>
  );
}
