import { useEffect, useRef, useState } from 'react';

/** Largeur réelle du conteneur : les graphiques se redimensionnent avec l’écran. */
export function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, width };
}

/**
 * Hauteur d’un graphique deduite de sa largeur reelle.
 *
 * Une hauteur fixe s’aplatit des que la carte s’elargit : 168 px de haut pour
 * 900 px de large ecrasent la courbe et la font lire comme plate, ce qui est
 * faux. On garde donc un rapport constant, borne des deux cotes — le minimum
 * protege le telephone, le maximum evite qu’un graphique occupe seul un ecran
 * de portable.
 */
export function chartHeight(width: number, ratio: number, min: number, max: number): number {
  if (width <= 0) return min;
  return Math.round(Math.min(max, Math.max(min, width * ratio)));
}

/**
 * Pas d’affichage des etiquettes d’axe : une sur n, pour qu’il reste au moins
 * `minPx` entre deux libelles. Sur telephone une semaine sur deux, sur portable
 * toutes — sans que le seuil soit ecrit en dur quelque part.
 */
export function labelStep(count: number, plotW: number, minPx: number): number {
  if (count <= 1 || plotW <= 0) return 1;
  const slot = plotW / (count - 1);
  if (slot <= 0) return 1;
  return Math.max(1, Math.ceil(minPx / slot));
}

/** Bornes d’axe "rondes" et pas de graduation lisible. */
export function niceScale(max: number, ticks = 4): { max: number; step: number } {
  if (max <= 0) return { max: 100, step: 25 };
  const rough = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const candidates = [1, 2, 2.5, 5, 10].map((m) => m * mag);
  const step = candidates.find((c) => c >= rough) ?? candidates[candidates.length - 1];
  return { max: Math.ceil(max / step) * step, step };
}

/** Rectangle a extrémité arrondie (4px), ancré a la ligne de base. */
export function roundedTopBar(x: number, y: number, w: number, h: number, r = 4): string {
  const radius = Math.max(0, Math.min(r, w / 2, h));
  if (h <= 0) return '';
  return [
    `M${x},${y + h}`,
    `L${x},${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `L${x + w - radius},${y}`,
    `Q${x + w},${y} ${x + w},${y + radius}`,
    `L${x + w},${y + h}`,
    'Z',
  ].join(' ');
}

export function linePath(points: { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
}

export function formatLoad(value: number): string {
  if (value >= 10_000) return `${Math.round(value / 1000)}k`;
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace('.0', '')}k`;
  return String(Math.round(value));
}

export function formatRatio(value: number | null, digits = 2): string {
  return value === null ? '—' : value.toFixed(digits);
}

/** Accord en nombre : `plural(1, 'séance')` -> "1 séance". */
export function plural(count: number, singular: string, plural_ = `${singular}s`): string {
  return `${count} ${count > 1 ? plural_ : singular}`;
}
