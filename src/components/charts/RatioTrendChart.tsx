import { useState } from 'react';
import { shortDate } from '../../lib/date';
import { acwrZone } from '../../lib/metrics';
import {
  chartHeight,
  formatLoad,
  formatRatio,
  labelStep,
  linePath,
  useMeasure,
} from './chartUtils';

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

/** Echelle fixe : un ratio se lit toujours sur les memes reperes. */
const MAX = 2;
/** Graduations fines, tous les 0,1. */
const MINOR = Array.from({ length: MAX * 10 + 1 }, (_, i) => i / 10);
/** Graduations chiffrees : le pas de 0,2 plus les seuils de decision. */
const LABELLED = [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.3, 1.5, 1.8, 2.0];
/** Seuils qui delimitent la zone de developpement. */
const THRESHOLDS = [0.8, 1.3];

/**
 * Evolution du ratio hebdomadaire, semaine calendaire par semaine calendaire,
 * pose sur les zones de risque. La couleur porte l’etat, jamais l’identite de
 * la serie : la ligne reste neutre, ce sont les bandes de fond qui situent.
 *
 * L’echelle est figee de 0 a 2 : deux semaines, deux joueurs, deux ecrans se
 * comparent sans relire l’axe. Un ratio au-dela de 2 est ramene au plafond,
 * sa valeur exacte restant lisible dans l’infobulle.
 *
 * Les semaines sans reference exploitable (debut de saison) n’ont pas de
 * ratio : la ligne est interrompue plutot que ramenee a zero, qui se lirait
 * a tort comme une sous-charge.
 */
export function RatioTrendChart({ data }: { data: RatioPoint[] }) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  // Huit semaines sur 380 px de haut, ce n'est plus la meme courbe qu'un
  // aplat de 236 px : les inflexions d'une semaine a l'autre redeviennent
  // visibles. La borne basse est celle du telephone, a ne pas descendre.
  const height = chartHeight(width, 0.5, 236, 380);
  const padLeft = 32;
  const padRight = 12;
  const padTop = 12;
  const axisBand = 20;
  const plotW = Math.max(0, width - padLeft - padRight);
  const plotH = height - padTop - axisBand;

  const x = (i: number) =>
    padLeft + (data.length > 1 ? (i / (data.length - 1)) * plotW : plotW / 2);
  const y = (v: number) => padTop + plotH - (Math.min(Math.max(v, 0), MAX) / MAX) * plotH;

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
  const tickEvery = labelStep(data.length, plotW, 64);

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="Evolution du ratio hebdomadaire semaine par semaine, sur une echelle de 0 a 2 avec la zone de developpement entre 0,8 et 1,3"
          onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setActive(null)}
        >
          {BANDS.map((b) => (
            <rect
              key={b.label}
              x={padLeft}
              y={y(b.to)}
              width={plotW}
              height={Math.max(0, y(b.from) - y(b.to))}
              fill={`color-mix(in srgb, var(--status-${b.status}) 13%, transparent)`}
            />
          ))}

          <g className="chart__grid chart__grid--minor">
            {MINOR.map((v) => (
              <line key={v} x1={padLeft} x2={width - padRight} y1={y(v)} y2={y(v)} />
            ))}
          </g>
          <g className="chart__grid">
            {THRESHOLDS.map((v) => (
              <line key={v} x1={padLeft} x2={width - padRight} y1={y(v)} y2={y(v)} />
            ))}
          </g>

          <g className="chart__tick" textAnchor="end">
            {LABELLED.map((v) => (
              <text
                key={v}
                x={padLeft - 6}
                y={y(v) + 3.5}
                className={THRESHOLDS.includes(v) ? 'chart__tick--strong' : undefined}
              >
                {v.toFixed(1).replace('.', ',')}
              </text>
            ))}
          </g>

          <text
            className="chart__label"
            x={padLeft + plotW / 2}
            y={(y(0.8) + y(1.3)) / 2 + 3.5}
            textAnchor="middle"
          >
            Zone de developpement
          </text>

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
              i % tickEvery === 0 ? (
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
          style={{
            left: Math.min(Math.max(x(active!), 80), Math.max(80, width - 80)),
            top: padTop - 4,
          }}
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
              style={{
                background: `color-mix(in srgb, var(--status-${b.status}) 40%, transparent)`,
              }}
            />
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}
