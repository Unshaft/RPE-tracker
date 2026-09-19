import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarSeriesChart } from '../../components/charts/BarSeriesChart';
import { formatLoad, formatRatio, plural } from '../../components/charts/chartUtils';
import { Sparkline } from '../../components/charts/Sparkline';
import { Header, Main } from '../../components/Layout';
import {
  Avatar,
  Card,
  EmptyState,
  Loading,
  Section,
  StatusBadge,
  TableView,
  Tile,
} from '../../components/ui';
import { IconChevron } from '../../components/icons';
import { useLoadContext } from '../../components/loadContext';
import { useAuth } from '../../lib/auth';
import { longDate, shortDate, startOfWeek, today, weekLabel } from '../../lib/date';
import { useTeamPlayers, useTeamSessions } from '../../lib/hooks';
import {
  acuteByPlayer,
  buildTeamRows,
  sortRows,
  summarizeTeam,
  teamWeeklyAverage,
  type SortKey,
} from '../../lib/team';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'load', label: 'Charge' },
  { key: 'ratio', label: 'Risque' },
  { key: 'name', label: 'Nom' },
];

export function CoachDashboard() {
  const { user, team } = useAuth();
  const ctx = useLoadContext();
  const { data: players, loading: playersLoading, error: playersError } = useTeamPlayers(team?.id);
  const { data: sessionsByPlayer, loading: sessionsLoading } = useTeamSessions(team?.id);
  const loading = playersLoading || sessionsLoading;
  const [sort, setSort] = useState<SortKey>('load');
  const ref = today();

  const rows = useMemo(
    () => buildTeamRows(players, sessionsByPlayer, ref, ctx),
    [players, sessionsByPlayer, ref, ctx],
  );
  const summary = useMemo(() => summarizeTeam(rows), [rows]);
  const weekly = useMemo(() => teamWeeklyAverage(rows, ref, 8, ctx), [rows, ref, ctx]);
  const acute = useMemo(() => acuteByPlayer(rows), [rows]);
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

  if (loading || playersError) {
    return (
      <>
        <Header title={team.name} subtitle={longDate(ref)} />
        <Main>
          <div style={{ paddingTop: 24 }}>
            <Card>
              {playersError ? (
                <div className="alert alert--error" role="alert">
                  {playersError}
                </div>
              ) : (
                <Loading label="Chargement de l’effectif…" />
              )}
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
        {/* Une pile sur telephone ; le shell du coach la met en deux colonnes a
            partir de 1180 px. Ce qui reste pleine largeur est ce qui perd son
            sens a demi-largeur : la barre par joueur, qui compte autant de
            colonnes que l'effectif. */}
        <div className="dash-grid">
          <div className="hero dash-grid__full" style={{ marginTop: 14 }}>
            <div className="hero__label">
              Charge moyenne · semaine en cours ({weekLabel(startOfWeek(ref))})
            </div>
            <div className="hero__value">
              {formatLoad(summary.avgWeekLoad)}
              <span className="hero__unit">UA</span>
            </div>
            <div className="hero__foot">
              {summary.activeCount}/{summary.playerCount} joueurs actifs ·{' '}
              {plural(summary.sessionCount7d, 'séance déclarée', 'séances déclarées')}
            </div>
          </div>

          {rows.length > 0 && (
            <Section title="Charge des 7 derniers jours" full>
              <Card title="Par joueur" hint="7 jours glissants, en UA">
                <BarSeriesChart
                  ariaLabel="Charge des 7 derniers jours glissants, joueur par joueur, en unités arbitraires"
                  data={acute.map((a) => ({
                    key: a.player.id,
                    tick: a.player.lastName.slice(0, 5),
                    label: `${a.player.firstName} ${a.player.lastName}`,
                    value: a.acute,
                  }))}
                />
                <TableView
                  columns={['Joueur', 'Charge 7 j (UA)', 'Séances']}
                  rows={acute.map((a) => [
                    `${a.player.lastName} ${a.player.firstName[0] ?? ''}.`,
                    Math.round(a.acute),
                    String(a.sessionCount7d),
                  ])}
                />
              </Card>
            </Section>
          )}

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
                    <Link
                      key={r.player.id}
                      className="list__row"
                      to={`/coach/joueur/${r.player.id}`}
                    >
                      <Avatar user={r.player} />
                      <div className="list__body">
                        <div className="list__title">
                          {r.player.firstName} {r.player.lastName}
                        </div>
                        <div className="list__sub">
                          Ratio {formatRatio(r.metrics.week.ratio)} ·{' '}
                          {formatLoad(r.metrics.week.current)} UA cette semaine
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
            <Card
              title="Moyenne de l’effectif"
              hint="8 semaines calendaires (lundi - dimanche), en UA"
            >
              <BarSeriesChart
                ariaLabel="Charge hebdomadaire moyenne de l’équipe sur 8 semaines calendaires, en unités arbitraires"
                data={weekly.map((w) => ({
                  key: w.start,
                  tick: shortDate(w.start).split(' ')[0],
                  label: `${weekLabel(w.start)}${w.partial ? ' (en cours)' : ''}`,
                  value: w.load,
                }))}
              />
              <TableView
                columns={['Semaine', 'Charge moyenne (UA)']}
                rows={weekly.map((w) => [weekLabel(w.start), Math.round(w.load)])}
              />
            </Card>
          </Section>

          <Section
            title="Joueurs"
            action={
              <div
                className="segmented"
                style={{ width: 190 }}
                role="group"
                aria-label="Trier les joueurs"
              >
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
                  {team.inviteCode
                    ? `Partage le code ${team.inviteCode} à tes joueurs pour qu’ils rejoignent l’équipe.`
                    : 'L’invitation est révoquée : génère un nouveau lien depuis l’effectif.'}
                </EmptyState>
              ) : (
                <div className="list">
                  {sorted.map((r) => (
                    <Link
                      key={r.player.id}
                      className="list__row"
                      to={`/coach/joueur/${r.player.id}`}
                    >
                      <Avatar user={r.player} />
                      <div className="list__body">
                        <div className="list__title">
                          {r.player.firstName} {r.player.lastName}
                        </div>
                        <div className="list__sub">
                          {formatLoad(r.metrics.week.current)} UA · ratio{' '}
                          {formatRatio(r.metrics.week.ratio)} · ACWR {formatRatio(r.metrics.acwr)}
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
              columns={['Joueur', 'Semaine (UA)', 'Ratio', 'ACWR', 'Séances 7 j']}
              rows={sorted.map((r) => [
                `${r.player.lastName} ${r.player.firstName[0]}.`,
                Math.round(r.metrics.week.current),
                formatRatio(r.metrics.week.ratio),
                formatRatio(r.metrics.acwr),
                String(r.metrics.sessionCount7d),
              ])}
            />
          </Section>
        </div>
      </Main>
    </>
  );
}
