import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarSeriesChart } from '../../components/charts/BarSeriesChart';
import { formatLoad, formatRatio, plural } from '../../components/charts/chartUtils';
import { Sparkline } from '../../components/charts/Sparkline';
import { Header, Main } from '../../components/Layout';
import { Avatar, Card, EmptyState, Section, StatusBadge, TableView, Tile } from '../../components/ui';
import { IconChevron } from '../../components/icons';
import { useAuth } from '../../lib/auth';
import { longDate, shortDate, today } from '../../lib/date';
import { useTeamPlayers, useTeamSessions } from '../../lib/hooks';
import { buildTeamRows, sortRows, summarizeTeam, teamWeeklyAverage, type SortKey } from '../../lib/team';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'load', label: 'Charge' },
  { key: 'acwr', label: 'Risque' },
  { key: 'name', label: 'Nom' },
];

export function CoachDashboard() {
  const { user, team } = useAuth();
  const players = useTeamPlayers(team?.id);
  const sessionsByPlayer = useTeamSessions(team?.id);
  const [sort, setSort] = useState<SortKey>('load');
  const ref = today();

  const rows = useMemo(
    () => buildTeamRows(players, sessionsByPlayer, ref),
    [players, sessionsByPlayer, ref],
  );
  const summary = useMemo(() => summarizeTeam(rows), [rows]);
  const weekly = useMemo(() => teamWeeklyAverage(rows, ref, 8), [rows, ref]);
  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort]);

  if (!user) return null;

  if (!team) {
    return (
      <>
        <Header title="Mon équipe" />
        <Main>
          <div style={{ paddingTop: 24 }}>
            <Card>
              <EmptyState title="Aucune équipe">
                Créé ton équipe depuis ton profil pour commencer a suivre tes joueurs.
              </EmptyState>
            </Card>
          </div>
        </Main>
      </>
    );
  }

  return (
    <>
      <Header
        title={team.name}
        subtitle={longDate(ref)}
        right={
          <Link to="/profil" aria-label="Mon profil">
            <Avatar user={user} />
          </Link>
        }
      />
      <Main>
        <div className="hero" style={{ marginTop: 14 }}>
          <div className="hero__label">Charge moyenne 7 jours</div>
          <div className="hero__value">
            {formatLoad(summary.avgAcute)}
            <span className="hero__unit">UA</span>
          </div>
          <div className="hero__foot">
            {summary.activeCount}/{summary.playerCount} joueurs actifs ·{' '}
            {plural(summary.sessionCount7d, 'séance déclarée', 'séances déclarées')}
          </div>
        </div>

        <Section title="Suivi de l’effectif">
          <div className="grid-2">
            <Tile label="Effectif" value={summary.playerCount} hint="joueurs rattachés" />
            <Tile
              label="Participation"
              value={`${summary.playerCount ? Math.round((summary.activeCount / summary.playerCount) * 100) : 0} %`}
              hint="saisies sur 7 jours"
            />
          </div>
        </Section>

        {summary.alerts.length > 0 && (
          <Section title={`À surveiller (${summary.alerts.length})`}>
            <Card flush>
              <div className="list">
                {summary.alerts.map((r) => (
                  <Link key={r.player.id} className="list__row" to={`/coach/joueur/${r.player.id}`}>
                    <Avatar user={r.player} />
                    <div className="list__body">
                      <div className="list__title">
                        {r.player.firstName} {r.player.lastName}
                      </div>
                      <div className="list__sub">
                        ACWR {formatRatio(r.metrics.acwr)} · {formatLoad(r.metrics.acute)} UA
                      </div>
                    </div>
                    {r.zone && (
                      <StatusBadge status={r.zone.status} icon={r.zone.icon}>
                        {r.zone.short}
                      </StatusBadge>
                    )}
                  </Link>
                ))}
              </div>
            </Card>
          </Section>
        )}

        <Section title="Charge moyenne par semaine">
          <Card title="Moyenne de l’effectif" hint="8 fenêtres glissantes de 7 jours, en UA">
            <BarSeriesChart
              ariaLabel="Charge hebdomadaire moyenne de l’équipe sur 8 semaines, en unités arbitraires"
              data={weekly.map((w) => ({
                key: w.end,
                tick: shortDate(w.end).split(' ')[0],
                label: `7 jours au ${shortDate(w.end)}`,
                value: w.load,
              }))}
            />
            <TableView
              columns={['7 jours au', 'Charge moyenne (UA)']}
              rows={weekly.map((w) => [shortDate(w.end), Math.round(w.load)])}
            />
          </Card>
        </Section>

        <Section
          title="Joueurs"
          action={
            <div className="segmented" style={{ width: 190 }} role="group" aria-label="Trier les joueurs">
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className="segmented__btn"
                  aria-pressed={sort === s.key}
                  onClick={() => setSort(s.key)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          }
        >
          <Card flush>
            {sorted.length === 0 ? (
              <EmptyState title="Aucun joueur rattaché">
                Partage le code {team.inviteCode} à tes joueurs pour qu’ils rejoignent l’équipe.
              </EmptyState>
            ) : (
              <div className="list">
                {sorted.map((r) => (
                  <Link key={r.player.id} className="list__row" to={`/coach/joueur/${r.player.id}`}>
                    <Avatar user={r.player} />
                    <div className="list__body">
                      <div className="list__title">
                        {r.player.firstName} {r.player.lastName}
                      </div>
                      <div className="list__sub">
                        {formatLoad(r.metrics.acute)} UA · ACWR {formatRatio(r.metrics.acwr)}
                      </div>
                    </div>
                    <div className="list__aside">
                      {r.zone ? (
                        <StatusBadge status={r.zone.status} icon={r.zone.icon}>
                          {r.zone.short}
                        </StatusBadge>
                      ) : (
                        <StatusBadge status="neutral">Pas de saisie</StatusBadge>
                      )}
                      <Sparkline values={r.spark} width={58} height={18} />
                    </div>
                    <IconChevron className="list__chevron" />
                  </Link>
                ))}
              </div>
            )}
          </Card>
          <TableView
            summary="Voir le tableau de l’effectif"
            columns={['Joueur', 'Charge 7 j', 'ACWR', 'Séances']}
            rows={sorted.map((r) => [
              `${r.player.lastName} ${r.player.firstName[0]}.`,
              Math.round(r.metrics.acute),
              formatRatio(r.metrics.acwr),
              String(r.metrics.sessionCount7d),
            ])}
          />
        </Section>
      </Main>
    </>
  );
}
