import { useState } from 'react';
import { shortDate } from '../../lib/date';
import { acwrZone } from '../../lib/metrics';
import { formatLoad, formatRatio, linePath, useMeasure } from './chartUtils';

export interface RatioPoint {
  /** Lundi de la semaine. */
  start: string;
  /** Dimanche de la semaine. */
  end: string;
  load: number;
  baseline: number;
  ratio: number | null;
  partial: boolean;
}

/** Bandes de lecture, identiques a celles de la jauge. */
const BANDS = [
  { from: 0, to: 0.8, status: 'warning', label: 'Sous-charge' },
  { from: 0.8, to: 1.3, status: 'good', label: 'Optimal' },
  { from: 1.3, to: 1.5, status: 'serious', label: 'Vigilance' },
  { from: 1.5, to: 2, status: 'critical', label: 'Risque' },
] as const;

const MAX = 2;

/**
 * Evolution du ratio hebdomadaire, semaine calendaire par semaine calendaire,
 * pose sur les zones de risque. La couleur porte l’etat, jamais l’identite de
 * la serie : la ligne reste neutre, ce sont les bandes de fond qui situent.
 *
 * Les semaines sans reference exploitable (debut de saison) n’ont pas de
 * ratio : la ligne est interrompue plutot que ramenee a zero, qui se lirait
 * a tort comme une sous-charge.
 */
export function RatioTrendChart({ data }: { data: RatioPoint[] }) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const height = 178;
  const padLeft = 30;
  const padRight = 12;
  const padTop = 12;
  const axisBand = 20;
  const plotW = Math.max(0, width - padLeft - padRight);
  const plotH = height - padTop - axisBand;

  const ceiling = Math.max(MAX, ...data.map((d) => d.ratio ?? 0));
  const x = (i: number) =>
    padLeft + (data.length > 1 ? (i / (data.length - 1)) * plotW : plotW / 2);
  const y = (v: number) => padTop + plotH - (Math.min(v, ceiling) / ceiling) * plotH;

  // Segments continus : une semaine sans ratio coupe la ligne.
  const segments: { x: number; y: number }[][] = [];
  data.forEach((d, i) => {
    if (d.ratio === null) {
      segments.push([]);
      return;
    }
    if (segments.length === 0) segments.push([]);
    segments[segments.length - 1].push({ x: x(i), y: y(d.ratio) });
  });

  const pick = (clientX: number, rect: DOMRect) => {
    if (data.length < 2) return;
    const rel = clientX - rect.left - padLeft;
    const i = Math.round((rel / plotW) * (data.length - 1));
    setActive(Math.min(data.length - 1, Math.max(0, i)));
  };

  const point = active !== null ? data[active] : null;
  const pointZone = point ? acwrZone(point.ratio) : null;

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="Evolution du ratio hebdomadaire semaine par semaine, avec les zones de risque"
          onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setActive(null)}
        >
          {BANDS.map((b) => (
            <rect
              key={b.label}
              x={padLeft}
              y={y(Math.min(b.to, ceiling))}
              width={plotW}
              height={Math.max(0, y(b.from) - y(Math.min(b.to, ceiling)))}
              fill={`color-mix(in srgb, var(--status-${b.status}) 13%, transparent)`}
            />
          ))}

          <g className="chart__tick" textAnchor="end">
            {[0.8, 1.3, 1.5].map((v) => (
              <text key={v} x={padLeft - 6} y={y(v) + 3.5}>
                {v.toFixed(1).replace('.', ',')}
              </text>
            ))}
          </g>
          <g className="chart__grid">
            {[0.8, 1.3, 1.5].map((v) => (
              <line key={v} x1={padLeft} x2={width - padRight} y1={y(v)} y2={y(v)} />
            ))}
          </g>

          {active !== null && (
            <line
              x1={x(active)}
              x2={x(active)}
              y1={padTop}
              y2={padTop + plotH}
              stroke="var(--baseline)"
              strokeWidth={1}
            />
          )}

          {segments
            .filter((seg) => seg.length > 1)
            .map((seg, i) => (
              <path
                key={i}
                d={linePath(seg)}
                fill="none"
                stroke="var(--text-primary)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}

          {data.map((d, i) =>
            d.ratio === null ? null : (
              <circle
                key={d.start}
                cx={x(i)}
                cy={y(d.ratio)}
                r={active === i ? 5 : 3.5}
                fill="var(--surface-1)"
                stroke="var(--text-primary)"
                strokeWidth={2}
              />
            ),
          )}

          <g className="chart__axis">
            <line x1={padLeft} x2={width - padRight} y1={padTop + plotH} y2={padTop + plotH} />
          </g>

          <g className="chart__tick" textAnchor="middle">
            {data.map((d, i) =>
              i % 2 === 0 ? (
                <text key={d.start} x={x(i)} y={height - 6}>
                  {shortDate(d.start)}
                </text>
              ) : null,
            )}
          </g>
        </svg>
      )}

      {point && (
        <div
          className="tooltip"
          style={{ left: Math.min(Math.max(x(active!), 80), Math.max(80, width - 80)), top: padTop - 4 }}
        >
          <div className="tooltip__muted">
            {shortDate(point.start)} - {shortDate(point.end)}
            {point.partial ? ' (en cours)' : ''}
          </div>
          <div className="tooltip__row">
            Ratio {formatRatio(point.ratio)}
            {pointZone ? ` · ${pointZone.short}` : ''}
          </div>
          <div className="tooltip__row">
            {formatLoad(point.load)} UA · reference {formatLoad(point.baseline)} UA
          </div>
        </div>
      )}

      <div className="chart-legend">
        {BANDS.map((b) => (
          <span className="chart-legend__item" key={b.label}>
            <span
              className="chart-legend__swatch"
              style={{ background: `color-mix(in srgb, var(--status-${b.status}) 40%, transparent)` }}
            />
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}
