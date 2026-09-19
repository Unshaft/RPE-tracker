import { useState } from 'react';
import { shortDate } from '../../lib/date';
import { chartHeight, formatLoad, labelStep, linePath, niceScale, useMeasure } from './chartUtils';

export interface WeeklyPoint {
  /** Debut de la fenêtre glissante de 7 jours. */
  start: string;
  /** Fin de la fenêtre (incluse). */
  end: string;
  load: number;
  chronic: number;
}

const SERIES = [
  { key: 'load' as const, label: 'Charge 7 jours', color: 'var(--series-1)' },
  { key: 'chronic' as const, label: 'Charge chronique', color: 'var(--series-2)' },
];

/**
 * Charge hebdomadaire vs charge chronique. Deux series, même unite (UA) donc
 * un seul axe : jamais de double échelle. Légende + étiquette directe sur le
 * dernier point de chaque serie.
 */
export function WeeklyLoadChart({ data }: { data: WeeklyPoint[] }) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  // Deux series superposees ont besoin de hauteur pour se separer : a largeur
  // de portable, 168 px les collent l'une a l'autre.
  const height = chartHeight(width, 0.38, 168, 300);
  const padLeft = 30;
  const padRight = 34; // place pour les étiquettes directes
  const padTop = 12;
  const axisBand = 20;
  const plotW = Math.max(0, width - padLeft - padRight);
  const plotH = height - padTop - axisBand;

  const maxValue = Math.max(...data.flatMap((d) => [d.load, d.chronic]), 0);
  const { max, step } = niceScale(maxValue || 100);
  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-6; v += step) ticks.push(v);

  const x = (i: number) =>
    padLeft + (data.length > 1 ? (i / (data.length - 1)) * plotW : plotW / 2);
  const y = (v: number) => padTop + plotH - (v / max) * plotH;

  const pick = (clientX: number, rect: DOMRect) => {
    if (data.length < 2) return;
    const rel = clientX - rect.left - padLeft;
    const i = Math.round((rel / plotW) * (data.length - 1));
    setActive(Math.min(data.length - 1, Math.max(0, i)));
  };

  const point = active !== null ? data[active] : null;
  const tickEvery = labelStep(data.length, plotW, 64);

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="Charge hebdomadaire et charge chronique par semaine, en unités arbitraires"
          onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setActive(null)}
        >
          <g className="chart__grid">
            {ticks.map((t) => (
              <line key={t} x1={padLeft} x2={width - padRight} y1={y(t)} y2={y(t)} />
            ))}
          </g>
          <g className="chart__tick" textAnchor="end">
            {ticks.map((t) => (
              <text key={t} x={padLeft - 6} y={y(t) + 3.5}>
                {formatLoad(t)}
              </text>
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

          {SERIES.map((s) => (
            <path
              key={s.key}
              d={linePath(data.map((d, i) => ({ x: x(i), y: y(d[s.key]) })))}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {SERIES.map((s, si) => {
            const last = data.length - 1;
            const yLoad = y(data[last].load);
            const yChronic = y(data[last].chronic);
            // Les deux etiquettes de fin sont ecartees quand les series se rejoignent.
            const collide = Math.abs(yLoad - yChronic) < 12;
            const shift = collide
              ? si === 0
                ? yLoad <= yChronic
                  ? -6
                  : 6
                : yLoad <= yChronic
                  ? 6
                  : -6
              : 0;
            return (
              <g key={`${s.key}-endpoint`}>
                <circle
                  cx={x(last)}
                  cy={y(data[last][s.key])}
                  r={4}
                  fill={s.color}
                  stroke="var(--surface-1)"
                  strokeWidth={2}
                />
                <text
                  className="chart__label"
                  x={x(last) + 8}
                  y={y(data[last][s.key]) + 3.5 + shift}
                  fill={s.color}
                >
                  {formatLoad(data[last][s.key])}
                </text>
              </g>
            );
          })}

          {active !== null &&
            SERIES.map((s) => (
              <circle
                key={`${s.key}-active`}
                cx={x(active)}
                cy={y(data[active][s.key])}
                r={5}
                fill={s.color}
                stroke="var(--surface-1)"
                strokeWidth={2}
              />
            ))}

          <g className="chart__axis">
            <line x1={padLeft} x2={width - padRight} y1={padTop + plotH} y2={padTop + plotH} />
          </g>

          <g className="chart__tick" textAnchor="middle">
            {data.map((d, i) =>
              i % tickEvery === 0 ? (
                <text key={d.end} x={x(i)} y={height - 6}>
                  {shortDate(d.end)}
                </text>
              ) : null,
            )}
          </g>
        </svg>
      )}

      {point && (
        <div
          className="tooltip"
          style={{ left: Math.min(Math.max(x(active!), 70), width - 70), top: padTop - 4 }}
        >
          <div className="tooltip__muted">7 jours au {shortDate(point.end)}</div>
          {SERIES.map((s) => (
            <div className="tooltip__row" key={s.key}>
              <span className="tooltip__dot" style={{ background: s.color }} />
              {s.label} {formatLoad(point[s.key])} UA
            </div>
          ))}
        </div>
      )}

      <div className="chart-legend">
        {SERIES.map((s) => (
          <span className="chart-legend__item" key={s.key}>
            <span
              className="chart-legend__swatch chart-legend__swatch--line"
              style={{ background: s.color }}
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
