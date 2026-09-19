import { addDays, diffDays, lastNDays, startOfWeek, toDayKey } from './date';
import {
  DEFAULT_LOAD_CONTEXT,
  DEFAULT_LOAD_PARAMS,
  analysisParams,
  loadForSession,
  type LoadContext,
  type LoadInput,
} from './loadModels';
import type { AcwrThresholds, ResolvedLoadParams, TrainingSession } from './types';

/**
 * Métriques de charge d’entrainement.
 *
 *  - charge d’une séance   = selon le modèle configuré par l’équipe        [UA]
 *  - charge aiguë          = somme des charges sur la fenêtre aiguë         [UA]
 *  - charge chronique      = charge de la fenêtre chronique, ramenée a une semaine
 *  - ACWR                  = charge aiguë / charge chronique          [ratio]
 *  - monotonie             = moyenne / écart-type des charges quotidiennes (jours de repos inclus)
 *  - contrainte (strain)   = charge hebdomadaire x monotonie          [UA]
 *
 * Toutes ces fonctions prennent un `LoadContext` : l’historique des modèles de
 * charge choisis par l’équipe. Il est optionnel et vaut par défaut « rien de
 * configuré », c’est-a-dire exactement le session-RPE de Foster qui était code
 * en dur auparavant. Un appelant qui ne le passe pas obtient donc les memes
 * chiffres qu’avant — mais ignore le choix de son équipe : les écrans doivent
 * le transmettre.
 *
 * Le modèle est résolu séance par séance, a la date de la séance et selon son
 * domaine (terrain / musculation) : une courbe passée ne change pas de forme
 * parce que le staff a change de modèle ce matin.
 */

/** Valeurs par défaut, conservées pour les écrans qui affichent la fenêtre. */
export const ACUTE_WINDOW = DEFAULT_LOAD_PARAMS.acuteWindowDays;
export const CHRONIC_WINDOW = DEFAULT_LOAD_PARAMS.chronicWindowDays;

export function sessionLoad(s: LoadInput, ctx: LoadContext = DEFAULT_LOAD_CONTEXT): number {
  return loadForSession(s, ctx);
}

/** Charge totale par jour, indexée par cle YYYY-MM-DD. */
export function dailyLoadMap(
  sessions: TrainingSession[],
  ctx: LoadContext = DEFAULT_LOAD_CONTEXT,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of sessions) {
    map.set(s.date, (map.get(s.date) ?? 0) + sessionLoad(s, ctx));
  }
  return map;
}

/** Serie de charges quotidiennes (0 pour les jours sans séance) sur les n derniers jours. */
export function dailySeries(
  sessions: TrainingSession[],
  end: string,
  days: number,
  ctx: LoadContext = DEFAULT_LOAD_CONTEXT,
): { date: string; load: number }[] {
  const map = dailyLoadMap(sessions, ctx);
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
  ctx: LoadContext = DEFAULT_LOAD_CONTEXT,
): number {
  return sum(dailySeries(sessions, end, days, ctx).map((d) => d.load));
}

export function acuteLoad(
  sessions: TrainingSession[],
  end: string,
  ctx: LoadContext = DEFAULT_LOAD_CONTEXT,
): number {
  return loadOverWindow(sessions, end, analysisParams(ctx, end).acuteWindowDays, ctx);
}

/**
 * Charge chronique, exprimee comme une charge hebdomadaire equivalente pour
 * rester directement comparable a la charge aiguë.
 */
export function chronicLoad(
  sessions: TrainingSession[],
  end: string,
  ctx: LoadContext = DEFAULT_LOAD_CONTEXT,
): number {
  const p = analysisParams(ctx, end);
  if (p.chronicMethod === 'ewma') return ewmaChronicLoad(sessions, end, ctx, p);
  return (
    loadOverWindow(sessions, end, p.chronicWindowDays, ctx) /
    (p.chronicWindowDays / p.acuteWindowDays)
  );
}

/**
 * Variante exponentielle (Williams et al., 2017).
 *
 * La moyenne glissante traite le 28e jour comme le 1er puis l’oublie d’un coup ;
 * l’EWMA fait décroître le poids progressivement, ce qui colle mieux a la
 * facon dont un organisme perd les benefices d’un bloc. Le lissage est amorce
 * sur deux fenêtres : demarrer a zéro sous-estimerait la charge chronique tant
 * que la moyenne n’a pas converge, et gonflerait artificiellement l’ACWR.
 */
