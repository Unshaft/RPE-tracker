import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { formatLoad, plural } from '../../components/charts/chartUtils';
import { Header, Main } from '../../components/Layout';
import { Avatar, Card, EmptyState, Loading, Section, StatusBadge } from '../../components/ui';
import { InviteCard } from '../../components/InviteCard';
import { IconChevron } from '../../components/icons';
import { useLoadContext } from '../../components/loadContext';
import { useAuth } from '../../lib/auth';
import { compactRelative, diffDays, today } from '../../lib/date';
import { useTeamPlayers, useTeamSessions } from '../../lib/hooks';
import { buildTeamRows, sortRows } from '../../lib/team';

export function Roster() {
  const { team } = useAuth();
  const ctx = useLoadContext();
  const { data: players, loading: playersLoading, error: playersError } = useTeamPlayers(team?.id);
  const { data: sessionsByPlayer, loading: sessionsLoading } = useTeamSessions(team?.id);
  const loading = playersLoading || sessionsLoading;
  const ref = today();

  const rows = useMemo(
    () => sortRows(buildTeamRows(players, sessionsByPlayer, ref, ctx), 'name'),
    [players, sessionsByPlayer, ref, ctx],
  );

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
        <div className="roster-invite">
          <InviteCard />
        </div>

        {playersError && (
          <div className="alert alert--error" role="alert">
            {playersError}
          </div>
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
                {/* Repères de colonnes du tableau dense : purement visuels, et
                    donc masqués aux lecteurs d'écran — chaque ligne énonce déjà
                    « Ailier », « saisie il y a 3 j », l'annoncer deux fois
                    allongerait le parcours sans rien apprendre. */}
                <div className="roster__head" aria-hidden="true">
                  <span />
                  <span>Joueur</span>
                  <span>Poste</span>
                  <span>Dernière saisie</span>
                  <span>Charge 7 j</span>
                  <span />
                </div>
                {rows.map((r) => {
                  const stale = r.lastSessionDate === null || diffDays(ref, r.lastSessionDate) > 7;
                  return (
                    <Link
                      key={r.player.id}
                      className="roster__row"
                      to={`/coach/joueur/${r.player.id}`}
                    >
                      <span className="roster__avatar">
                        <Avatar user={r.player} />
                      </span>
                      <span className="roster__name">
                        {r.player.firstName} {r.player.lastName}
                      </span>
                      {/* Un seul jeu de balises pour les deux mises en page :
                          `display: contents` libère ces deux spans en colonnes
                          propres sur bureau, sans dupliquer ni masquer quoi que
                          ce soit. */}
                      <span className="roster__meta">
                        <span className="roster__position">
                          {r.player.position ?? 'Poste non renseigné'}
                        </span>
                        <span className="roster__last">
                          {r.lastSessionDate
                            ? `saisie ${compactRelative(r.lastSessionDate, ref)}`
                            : 'aucune saisie'}
                        </span>
                      </span>
                      <span className="roster__state">
                        {stale ? (
                          <StatusBadge status="warning" icon="!">
                            À relancer
                          </StatusBadge>
                        ) : (
                          <span className="list__value">{formatLoad(r.metrics.acute)} UA</span>
                        )}
                      </span>
                      <IconChevron className="roster__chevron" />
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
