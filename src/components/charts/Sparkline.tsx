import { linePath } from './chartUtils';

/**
 * Micro-graphique de tendance. Pas d’axe ni d’infobulle : il accompagne
 * toujours une valeur chiffree lisible a cote de lui.
 */
export function Sparkline({
  values,
  width = 64,
  height = 24,
  color = 'var(--series-1)',
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden="true" />;

  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * (width - 4) + 2,
    y: height - 3 - (v / max) * (height - 6),
  }));

  return (
    <svg width={width} height={height} aria-hidden="true" style={{ overflow: 'visible' }}>
      <path d={linePath(pts)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={2.5} fill={color} />
    </svg>
  );
}
