import {
  calendarWeeks,
  computePlayerMetrics,
  riskZone,
  type PlayerMetrics,
  type ZoneInfo,
} from './metrics';
import type { PublicUser, TrainingSession } from './types';

export interface PlayerRow {
  player: PublicUser;
  sessions: TrainingSession[];
  metrics: PlayerMetrics;
  /**
   * Zone de risque de reference cote staff : celle du ratio hebdomadaire
   * calendaire (semaine en cours / 4 semaines precedentes).
   */
  zone: ZoneInfo | null;
  /** Charge des 6 dernieres semaines calendaires, pour la micro-tendance. */
  spark: number[];
  lastSessionDate: string | null;
}

export function buildTeamRows(
  players: PublicUser[],
  sessionsByPlayer: Map<string, TrainingSession[]>,
  referenceDate: string,
): PlayerRow[] {
  return players.map((player) => {
    const sessions = (sessionsByPlayer.get(player.id) ?? [])
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));
    const metrics = computePlayerMetrics(sessions, referenceDate);
    return {
      player,
      sessions,
      metrics,
      zone: riskZone(metrics.week.ratio),
      spark: calendarWeeks(sessions, referenceDate, 6).map((w) => w.load),
      lastSessionDate: sessions[0]?.date ?? null,
    };
  });
}

export interface TeamSummary {
  playerCount: number;
  /** Joueurs ayant saisi au moins une seance sur la semaine en cours. */
  activeCount: number;
  sessionCount7d: number;
  /** Charge moyenne de l’effectif sur la semaine calendaire en cours, en UA. */
  avgWeekLoad: number;
  alerts: PlayerRow[];
}

export function summarizeTeam(rows: PlayerRow[]): TeamSummary {
  const active = rows.filter((r) => r.metrics.sessionCount7d > 0);
  const avg = (pick: (r: PlayerRow) => number) =>
    active.length ? active.reduce((a, r) => a + pick(r), 0) / active.length : 0;
  return {
    playerCount: rows.length,
    activeCount: active.length,
    sessionCount7d: rows.reduce((a, r) => a + r.metrics.sessionCount7d, 0),
    avgWeekLoad: avg((r) => r.metrics.week.current),
    alerts: rows.filter((r) => r.zone && r.zone.zone !== 'optimal'),
  };
}

export type SortKey = 'load' | 'ratio' | 'name';

export function sortRows(rows: PlayerRow[], key: SortKey): PlayerRow[] {
  const copy = rows.slice();
  switch (key) {
    case 'load':
      return copy.sort((a, b) => b.metrics.week.current - a.metrics.week.current);
    case 'ratio':
      // Les ratios les plus eleves (donc les plus a risque) remontent en tete.
      return copy.sort((a, b) => (b.metrics.week.ratio ?? -1) - (a.metrics.week.ratio ?? -1));
    default:
      return copy.sort((a, b) => a.player.lastName.localeCompare(b.player.lastName));
  }
}

/** Charge hebdomadaire moyenne de l’effectif, semaine calendaire par semaine. */
export function teamWeeklyAverage(
  rows: PlayerRow[],
  referenceDate: string,
  weeks: number,
): { start: string; end: string; load: number; partial: boolean }[] {
  if (rows.length === 0) return [];
  const perPlayer = rows.map((r) => calendarWeeks(r.sessions, referenceDate, weeks));
  return perPlayer[0].map((week, i) => ({
    start: week.start,
    end: week.end,
    partial: week.partial,
    load: perPlayer.reduce((a, series) => a + series[i].load, 0) / rows.length,
  }));
}

export interface PlayerAcute {
  player: PublicUser;
  /** Charge des 7 derniers jours glissants, en UA. */
  acute: number;
  sessionCount7d: number;
}

/**
 * Charge des 7 derniers jours, joueur par joueur, du plus charge au moins
 * charge. Les joueurs sans saisie restent dans la liste, a zero : cote staff,
 * une absence de declaration est une information, pas une ligne a masquer.
 */
export function acuteByPlayer(rows: PlayerRow[]): PlayerAcute[] {
  return rows
    .map((r) => ({
      player: r.player,
      acute: r.metrics.acute,
      sessionCount7d: r.metrics.sessionCount7d,
    }))
    .sort((a, b) => b.acute - a.acute);
}
