import { dayLabel, longDate, shortDate, weekLabel } from '../lib/date';
import {
  WEEKLY_LOOKBACK,
  acwrZone,
  computePlayerMetrics,
  dailySeries,
  loadByType,
  monotonyStatus,
  riskZone,
  weeklyRatioSeries,
  weeklySeries,
} from '../lib/metrics';
import type { TrainingSession } from '../lib/types';
import { AcwrGauge } from './charts/AcwrGauge';
import { formatLoad, formatRatio, plural } from './charts/chartUtils';
import { BarSeriesChart } from './charts/BarSeriesChart';
import { RatioTrendChart } from './charts/RatioTrendChart';
import { TypeBreakdown } from './charts/TypeBreakdown';
import { WeeklyLoadChart } from './charts/WeeklyLoadChart';
import { Card, Delta, EmptyState, Section, StatusBadge, TableView, Tile } from './ui';

const MONOTONY_HINT: Record<string, string> = {
  good: 'Charge bien variée',
  warning: 'Semaine un peu monotone',
  critical: 'Trop peu de variation',
};

/**
 * Bloc d’analyse de charge d’un joueur. Partage par le tableau de bord du
 * joueur et par la fiche joueur cote coach : une seule definition des
 * métriques et des graphiques.
 *
 * Deux ratios sont affiches cote a cote, dans cet ordre :
 *  1. le ratio hebdomadaire calendaire (semaine en cours / 4 semaines
 *     precedentes), lecture de reference du staff ;
 *  2. l’ACWR glissant 7 j / 28 j, definition standard de la litterature.
 */
