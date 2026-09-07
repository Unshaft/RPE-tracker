import { addDays, lastNDays, toDayKey } from './date';
import type { TrainingSession } from './types';

/**
 * Métriques de charge d’entrainement (methode session-RPE, Foster 1998/2001).
 *
 *  - charge d’une séance   = RPE (CR-10) x durée en minutes           [UA]
 *  - charge aiguë          = somme des charges sur 7 jours glissants  [UA]
 *  - charge chronique      = moyenne hebdomadaire sur 28 jours        [UA]
 *  - ACWR                  = charge aiguë / charge chronique          [ratio]
 *  - monotonie             = moyenne / écart-type des charges quotidiennes (7 j, jours de repos inclus)
 *  - contrainte (strain)   = charge hebdomadaire x monotonie          [UA]
 */

export const ACUTE_WINDOW = 7;
export const CHRONIC_WINDOW = 28;

export function sessionLoad(s: Pick<TrainingSession, 'rpe' | 'durationMin'>): number {
  return s.rpe * s.durationMin;
}

/** Charge totale par jour, indexée par cle YYYY-MM-DD. */
export function dailyLoadMap(sessions: TrainingSession[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of sessions) {
    map.set(s.date, (map.get(s.date) ?? 0) + sessionLoad(s));
  }
  return map;
}