function ewmaChronicLoad(
  sessions: TrainingSession[],
  end: string,
  ctx: LoadContext,
  p: ResolvedLoadParams,
): number {
  const lambda = 2 / (p.chronicWindowDays + 1);
  let ewma = 0;
  for (const day of dailySeries(sessions, end, p.chronicWindowDays * 2, ctx)) {
    ewma = day.load * lambda + ewma * (1 - lambda);
  }
  // L’EWMA est une charge journaliere ; on la ramene a la meme unite que la
  // charge aiguë, sans quoi le ratio serait faux d’un facteur 7.
  return ewma * p.acuteWindowDays;
}

/** Ratio charge aiguë / chronique. `null` tant que la charge chronique est nulle. */
export function acwr(
  sessions: TrainingSession[],
  end: string,
  ctx: LoadContext = DEFAULT_LOAD_CONTEXT,
): number | null {
  const chronic = chronicLoad(sessions, end, ctx);
  if (chronic <= 0) return null;
  return acuteLoad(sessions, end, ctx) / chronic;
}

/** Monotonie sur la fenêtre aiguë. `null` si l’écart-type est nul (aucune ou charge constante). */
export function monotony(
  sessions: TrainingSession[],
  end: string,
  ctx: LoadContext = DEFAULT_LOAD_CONTEXT,
): number | null {
  const loads = dailySeries(sessions, end, analysisParams(ctx, end).acuteWindowDays, ctx).map(
    (d) => d.load,
  );
  const sd = stdDev(loads);
  if (sd === 0) return null;
  return mean(loads) / sd;
}

