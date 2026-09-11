import { Link } from 'react-router-dom';
import { Header, Main } from '../../components/Layout';
import { LoadDashboard } from '../../components/LoadDashboard';
import { Avatar, Card, EmptyState, Loading, Section, rpeVars } from '../../components/ui';
import { IconChevron } from '../../components/icons';
import { longDate, relativeDate, today } from '../../lib/date';
import { useAuth } from '../../lib/auth';
import { usePlayerSessions } from '../../lib/hooks';
import { sessionLoad } from '../../lib/metrics';
import { SESSION_TYPES } from '../../lib/types';

export function PlayerDashboard() {
  const { user, team } = useAuth();
  const { data: sessions, loading, error } = usePlayerSessions(user?.id);
  const recent = sessions.slice(0, 3);

  if (!user) return null;

  return (
    <>
      <Header
        title={`Salut ${user.firstName}`}
        subtitle={longDate(today())}
        right={
          <Link to="/profil" aria-label="Mon profil">
            <Avatar user={user} />
          </Link>
        }
      />
      <Main>
        <div style={{ paddingTop: 14 }}>
          {error ? (
            <div className="alert alert--error" role="alert">{error}</div>
          ) : loading ? (
            <Loading label="Chargement de ta charge…" />
          ) : (
            <LoadDashboard sessions={sessions} referenceDate={today()} />
          )}
        </div>

        <Section
          title="Dernières séances"
          action={
            recent.length > 0 ? (
              <Link className="section__action" to="/historique">
                Tout voir
              </Link>
            ) : undefined
          }
        >
          <Card flush>
            {loading ? (
              <Loading />
            ) : recent.length === 0 ? (
              <EmptyState title="Rien de saisi pour l’instant">
                Enregistre ta première séance après l’entraînement.
              </EmptyState>
            ) : (
              <div className="list">
                {recent.map((s) => {
                  const type = SESSION_TYPES.find((t) => t.value === s.type);
                  return (
                    <Link key={s.id} className="list__row" to="/historique">
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
                          {relativeDate(s.date)} · {s.durationMin} min
                        </div>
                      </div>
                      <span className="list__value">{sessionLoad(s)} UA</span>
                      <IconChevron className="list__chevron" />
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>
        </Section>

        <Section title="Saisie du jour">
          <Link className="btn" to="/saisie">
            + Enregistrer une séance
          </Link>
          {!team && (
            <p style={{ marginTop: 10, fontSize: 12.5, color: 'var(--text-muted)' }}>
              Tu n’es rattaché a aucune équipe. Ajoute ton code d’équipe depuis le profil pour que
              ton coach suive ta charge.
            </p>
          )}
        </Section>
      </Main>
    </>
  );
}
