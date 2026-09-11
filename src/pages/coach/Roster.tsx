import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatLoad, plural } from '../../components/charts/chartUtils';
import { Header, Main } from '../../components/Layout';
import { Avatar, Card, EmptyState, Loading, Section, StatusBadge } from '../../components/ui';
import { IconChevron } from '../../components/icons';
import { useAuth } from '../../lib/auth';
import { compactRelative, diffDays, today } from '../../lib/date';
import { useTeamPlayers, useTeamSessions } from '../../lib/hooks';
import { buildTeamRows, sortRows } from '../../lib/team';

export function Roster() {
  const { team } = useAuth();
  const { data: players, loading: playersLoading, error: playersError } = useTeamPlayers(team?.id);
  const { data: sessionsByPlayer, loading: sessionsLoading } = useTeamSessions(team?.id);
  const loading = playersLoading || sessionsLoading;
  const [copied, setCopied] = useState(false);
  const ref = today();

  const rows = useMemo(
    () => sortRows(buildTeamRows(players, sessionsByPlayer, ref), 'name'),
    [players, sessionsByPlayer, ref],
  );

  async function copyCode() {
    if (!team) return;
    try {
      await navigator.clipboard.writeText(team.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  if (!team) {
    return (
      <>
        <Header title="Effectif" />
        <Main>
          <div style={{ paddingTop: 24 }}>
            <Card>
              <EmptyState title="Aucune équipe">Créé ton équipe depuis ton profil.</EmptyState>
            </Card>
          </div>
        </Main>
      </>
    );
  }

  return (
    <>
      <Header title="Effectif" subtitle={`${plural(rows.length, 'joueur')} · ${team.name}`} />
      <Main>
        <Section title="Code d’invitation">
          <Card hint="Tes joueurs saisissent ce code à l’inscription pour rejoindre l’équipe.">
            <div className="row row--between">
              <span
                style={{
                  fontSize: 26,
                  fontWeight: 680,
                  letterSpacing: '0.14em',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}
              >
                {team.inviteCode}
              </span>
              <button className="btn btn--ghost btn--sm" onClick={copyCode}>
                {copied ? 'Copié ✓' : 'Copier'}
              </button>
            </div>
          </Card>
        </Section>

        {playersError && (
          <div className="alert alert--error" role="alert">{playersError}</div>
        )}

        <Section title="Joueurs">
          <Card flush>
            {loading ? (
              <Loading />
            ) : rows.length === 0 ? (
              <EmptyState title="Aucun joueur">
                Partage le code ci-dessus pour constituer ton effectif.
              </EmptyState>
            ) : (
              <div className="list">
                {rows.map((r) => {
                  const stale =
                    r.lastSessionDate === null || diffDays(ref, r.lastSessionDate) > 7;
                  return (
                    <Link key={r.player.id} className="list__row" to={`/coach/joueur/${r.player.id}`}>
                      <Avatar user={r.player} />
                      <div className="list__body">
                        <div className="list__title">
                          {r.player.firstName} {r.player.lastName}
                        </div>
                        <div className="list__sub">
                          {r.player.position ?? 'Poste non renseigné'} ·{' '}
                          {r.lastSessionDate
                            ? `saisie ${compactRelative(r.lastSessionDate, ref)}`
                            : 'aucune saisie'}
                        </div>
                      </div>
                      {stale ? (
                        <StatusBadge status="warning" icon="!">
                          À relancer
                        </StatusBadge>
                      ) : (
                        <span className="list__value">{formatLoad(r.metrics.acute)} UA</span>
                      )}
                      <IconChevron className="list__chevron" />
                    </Link>
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