/** Serie de charges quotidiennes (0 pour les jours sans séance) sur les n derniers jours. */
export function dailySeries(
  sessions: TrainingSession[],
  end: string,
  days: number,
): { date: string; load: number }[] {
  const map = dailyLoadMap(sessions);
  return lastNDays(end, days).map((date) => ({ date, load: map.get(date) ?? 0 }));
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function mean(values: number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

/** Écart-type de population (denominateur n), convention retenue par Foster. */
export function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

/** Charge cumulee sur les `days` derniers jours (fenêtre se terminant a `end`). */
export function loadOverWindow(
  sessions: TrainingSession[],
  end: string,
  days: number,
): number {
  return sum(dailySeries(sessions, end, days).map((d) => d.load));
}

export function acuteLoad(sessions: TrainingSession[], end: string): number {
  return loadOverWindow(sessions, end, ACUTE_WINDOW);
}

/** Charge chronique : charge des 28 derniers jours ramenee a une semaine. */
export function chronicLoad(sessions: TrainingSession[], end: string): number {
  return loadOverWindow(sessions, end, CHRONIC_WINDOW) / (CHRONIC_WINDOW / ACUTE_WINDOW);
}

/** Ratio charge aiguë / chronique. `null` tant que la charge chronique est nulle. */
export function acwr(sessions: TrainingSession[], end: string): number | null {
  const chronic = chronicLoad(sessions, end);
  if (chronic <= 0) return null;
  return acuteLoad(sessions, end) / chronic;
}

/** Monotonie sur 7 jours. `null` si l’écart-type est nul (aucune ou charge constante). */
export function monotony(sessions: TrainingSession[], end: string): number | null {
  const loads = dailySeries(sessions, end, ACUTE_WINDOW).map((d) => d.load);
  const sd = stdDev(loads);
  if (sd === 0) return null;
  return mean(loads) / sd;
}

/** Contrainte = charge hebdomadaire x monotonie. */
export function strain(sessions: TrainingSession[], end: string): number | null {
  const m = monotony(sessions, end);
  if (m === null) return null;
  return acuteLoad(sessions, end) * m;
}

export type AcwrZone = 'undertraining' | 'optimal' | 'caution' | 'danger';

export interface ZoneInfo {
  zone: AcwrZone;
  label: string;
  /** Variante compacte, pour les lignes de liste étroites. */
  short: string;
  /** Roles du système de statut : good / warning / serious / critical. */
  status: 'good' | 'warning' | 'serious' | 'critical';
  icon: string;
  advice: string;
}

/**
 * Zones ACWR usuelles (Gabbett) : < 0.80 sous-charge, 0.80-1.30 optimal,
 * 1.30-1.50 vigilance, > 1.50 risque élevé.
 */
export function acwrZone(ratio: number | null): ZoneInfo | null {
  if (ratio === null) return null;
  if (ratio < 0.8) {
    return {
      zone: 'undertraining',
      label: 'Sous-charge',
      short: 'Faible',
      status: 'warning',
      icon: '↓',
      advice: "Charge en baisse marquee : désentraînement possible si cela dure.",
    };
  }
  if (ratio <= 1.3) {
    return {
      zone: 'optimal',
      label: 'Zone optimale',
      short: 'Optimal',
      status: 'good',
      icon: '✓',
      advice: 'Progression de charge maîtrisée, continue ainsi.',
    };
  }
  if (ratio <= 1.5) {
    return {
      zone: 'caution',
      label: 'Vigilance',
      short: 'Vigilance',
      status: 'serious',
      icon: '⚠',
      advice: 'Montee de charge rapide : surveille la recuperation.',
    };
  }
  return {
    zone: 'danger',
    label: 'Risque élevé',
    short: 'Risque',
    status: 'critical',
    icon: '⚠',
    advice: 'Pic de charge : allège les prochaines séances.',
  };
}

export function monotonyStatus(m: number | null): 'good' | 'warning' | 'critical' | null {
  if (m === null) return null;
  if (m < 1.5) return 'good';
  if (m < 2) return 'warning';
  return 'critical';
}

export interface PlayerMetrics {
  acute: number;
  chronic: number;
  acwr: number | null;
  monotony: number | null;
  strain: number | null;
  sessionCount7d: number;
  minutes7d: number;
  avgRpe7d: number | null;
  /** Charge des 7 jours precedents (J-13 a J-7), pour la variation. */
  previousAcute: number;
  /** Variation relative de la charge aiguë, `null` si semaine précédente vide. */
  acuteDelta: number | null;
}

export function computePlayerMetrics(
  sessions: TrainingSession[],
  end: string,
): PlayerMetrics {
  const window7 = sessions.filter(
    (s) => s.date <= end && s.date > addDays(end, -ACUTE_WINDOW),
  );
  const acute = acuteLoad(sessions, end);
  const previousAcute = acuteLoad(sessions, addDays(end, -ACUTE_WINDOW));
  const minutes7d = window7.reduce((a, s) => a + s.durationMin, 0);
  return {
    acute,
    chronic: chronicLoad(sessions, end),
    acwr: acwr(sessions, end),
    monotony: monotony(sessions, end),
    strain: strain(sessions, end),
    sessionCount7d: window7.length,
    minutes7d,
    avgRpe7d: window7.length
      ? window7.reduce((a, s) => a + s.rpe, 0) / window7.length
      : null,
    previousAcute,
    acuteDelta: previousAcute > 0 ? (acute - previousAcute) / previousAcute : null,
  };
}

/**
 * Serie de fenêtres glissantes de 7 jours, de la plus ancienne a la plus
 * récente, la dernière se terminant a `end`.
 *
 * Volontairement glissantes et non calendaires : une semaine calendaire en
 * cours est incomplète et produirait un faux décrochage en fin de courbe.
 */
export function weeklySeries(
  sessions: TrainingSession[],
  end: string,
  weeks: number,
): { start: string; end: string; load: number; chronic: number; sessions: number }[] {
  const out: { start: string; end: string; load: number; chronic: number; sessions: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const windowEnd = addDays(end, -ACUTE_WINDOW * i);
    const windowStart = addDays(windowEnd, -(ACUTE_WINDOW - 1));
    const inWindow = sessions.filter((s) => s.date >= windowStart && s.date <= windowEnd);
    out.push({
      start: windowStart,
      end: windowEnd,
      load: inWindow.reduce((a, s) => a + sessionLoad(s), 0),
      chronic: chronicLoad(sessions, windowEnd),
      sessions: inWindow.length,
    });
  }
  return out;
}

/** Répartition de la charge par type de séance sur une fenêtre glissante. */
export function loadByType(
  sessions: TrainingSession[],
  end: string,
  days: number,
): Map<string, number> {
  const from = addDays(end, -(days - 1));
  const out = new Map<string, number>();
  for (const s of sessions) {
    if (s.date < from || s.date > end) continue;
    out.set(s.type, (out.get(s.type) ?? 0) + sessionLoad(s));
  }
  return out;
}

/** Date de référence : aujourd’hui, ou la dernière séance si elle est dans le futur. */
export function referenceDay(sessions: TrainingSession[]): string {
  const now = toDayKey(new Date());
  const latest = sessions.reduce((max, s) => (s.date > max ? s.date : max), now);
  return latest;
}
