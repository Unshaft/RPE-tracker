import { useMemo } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Header, Main } from '../../components/Layout';
import { LoadDashboard } from '../../components/LoadDashboard';
import { Avatar, Card, EmptyState, Loading, Section, rpeVars } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { longDate, today } from '../../lib/date';
import { useTeamPlayers, useTeamSessions } from '../../lib/hooks';
import { sessionLoad } from '../../lib/metrics';
import { buildTeamRows, summarizeTeam } from '../../lib/team';
import { SESSION_TYPES } from '../../lib/types';

export function PlayerDetail() {
  const { playerId } = useParams();
  const { team } = useAuth();
  const { data: players, loading: playersLoading } = useTeamPlayers(team?.id);
  const { data: sessionsByPlayer, loading: sessionsLoading } = useTeamSessions(team?.id);
  const loading = playersLoading || sessionsLoading;
  const ref = today();

  const rows = useMemo(
    () => buildTeamRows(players, sessionsByPlayer, ref),
    [players, sessionsByPlayer, ref],
  );
  const row = rows.find((r) => r.player.id === playerId);
  const summary = useMemo(() => summarizeTeam(rows), [rows]);

  // L'effectif arrive de façon asynchrone : sans cette attente, la fiche
  // renverrait vers la liste avant même d'avoir pu trouver le joueur.
  if (loading) {
    return (
      <>
        <Header title="Fiche joueur" back />
        <Main>
          <div style={{ paddingTop: 24 }}>
            <Card><Loading /></Card>
          </div>
        </Main>
      </>
    );
  }

  // Un coach ne voit que les joueurs de sa propre équipe.
  if (!row) return <Navigate to="/coach" replace />;

  const recent = row.sessions.slice(0, 6);

  return (
    <>
      <Header
        title={`${row.player.firstName} ${row.player.lastName}`}
        subtitle={row.player.position ?? 'Joueur'}
        back
        right={<Avatar user={row.player} />}
      />
      <Main>
        <div style={{ paddingTop: 14 }}>
          <LoadDashboard
            sessions={row.sessions}
            referenceDate={ref}
            teamWeekLoad={summary.avgWeekLoad}
          />
        </div>

        <Section title="Dernières séances déclarées">
          <Card flush>
            {recent.length === 0 ? (
              <EmptyState title="Aucune saisie">
                Ce joueur n’a pas encore enregistre de séance.
              </EmptyState>
            ) : (
              <div className="list">
                {recent.map((s) => {
                  const type = SESSION_TYPES.find((t) => t.value === s.type);
                  return (
                    <div key={s.id} className="list__row" style={{ cursor: 'default' }}>
                      <span
                        className="avatar"
                        style={{
                          ...rpeVars(s.rpe),
                          background: 'var(--rpe-color)',
                          color: 'var(--rpe-ink)',
                          borderColor: 'transparent',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {s.rpe}
                      </span>
                      <div className="list__body">
                        <div className="list__title">{type?.label ?? s.type}</div>
                        <div className="list__sub">
                          {longDate(s.date)} · {s.durationMin} min
                          {s.comment ? ` · « ${s.comment} »` : ''}
                        </div>
                      </div>
                      <span className="list__value">{sessionLoad(s)} UA</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </Section>
      </Main>
    </>
  );
}
