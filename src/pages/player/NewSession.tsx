import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Header, Main } from '../../components/Layout';
import { Card, Section, rpeVars } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { addDays, today } from '../../lib/date';
import * as db from '../../lib/db';
import { usePlayerSessions } from '../../lib/hooks';
import { RPE_SCALE, SESSION_TYPES, type SessionType } from '../../lib/types';

const DURATION_PRESETS = [30, 45, 60, 75, 90, 120];

export function NewSession() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('id');
  const sessions = usePlayerSessions(user?.id);
  const editing = useMemo(() => sessions.find((s) => s.id === editId), [sessions, editId]);

  const [date, setDate] = useState(editing?.date ?? today());
  const [type, setType] = useState<SessionType>(editing?.type ?? 'entrainement');
  const [duration, setDuration] = useState(editing?.durationMin ?? 90);
  const [rpe, setRpe] = useState<number | null>(editing?.rpe ?? null);
  const [comment, setComment] = useState(editing?.comment ?? '');
  const [error, setError] = useState<string | null>(null);

  const load = rpe === null ? null : rpe * duration;
  const rpeLabel = rpe === null ? null : RPE_SCALE.find((r) => r.value === rpe)?.label;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (rpe === null) {
      setError('Choisis ton niveau de difficulté ressentie (RPE).');
      return;
    }
    if (duration < 5) {
      setError('La durée doit etre d’au moins 5 minutes.');
      return;
    }

    const payload = {
      userId: user.id,
      date,
      type,
      durationMin: duration,
      rpe,
      comment: comment.trim() || undefined,
    };

    if (editing) db.updateSession(editing.id, payload);
    else db.addSession(payload);

    refresh();
    navigate('/', { replace: true });
  }

  return (
    <>
      <Header title={editing ? 'Modifier la séance' : 'Nouvelle séance'} back={Boolean(editing)} />
      <Main>
        <form onSubmit={submit} style={{ paddingTop: 14 }}>
          <Section title="Quand">
            <div className="segmented" role="group" aria-label="Date de la séance">
              {[
                { label: "Aujourd’hui", value: today() },
                { label: 'Hier', value: addDays(today(), -1) },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className="segmented__btn"
                  aria-pressed={date === opt.value}
                  onClick={() => setDate(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <input
              className="input"
              style={{ marginTop: 8 }}
              type="date"
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Autre date"
            />
          </Section>

          <Section title="Type de séance">
            <div className="chips">
              {SESSION_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className="chip"
                  aria-pressed={type === t.value}
                  onClick={() => setType(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Durée">
            <Card>
              <div className="stepper">
                <button
                  type="button"
                  className="stepper__btn"
                  onClick={() => setDuration((d) => Math.max(5, d - 5))}
                  aria-label="Retirer 5 minutes"
                >
                  −
                </button>
                <div className="stepper__value" aria-live="polite">
                  {duration}
                  <small>min</small>
                </div>
                <button
                  type="button"
                  className="stepper__btn"
                  onClick={() => setDuration((d) => Math.min(300, d + 5))}
                  aria-label="Ajouter 5 minutes"
                >
                  +
                </button>
              </div>
              <div className="chips" style={{ marginTop: 12 }}>
                {DURATION_PRESETS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className="chip"
                    aria-pressed={duration === d}
                    onClick={() => setDuration(d)}
                  >
                    {d} min
                  </button>
                ))}
              </div>
            </Card>
          </Section>

          <Section title="Difficulté ressentie (RPE)">
            <Card hint="Échelle CR-10 de Borg : à remplir 30 min après la fin de la séance.">
              <div className="rpe-scale" role="group" aria-label="Note RPE de 1 a 10">
                {RPE_SCALE.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    className="rpe-btn"
                    style={rpeVars(r.value)}
                    aria-pressed={rpe === r.value}
                    aria-label={`${r.value} — ${r.label}`}
                    onClick={() => {
                      setRpe(r.value);
                      setError(null);
                    }}
                  >
                    {r.value}
                    <span className="rpe-btn__bar" aria-hidden="true" />
                  </button>
                ))}
              </div>
              <p
                style={{ marginTop: 12, fontSize: 13.5, color: 'var(--text-secondary)', minHeight: 20 }}
                aria-live="polite"
              >
                {rpeLabel ? (
                  <>
                    <strong style={{ fontWeight: 660 }}>{rpe}</strong> — {rpeLabel}
                  </>
                ) : (
                  'Touche une valeur pour decrire l’intensité ressentie.'
                )}
              </p>
            </Card>
          </Section>

          <Section title="Commentaire (optionnel)">
            <textarea
              className="input"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Sensations, douleurs, contenu de la séance..."
              maxLength={280}
            />
          </Section>

          <Section title="Charge calculée">
            <Card>
              <div className="row row--between">
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {rpe ?? '—'} (RPE) × {duration} min
                </span>
                <span style={{ fontSize: 22, fontWeight: 660, letterSpacing: '-0.02em' }}>
                  {load === null ? '—' : `${load} UA`}
                </span>
              </div>
            </Card>
          </Section>

          {error && (
            <div className="alert alert--error" style={{ marginTop: 14 }} role="alert">
              {error}
            </div>
          )}

          <div className="stack" style={{ marginTop: 18 }}>
            <button className="btn" type="submit">
              {editing ? 'Enregistrer les modifications' : 'Enregistrer la séance'}
            </button>
            {editing && (
              <button type="button" className="btn btn--quiet" onClick={() => navigate(-1)}>
                Annuler
              </button>
            )}
          </div>
        </form>
      </Main>
    </>
  );
}
