import { weeklySeries, computePlayerMetrics, acwrZone, type PlayerMetrics, type ZoneInfo } from './metrics';
import type { PublicUser, TrainingSession } from './types';

export interface PlayerRow {
  player: PublicUser;
  sessions: TrainingSession[];
  metrics: PlayerMetrics;
  zone: ZoneInfo | null;
  /** Charge des 6 dernières semaines, pour la micro-tendance. */
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
      zone: acwrZone(metrics.acwr),
      spark: weeklySeries(sessions, referenceDate, 6).map((w) => w.load),
      lastSessionDate: sessions[0]?.date ?? null,
    };
  });
}

export interface TeamSummary {
  playerCount: number;
  /** Joueurs ayant saisi au moins une séance sur les 7 derniers jours. */
  activeCount: number;
  sessionCount7d: number;
  avgAcute: number;
  alerts: PlayerRow[];
}

export function summarizeTeam(rows: PlayerRow[]): TeamSummary {
  const active = rows.filter((r) => r.metrics.sessionCount7d > 0);
  const avgAcute = active.length
    ? active.reduce((a, r) => a + r.metrics.acute, 0) / active.length
    : 0;
  return {
    playerCount: rows.length,
    activeCount: active.length,
    sessionCount7d: rows.reduce((a, r) => a + r.metrics.sessionCount7d, 0),
    avgAcute,
    alerts: rows.filter(
      (r) => r.zone && (r.zone.zone === 'danger' || r.zone.zone === 'caution' || r.zone.zone === 'undertraining'),
    ),
  };
}

export type SortKey = 'load' | 'acwr' | 'name';

export function sortRows(rows: PlayerRow[], key: SortKey): PlayerRow[] {
  const copy = rows.slice();
  switch (key) {
    case 'load':
      return copy.sort((a, b) => b.metrics.acute - a.metrics.acute);
    case 'acwr':
      // Les ratios les plus eleves (donc les plus a risque) remontent en tete.
      return copy.sort((a, b) => (b.metrics.acwr ?? -1) - (a.metrics.acwr ?? -1));
    default:
      return copy.sort((a, b) => a.player.lastName.localeCompare(b.player.lastName));
  }
}

/** Charge hebdomadaire moyenne de l’équipe, semaine par semaine. */
export function teamWeeklyAverage(
  rows: PlayerRow[],
  referenceDate: string,
  weeks: number,
): { end: string; load: number }[] {
  if (rows.length === 0) return [];
  const perPlayer = rows.map((r) => weeklySeries(r.sessions, referenceDate, weeks));
  return perPlayer[0].map((_, i) => ({
    end: perPlayer[0][i].end,
    load: perPlayer.reduce((a, series) => a + series[i].load, 0) / rows.length,
  }));
}