export function LoadDashboard({
  sessions,
  referenceDate,
  teamWeekLoad,
}: {
  sessions: TrainingSession[];
  referenceDate: string;
  /** Charge moyenne de l’équipe sur la semaine en cours, pour situer le joueur. */
  teamWeekLoad?: number | null;
}) {
  const m = computePlayerMetrics(sessions, referenceDate);
  const week = m.week;
  const weekZone = riskZone(week.ratio);
  const acwrInfo = acwrZone(m.acwr);
  const monoStatus = monotonyStatus(m.monotony);
  const daily = dailySeries(sessions, referenceDate, 14);
  const ratioTrend = weeklyRatioSeries(sessions, referenceDate, 8);
  const currentWeek = ratioTrend[ratioTrend.length - 1];
  const rolling = weeklySeries(sessions, referenceDate, 8);
  const byType = loadByType(sessions, referenceDate, 28);

  if (sessions.length === 0) {
    return (
      <Card>
        <EmptyState title="Aucune séance enregistrée">
          Les indicateurs de charge apparaîtront des la premiere saisie.
        </EmptyState>
      </Card>
    );
  }

  return (
    <>
      <div className="hero">
        <div className="row row--between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="hero__label">Semaine en cours · {weekLabel(currentWeek.start)}</div>
            <div className="hero__value">
              {formatLoad(week.current)}
              <span className="hero__unit">UA</span>
            </div>
          </div>
          {weekZone && (
            <StatusBadge status={weekZone.status} icon={weekZone.icon}>
              {weekZone.label}
            </StatusBadge>
          )}
        </div>
        <div className="hero__foot">
          {plural(currentWeek.sessions, 'séance', 'séances')}
          {week.partial ? ` · jour ${currentWeek.elapsedDays}/7` : ' · semaine complète'}
        </div>
        <div className="hero__foot" style={{ color: 'var(--text-muted)' }}>
          7 jours glissants : {formatLoad(m.acute)} UA
        </div>
        <div className="hero__foot">
          <Delta value={m.acuteDelta} />
        </div>
        {teamWeekLoad != null && teamWeekLoad > 0 && (
          <div className="hero__foot" style={{ color: 'var(--text-muted)' }}>
            Moyenne équipe : {formatLoad(teamWeekLoad)} UA (
            {week.current >= teamWeekLoad ? '+' : ''}
            {Math.round(((week.current - teamWeekLoad) / teamWeekLoad) * 100)} %)
          </div>
        )}
      </div>

      <Section title="Zone de risque">
        <Card
          title={`Ratio hebdo ${formatRatio(week.ratio)}`}
          hint={
            week.weeksUsed === 0
              ? 'Pas encore de semaine de référence'
              : `Semaine ${formatLoad(week.current)} UA · moyenne des ${week.weeksUsed} semaines précédentes ${formatLoad(week.baseline)} UA`
          }
        >
          <AcwrGauge ratio={week.ratio} />
          {weekZone ? (
            <p style={{ marginTop: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
              <strong style={{ fontWeight: 640 }}>
                {weekZone.icon} {weekZone.label}.
              </strong>{' '}
              {weekZone.advice}
            </p>
          ) : (
            <p style={{ marginTop: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
              Le ratio se calcule des qu’une semaine précédente est renseignée.
            </p>
          )}
          {week.partial && week.ratio !== null && (
            <p style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text-muted)' }}>
              Semaine incomplète ({currentWeek.elapsedDays}/7 jours) : le ratio montera encore
              d’ici dimanche.
            </p>
          )}
          {week.weeksUsed > 0 && week.weeksUsed < WEEKLY_LOOKBACK && (
            <p style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text-muted)' }}>
              Référence calculée sur {week.weeksUsed} semaine
              {week.weeksUsed > 1 ? 's' : ''} seulement : elle se stabilisera avec l’historique.
            </p>
          )}
        </Card>

        <Card
          title={`ACWR ${formatRatio(m.acwr)}`}
          hint={`7 j glissants ${formatLoad(m.acute)} UA · 28 j ramenés à la semaine ${formatLoad(m.chronic)} UA`}
        >
          <AcwrGauge ratio={m.acwr} />
          {acwrInfo && (
            <p style={{ marginTop: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
              <strong style={{ fontWeight: 640 }}>
                {acwrInfo.icon} {acwrInfo.label}.
              </strong>{' '}
              Lecture glissante, sans effet de bord de début de semaine.
            </p>
          )}
        </Card>
      </Section>

      <Section title="Évolution du ratio (8 semaines)">
        <Card title="Ratio hebdomadaire" hint="Semaine calendaire / moyenne des 4 précédentes">
          <RatioTrendChart data={ratioTrend} />
          <TableView
            columns={['Semaine', 'Charge (UA)', 'Référence (UA)', 'Ratio']}
            rows={ratioTrend.map((w) => [
              weekLabel(w.start),
              Math.round(w.load),
              Math.round(w.baseline),
              formatRatio(w.ratio),
            ])}
          />
        </Card>
      </Section>

      <Section title="7 derniers jours">
        <div className="grid-2">
          <Tile label="Séances" value={m.sessionCount7d} hint={`${m.minutes7d} min cumulées`} />
          <Tile
            label="RPE moyen"
            value={m.avgRpe7d === null ? '—' : m.avgRpe7d.toFixed(1)}
            hint="Échelle CR-10"
          />
          <Tile
            label="Monotonie"
            value={formatRatio(m.monotony, 2)}
            hint={monoStatus ? MONOTONY_HINT[monoStatus] : 'Pas assez de données'}
          />
          <Tile
            label="Contrainte"
            value={m.strain === null ? '—' : formatLoad(m.strain)}
            hint="Charge x monotonie"
          />
        </div>
      </Section>

      <Section title="Charge quotidienne (14 jours)">
        <Card title="Charge par jour" hint="RPE x durée, en unités arbitraires (UA)">
          <BarSeriesChart
            ariaLabel="Charge quotidienne des 14 derniers jours, en unités arbitraires"
            data={daily.map((d) => ({
              key: d.date,
              tick: dayLabel(d.date).slice(0, 2),
              label: longDate(d.date),
              value: d.load,
            }))}
          />
          <TableView
            columns={['Jour', 'Charge (UA)']}
            rows={daily.map((d) => [shortDate(d.date), d.load])}
          />
        </Card>
      </Section>

      <Section title="Tendance glissante (8 semaines)">
        <Card title="Charge 7 jours vs chronique" hint="Fenêtres glissantes, même unité">
          <WeeklyLoadChart data={rolling} />
          <TableView
            columns={['7 jours au', 'Charge', 'Chronique']}
            rows={rolling.map((w) => [shortDate(w.end), w.load, Math.round(w.chronic)])}
          />
        </Card>
      </Section>

      <Section title="Répartition (28 jours)">
        <Card title="Charge par type de séance">
          <TypeBreakdown byType={byType} />
        </Card>
      </Section>
    </>
  );
}
