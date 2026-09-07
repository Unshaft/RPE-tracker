import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header, Main } from '../../components/Layout';
import { Card, EmptyState, Section, rpeVars } from '../../components/ui';
import { formatLoad, plural } from '../../components/charts/chartUtils';
import { useAuth } from '../../lib/auth';
import { longDate, startOfWeek, weekLabel } from '../../lib/date';
import * as db from '../../lib/db';
import { usePlayerSessions } from '../../lib/hooks';
import { sessionLoad } from '../../lib/metrics';
import { SESSION_TYPES, type TrainingSession } from '../../lib/types';

function groupByWeek(sessions: TrainingSession[]) {
  const groups = new Map<string, TrainingSession[]>();
  for (const s of sessions) {
    const key = startOfWeek(s.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

export function History() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const sessions = usePlayerSessions(user?.id);
  const [openId, setOpenId] = useState<string | null>(null);
  const weeks = useMemo(() => groupByWeek(sessions), [sessions]);

  function remove(id: string) {
    if (!confirm('Supprimer définitivement cette séance ?')) return;
    db.deleteSession(id);
    setOpenId(null);
    refresh();
  }

  return (
    <>
      <Header title="Historique" subtitle={`${plural(sessions.length, 'séance enregistrée', 'séances enregistrées')}`} />
      <Main>
        {weeks.length === 0 ? (
          <div style={{ paddingTop: 24 }}>
            <Card>
              <EmptyState title="Historique vide">
                Chaque séance enregistrée apparaîtra ici, regroupée par semaine.
              </EmptyState>
            </Card>
          </div>
        ) : (
          weeks.map(([monday, weekSessions]) => {
            const total = weekSessions.reduce((a, s) => a + sessionLoad(s), 0);
                        return (
              <Section
                key={monday}
                title={weekLabel(monday)}
                action={
                  <span className="section__meta">
                    {formatLoad(total)} UA · {plural(weekSessions.length, 'séance')}
                  </span>
                }
              >
                <Card flush>
                  <div className="list">
                    {weekSessions.map((s) => {
                      const type = SESSION_TYPES.find((t) => t.value === s.type);
                      const open = openId === s.id;
                      return (
                        <div key={s.id}>
                          <button
                            className="list__row"
                            onClick={() => setOpenId(open ? null : s.id)}
                            aria-expanded={open}
                          >
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
                              </div>
                            </div>
                            <span className="list__value">{sessionLoad(s)} UA</span>
                          </button>
                          {open && (
                            <div style={{ padding: '0 14px 14px', display: 'grid', gap: 10 }}>
                              {s.comment && (
                                <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                  « {s.comment} »
                                </p>
                              )}
                              <div className="row" style={{ gap: 8 }}>
                                <button
                                  className="btn btn--ghost btn--sm"
                                  style={{ flex: 1 }}
                                  onClick={() => navigate(`/saisie?id=${s.id}`)}
                                >
                                  Modifier
                                </button>
                                <button
                                  className="btn btn--danger btn--sm"
                                  style={{ flex: 1 }}
                                  onClick={() => remove(s.id)}
                                >
                                  Supprimer
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </Section>
            );
          })
        )}
      </Main>
    </>
  );
}
