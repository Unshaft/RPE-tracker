import { useState } from 'react';
import { formatLoad, niceScale, roundedTopBar, useMeasure } from './chartUtils';

export interface BarPoint {
  /** Cle unique (date, semaine...). */
  key: string;
  /** Étiquette d’axe courte. */
  tick: string;
  /** Libelle complet, affiche dans l’infobulle. */
  label: string;
  value: number;
}

/**
 * Histogramme à une seule serie : une seule couleur (slot 1), pas de légende,
 * le titre de la carte nomme la serie. Survol -> infobulle ; les valeurs
 * exactes restent lisibles dans la vue tableau associée.
 */
export function BarSeriesChart({
  data,
  ariaLabel,
  unit = 'UA',
  height = 150,
}: {
  data: BarPoint[];
  ariaLabel: string;
  unit?: string;
  height?: number;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const padLeft = 30;
  const padRight = 6;
  const padTop = 10;
  const axisBand = 20;
  const plotW = Math.max(0, width - padLeft - padRight);
  const plotH = height - padTop - axisBand;

  const { max, step } = niceScale(Math.max(...data.map((d) => d.value), 0) || 100);
  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-6; v += step) ticks.push(v);

  const slot = data.length ? plotW / data.length : 0;
  const barW = Math.max(3, slot - 4); // 2px de respiration de chaque cote
  const y = (v: number) => padTop + plotH - (v / max) * plotH;
  // Un tick sur deux des que les colonnes deviennent étroites.
  const tickEvery = slot > 26 ? 1 : slot > 14 ? 2 : 3;

  const point = active !== null ? data[active] : null;

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          onPointerMove={(e) => {
            const rel = e.clientX - e.currentTarget.getBoundingClientRect().left - padLeft;
            const i = Math.floor(rel / slot);
            setActive(i >= 0 && i < data.length ? i : null);
          }}
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

          {data.map((d, i) => {
            const h = d.value > 0 ? Math.max(2, (d.value / max) * plotH) : 0;
            const x = padLeft + i * slot + (slot - barW) / 2;
            return (
              <path
                key={d.key}
                d={roundedTopBar(x, padTop + plotH - h, barW, h)}
                fill="var(--series-1)"
                opacity={active === null || active === i ? 1 : 0.45}
              />
            );
          })}

          <g className="chart__axis">
            <line x1={padLeft} x2={width - padRight} y1={padTop + plotH} y2={padTop + plotH} />
          </g>

          <g className="chart__tick" textAnchor="middle">
            {data.map((d, i) =>
              i % tickEvery === 0 ? (
                <text key={d.key} x={padLeft + i * slot + slot / 2} y={height - 6}>
                  {d.tick}
                </text>
              ) : null,
            )}
          </g>
        </svg>
      )}

      {point && slot > 0 && (
        <div
          className="tooltip"
          style={{
            left: Math.min(Math.max(padLeft + active! * slot + slot / 2, 56), Math.max(width - 56, 56)),
            top: y(point.value) - 8,
          }}
        >
          <div className="tooltip__row">
            <span className="tooltip__dot" style={{ background: 'var(--series-1)' }} />
            {formatLoad(point.value)} {unit}
          </div>
          <div className="tooltip__muted">{point.label}</div>
        </div>
      )}
    </div>
  );
}
