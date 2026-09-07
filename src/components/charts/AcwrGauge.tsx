import { acwrZone } from '../../lib/metrics';

const ZONES = [
  { from: 0, to: 0.8, status: 'warning', label: 'Sous-charge' },
  { from: 0.8, to: 1.3, status: 'good', label: 'Optimal' },
  { from: 1.3, to: 1.5, status: 'serious', label: 'Vigilance' },
  { from: 1.5, to: 2, status: 'critical', label: 'Risque' },
] as const;

const MAX = 2;

/**
 * Position du ratio aigu/chronique sur les zones de référence. La couleur
 * porte l’état (statut), jamais l’identité d’une série ; elle est toujours
 * doublee du libelle de zone et de la valeur chiffree.
 */
export function AcwrGauge({ ratio }: { ratio: number | null }) {
  const info = acwrZone(ratio);
  const pct = ratio === null ? 0 : Math.min(ratio, MAX) / MAX;

  return (
    <div>
      <div
        style={{ position: 'relative', paddingTop: 4 }}
        role="img"
        aria-label={
          ratio === null
            ? 'Ratio aigu sur chronique indisponible'
            : `Ratio aigu sur chronique ${ratio.toFixed(2)} — ${info?.label}`
        }
      >
        <div style={{ display: 'flex', gap: 2, height: 8 }}>
          {ZONES.map((z) => (
            <div
              key={z.label}
              title={z.label}
              style={{
                flexGrow: z.to - z.from,
                borderRadius: 3,
                background: `color-mix(in srgb, var(--status-${z.status}) ${
                  info?.status === z.status ? 100 : 26
                }%, transparent)`,
              }}
            />
          ))}
        </div>
        {ratio !== null && (
          <div
            style={{
              position: 'absolute',
              left: `${pct * 100}%`,
              top: 0,
              transform: 'translateX(-50%)',
              width: 3,
              height: 16,
              borderRadius: 2,
              background: 'var(--text-primary)',
              border: '2px solid var(--surface-1)',
              boxSizing: 'content-box',
              marginLeft: -2,
            }}
          />
        )}
      </div>
      {/* Les bornes sont posées à leur position réelle sur l’échelle, pas réparties. */}
      <div style={{ position: 'relative', height: 14, marginTop: 4 }} aria-hidden="true">
        {[0.8, 1.3, 1.5].map((v) => (
          <span
            key={v}
            style={{
              position: 'absolute',
              left: `${(v / MAX) * 100}%`,
              transform: 'translateX(-50%)',
              fontSize: 10.5,
              fontWeight: 600,
              color: 'var(--text-muted)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {v.toFixed(1).replace('.', ',')}
          </span>
        ))}
      </div>
    </div>
  );
}
