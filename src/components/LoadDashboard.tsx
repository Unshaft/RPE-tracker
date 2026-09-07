import { dayLabel, longDate, shortDate } from '../lib/date';
import {
  acwrZone,
  computePlayerMetrics,
  dailySeries,
  loadByType,
  monotonyStatus,
  weeklySeries,
} from '../lib/metrics';
import type { TrainingSession } from '../lib/types';
import { AcwrGauge } from './charts/AcwrGauge';
import { formatLoad, formatRatio } from './charts/chartUtils';
import { BarSeriesChart } from './charts/BarSeriesChart';
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
 */
export function LoadDashboard({
  sessions,
  referenceDate,
  teamAcute,
}: {
  sessions: TrainingSession[];
  referenceDate: string;
  /** Charge aiguë moyenne de l’équipe, pour situer le joueur (vue coach). */
  teamAcute?: number | null;
}) {
  const m = computePlayerMetrics(sessions, referenceDate);
  const zone = acwrZone(m.acwr);
  const monoStatus = monotonyStatus(m.monotony);
  const daily = dailySeries(sessions, referenceDate, 14);
  const weekly = weeklySeries(sessions, referenceDate, 8);
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
            <div className="hero__label">Charge 7 jours</div>
            <div className="hero__value">
              {formatLoad(m.acute)}
              <span className="hero__unit">UA</span>
            </div>
          </div>
          {zone && (
            <StatusBadge status={zone.status} icon={zone.icon}>
              {zone.label}
            </StatusBadge>
          )}
        </div>
        <div className="hero__foot">
          <Delta value={m.acuteDelta} />
        </div>
        {teamAcute != null && teamAcute > 0 && (
          <div className="hero__foot" style={{ color: 'var(--text-muted)' }}>
            Moyenne équipe : {formatLoad(teamAcute)} UA (
            {m.acute >= teamAcute ? '+' : ''}
            {Math.round(((m.acute - teamAcute) / teamAcute) * 100)} %)
          </div>
        )}
      </div>

      <Section title="Cette semaine">
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

      <Section title="Ratio aigu / chronique">
        <Card
          title={`ACWR ${formatRatio(m.acwr)}`}
          hint={`Aigu ${formatLoad(m.acute)} UA · chronique ${formatLoad(m.chronic)} UA`}
        >
          <AcwrGauge ratio={m.acwr} />
          {zone && (
            <p style={{ marginTop: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
              <strong style={{ fontWeight: 640 }}>
                {zone.icon} {zone.label}.
              </strong>{' '}
              {zone.advice}
            </p>
          )}
        </Card>
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

      <Section title="Tendance (8 semaines)">
        <Card title="Charge 7 jours vs chronique" hint="Fenêtres glissantes, même unité">
          <WeeklyLoadChart data={weekly} />
          <TableView
            columns={['7 jours au', 'Charge', 'Chronique']}
            rows={weekly.map((w) => [shortDate(w.end), w.load, Math.round(w.chronic)])}
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