/** Contrainte = charge hebdomadaire x monotonie. */
export function strain(
  sessions: TrainingSession[],
  end: string,
  ctx: LoadContext = DEFAULT_LOAD_CONTEXT,
): number | null {
  const m = monotony(sessions, end, ctx);
  if (m === null) return null;
  return acuteLoad(sessions, end, ctx) * m;
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
 * Zones ACWR. Les seuils usuels (Gabbett : < 0.80 sous-charge, 0.80-1.30
 * optimal, 1.30-1.50 vigilance, > 1.50 risque élevé) restent le défaut, mais
 * une équipe peut les deplacer : un sport a faible densite de matchs ne lit pas
 * la meme montee de charge de la meme facon.
 */
export function acwrZone(
  ratio: number | null,
  thresholds: AcwrThresholds = DEFAULT_LOAD_PARAMS.acwrThresholds,
): ZoneInfo | null {
  if (ratio === null) return null;
  if (ratio < thresholds.low) {
    return {
      zone: 'undertraining',
      label: 'Sous-charge',
      short: 'Faible',
      status: 'warning',
      icon: '↓',
      advice: "Charge en baisse marquee : désentraînement possible si cela dure.",
    };
  }
  if (ratio <= thresholds.optimalMax) {
    return {
      zone: 'optimal',
      label: 'Zone optimale',
      short: 'Optimal',
      status: 'good',
      icon: '✓',
      advice: 'Progression de charge maîtrisée, continue ainsi.',
    };
  }
  if (ratio <= thresholds.cautionMax) {
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
  /** Charge de la fenêtre aiguë precedente, pour la variation. */
  previousAcute: number;
  /** Variation relative de la charge aiguë, `null` si semaine précédente vide. */
  acuteDelta: number | null;
  /** Lecture calendaire : semaine en cours vs semaines precedentes. */
  week: WeeklyRatio;
  /** Paramètres effectivement appliques, pour que l’UI puisse les afficher. */
  params: ResolvedLoadParams;
}

export function computePlayerMetrics(
  sessions: TrainingSession[],
  end: string,
  ctx: LoadContext = DEFAULT_LOAD_CONTEXT,
): PlayerMetrics {
  const params = analysisParams(ctx, end);
  const acuteWindow = params.acuteWindowDays;
  const window7 = sessions.filter((s) => s.date <= end && s.date > addDays(end, -acuteWindow));
  const acute = acuteLoad(sessions, end, ctx);
  const previousAcute = acuteLoad(sessions, addDays(end, -acuteWindow), ctx);
  const minutes7d = window7.reduce((a, s) => a + s.durationMin, 0);
  return {
    acute,
    chronic: chronicLoad(sessions, end, ctx),
    acwr: acwr(sessions, end, ctx),
    monotony: monotony(sessions, end, ctx),
    strain: strain(sessions, end, ctx),
    sessionCount7d: window7.length,
    minutes7d,
    avgRpe7d: window7.length
      ? window7.reduce((a, s) => a + s.rpe, 0) / window7.length
      : null,
    previousAcute,
    acuteDelta: previousAcute > 0 ? (acute - previousAcute) / previousAcute : null,
    week: weeklyRatio(sessions, end, ctx),
    params,
  };
}

/**
 * Serie de fenêtres glissantes de la largeur de la fenêtre aiguë, de la plus
 * ancienne a la plus récente, la dernière se terminant a `end`.
 *
 * Volontairement glissantes et non calendaires : une semaine calendaire en
 * cours est incomplète et produirait un faux décrochage en fin de courbe.
 */
export function weeklySeries(
  sessions: TrainingSession[],
  end: string,
  weeks: number,
  ctx: LoadContext = DEFAULT_LOAD_CONTEXT,
): { start: string; end: string; load: number; chronic: number; sessions: number }[] {
  const window = analysisParams(ctx, end).acuteWindowDays;
  const out: { start: string; end: string; load: number; chronic: number; sessions: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const windowEnd = addDays(end, -window * i);
    const windowStart = addDays(windowEnd, -(window - 1));
    const inWindow = sessions.filter((s) => s.date >= windowStart && s.date <= windowEnd);
    out.push({
      start: windowStart,
      end: windowEnd,
      load: inWindow.reduce((a, s) => a + sessionLoad(s, ctx), 0),
      chronic: chronicLoad(sessions, windowEnd, ctx),
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
  ctx: LoadContext = DEFAULT_LOAD_CONTEXT,
): Map<string, number> {
  const from = addDays(end, -(days - 1));
  const out = new Map<string, number>();
  for (const s of sessions) {
    if (s.date < from || s.date > end) continue;
    out.set(s.type, (out.get(s.type) ?? 0) + sessionLoad(s, ctx));
  }
  return out;
}

/** Date de référence : aujourd’hui, ou la dernière séance si elle est dans le futur. */
export function referenceDay(sessions: TrainingSession[]): string {
  const now = toDayKey(new Date());
  const latest = sessions.reduce((max, s) => (s.date > max ? s.date : max), now);
  return latest;
}

/* ------------------------------------------------------------------ *
 * Semaines calendaires (lundi -> dimanche)
 *
 * Lecture demandee par le staff : la charge de la semaine en cours,
 * comparee a la moyenne des 4 semaines calendaires precedentes. C’est la
 * meme famille d’indicateur que l’ACWR, avec deux differences assumees :
 * les fenetres sont calendaires (et non glissantes) et la reference exclut
 * la semaine en cours. Les deux ratios sont exposes cote a cote.
 * ------------------------------------------------------------------ */

/** Nombre de semaines de reference par défaut pour le ratio hebdomadaire. */
export const WEEKLY_LOOKBACK = DEFAULT_LOAD_PARAMS.weeklyLookbackWeeks;

export interface CalendarWeek {
  /** Lundi de la semaine. */
  start: string;
  /** Dimanche de la semaine. */
  end: string;
  load: number;
  sessions: number;
  /** Jours de la semaine deja ecoules au jour de reference (0 a 7). */
  elapsedDays: number;
  /** Vrai tant que la semaine n’est pas terminee. */
  partial: boolean;
}

function buildCalendarWeek(
  sessions: TrainingSession[],
  monday: string,
  reference: string,
  ctx: LoadContext,
): CalendarWeek {
  const end = addDays(monday, 6);
  const inWeek = sessions.filter((s) => s.date >= monday && s.date <= end);
  const elapsedDays = Math.min(7, Math.max(0, diffDays(reference, monday) + 1));
  return {
    start: monday,
    end,
    load: inWeek.reduce((a, s) => a + sessionLoad(s, ctx), 0),
    sessions: inWeek.length,
    elapsedDays,
    partial: elapsedDays < 7,
  };
}

/**
 * Les `weeks` dernieres semaines calendaires, de la plus ancienne a celle
 * qui contient `end`.
 */
export function calendarWeeks(
  sessions: TrainingSession[],
  end: string,
  weeks: number,
  ctx: LoadContext = DEFAULT_LOAD_CONTEXT,
): CalendarWeek[] {
  const currentMonday = startOfWeek(end);
  const out: CalendarWeek[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    out.push(buildCalendarWeek(sessions, addDays(currentMonday, -7 * i), end, ctx));
  }
  return out;
}

/** Date de la toute premiere seance enregistree, `null` si aucune. */
function firstSessionDate(sessions: TrainingSession[]): string | null {
  return sessions.reduce<string | null>(
    (min, s) => (min === null || s.date < min ? s.date : min),
    null,
  );
}

export interface WeeklyRatio {
  /** Charge de la semaine calendaire en cours, en UA. */
  current: number;
  /** Moyenne des semaines calendaires precedentes retenues, en UA. */
  baseline: number;
  /** current / baseline. `null` tant qu’il n’y a pas d’historique exploitable. */
  ratio: number | null;
  /** Semaines precedentes reellement prises en compte (au plus `lookback`). */
  weeksUsed: number;
  /** Profondeur de reference demandee, telle que configuree par l’équipe. */
  lookback: number;
  elapsedDays: number;
  partial: boolean;
}

/**
 * Charge de la semaine calendaire en cours rapportee a la moyenne des
 * `lookback` semaines precedentes.
 *
 * Les semaines anterieures a la premiere seance du joueur sont exclues de la
 * moyenne : sans cela, un joueur qui vient d’arriver aurait une reference
 * artificiellement basse et passerait en zone rouge des sa premiere semaine.
 * En revanche une semaine sans seance posterieure a ses debuts compte bien
 * pour 0 : c’est une vraie semaine de repos, et elle doit peser.
 */
export function weeklyRatio(
  sessions: TrainingSession[],
  end: string,
  ctx: LoadContext = DEFAULT_LOAD_CONTEXT,
  lookback = analysisParams(ctx, end).weeklyLookbackWeeks,
): WeeklyRatio {
  const weeks = calendarWeeks(sessions, end, lookback + 1, ctx);
  const current = weeks[weeks.length - 1];
  const first = firstSessionDate(sessions);
  const previous = weeks
    .slice(0, -1)
    .filter((w) => first !== null && w.end >= first);
  const baseline = mean(previous.map((w) => w.load));
  return {
    current: current.load,
    baseline,
    ratio: baseline > 0 ? current.load / baseline : null,
    weeksUsed: previous.length,
    lookback,
    elapsedDays: current.elapsedDays,
    partial: current.partial,
  };
}

export interface WeeklyRatioPoint extends CalendarWeek {
  /** Moyenne des semaines precedentes, telle que vue a la fin de cette semaine. */
  baseline: number;
  ratio: number | null;
}

/**
 * Historique du ratio hebdomadaire, une valeur par semaine calendaire.
 * Chaque point est calcule tel qu’il se presentait a la fin de sa propre
 * semaine, pour que la courbe reproduise ce que le staff a vu sur le moment.
 */
export function weeklyRatioSeries(
  sessions: TrainingSession[],
  end: string,
  weeks: number,
  ctx: LoadContext = DEFAULT_LOAD_CONTEXT,
  lookback?: number,
): WeeklyRatioPoint[] {
  return calendarWeeks(sessions, end, weeks, ctx).map((week) => {
    const asOf = week.end < end ? week.end : end;
    // `lookback` reste resolu a la date du point : si l’équipe a change de
    // profondeur de reference, chaque point garde celle qui avait cours.
    const r = weeklyRatio(sessions, asOf, ctx, lookback ?? analysisParams(ctx, asOf).weeklyLookbackWeeks);
    return { ...week, baseline: r.baseline, ratio: r.ratio };
  });
}

/**
 * Les deux ratios — ACWR glissant et ratio hebdomadaire calendaire — sont
 * deux estimations du meme rapport « charge recente / charge habituelle » et
 * partagent donc la meme grille de lecture.
 */
export const riskZone = acwrZone;
