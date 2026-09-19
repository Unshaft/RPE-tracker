import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Header, Main } from '../../components/Layout';
import { Card, Loading, Section, rpeVars } from '../../components/ui';
import { useLoadModels } from '../../components/loadContext';
import { useAuth } from '../../lib/auth';
import { addDays, today } from '../../lib/date';
import * as db from '../../lib/db';
import { usePlayerSessions } from '../../lib/hooks';
import { DOMAIN_LABEL, modelInputKeys } from '../../components/loadModelInfo';
import { applyLoadModel, domainForType, resolveLoadModel } from '../../lib/loadModels';
import {
  RPE_SCALE,
  SESSION_TYPES,
  type SessionExercise,
  type SessionInputs,
  type SessionType,
} from '../../lib/types';

const DURATION_PRESETS = [30, 45, 60, 75, 90, 120];

/** Ligne d'exercice en cours de saisie : des chaînes, pour rester effaçable. */
interface ExerciseDraft {
  sets: string;
  reps: string;
  weightKg: string;
}

const EMPTY_EXERCISE: ExerciseDraft = { sets: '3', reps: '10', weightKg: '' };

/**
 * Ne retient que les lignes complètes et cohérentes.
 *
 * Une ligne à moitié remplie n'est jamais une erreur bloquante : le risque
 * numéro un du produit est l'abandon de saisie, et refuser l'envoi pour un
 * champ de tonnage optionnel ferait perdre le RPE et la durée, qui eux sont
 * la donnée réellement irremplaçable.
 */
function usableExercises(rows: ExerciseDraft[]): SessionExercise[] {
  return rows.flatMap((r) => {
    const sets = Number(r.sets);
    const reps = Number(r.reps);
    const weightKg = Number(r.weightKg);
    const filled = r.sets.trim() && r.reps.trim() && r.weightKg.trim();
    if (!filled || !Number.isFinite(sets) || !Number.isFinite(reps) || !Number.isFinite(weightKg)) {
      return [];
    }
    if (sets < 1 || reps < 1 || weightKg < 0) return [];
    return [{ sets, reps, weightKg }];
  });
}

export function NewSession() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('id');
  const { data: sessions, loading } = usePlayerSessions(user?.id);
  const editing = useMemo(() => sessions.find((s) => s.id === editId), [sessions, editId]);
  const { ctx, catalog } = useLoadModels();

  const [date, setDate] = useState(editing?.date ?? today());
  const [type, setType] = useState<SessionType>(editing?.type ?? 'entrainement');
  const [duration, setDuration] = useState(editing?.durationMin ?? 90);
  const [rpe, setRpe] = useState<number | null>(editing?.rpe ?? null);
  const [breathing, setBreathing] = useState<number | null>(null);
  const [muscular, setMuscular] = useState<number | null>(null);
  const [exercises, setExercises] = useState<ExerciseDraft[]>([]);
  const [comment, setComment] = useState(editing?.comment ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * En édition, la séance n'est connue qu'une fois l'historique chargé : les
   * champs sont donc remplis après coup. On ne le fait qu'une seule fois, sinon
   * un rechargement de la liste écraserait la saisie en cours.
   */
  const prefilled = useRef(false);
  useEffect(() => {
    if (!editing || prefilled.current) return;
    prefilled.current = true;
    setDate(editing.date);
    setType(editing.type);
    setDuration(editing.durationMin);
    setRpe(editing.rpe);
    setBreathing(editing.inputs?.rpeBreathing ?? null);
    setMuscular(editing.inputs?.rpeMuscular ?? null);
    setExercises(
      (editing.inputs?.exercises ?? []).map((e) => ({
        sets: String(e.sets),
        reps: String(e.reps),
        weightKg: String(e.weightKg),
      })),
    );
    setComment(editing.comment ?? '');
  }, [editing]);

  /**
   * Le modèle est résolu au domaine ET à la date de la séance en cours de
   * saisie, pas à aujourd'hui : corriger une séance de la semaine dernière doit
   * rouvrir le formulaire tel qu'il était cette semaine-là.
   */
  const model = resolveLoadModel(ctx, domainForType(type), date);
  // Les champs affichés viennent de l'`input_schema` du catalogue et non d'un
  // `switch` sur le code : ajouter un modèle au catalogue ne doit pas demander
  // de rouvrir cet écran.
  const keys = useMemo(
    () => new Set(modelInputKeys(catalog, model.modelCode)),
    [catalog, model.modelCode],
  );
  const differentiated = keys.has('rpe_breathing') && keys.has('rpe_muscular');
  const volumeLoad = keys.has('exercises');

  // Le RPE global reste enregistré quel que soit le modèle : la colonne est
  // `not null`, et surtout un club doit pouvoir changer d'avis sans que son
  // historique devienne inexploitable. En sRPE différencié il est dérivé des
  // deux notes, jamais ressaisi — une question de plus, c'est une saisie de
  // moins.
  const effectiveRpe = differentiated
    ? breathing !== null && muscular !== null
      ? Math.round((breathing + muscular) / 2)
      : null
    : rpe;

  const inputs = useMemo<SessionInputs | undefined>(() => {
    // On repart des entrées déjà enregistrées : corriger une vieille séance
    // alors que l'équipe a changé de modèle ne doit pas effacer des données
    // brutes que le formulaire courant ne sait plus afficher. Rien n'est
    // persisté en calcul, donc rien ne se reconstitue une fois perdu.
    const out: SessionInputs = { ...editing?.inputs };
    if (differentiated) {
      if (breathing !== null) out.rpeBreathing = breathing;
      else delete out.rpeBreathing;
      if (muscular !== null) out.rpeMuscular = muscular;
      else delete out.rpeMuscular;
    }
    if (volumeLoad) {
      const usable = usableExercises(exercises);
      if (usable.length > 0) out.exercises = usable;
      else delete out.exercises;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }, [editing, differentiated, volumeLoad, breathing, muscular, exercises]);

  const load =
    effectiveRpe === null
      ? null
      : applyLoadModel(model.modelCode, {
          rpe: effectiveRpe,
          durationMin: duration,
          type,
          date,
          inputs,
        });

  const rpeLabel =
    effectiveRpe === null ? null : RPE_SCALE.find((r) => r.value === effectiveRpe)?.label;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user || busy) return;
    if (differentiated && (breathing === null || muscular === null)) {
      setError('Donne les deux notes : souffle et jambes.');
      return;
    }
    if (effectiveRpe === null) {
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
      rpe: effectiveRpe,
      comment: comment.trim() || undefined,
      inputs,
    };

    setBusy(true);
    setError(null);
    try {
      if (editing) await db.updateSession(editing.id, payload);
      else await db.addSession(payload);
      refresh();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  }

  if (editId && loading) {
    return (
      <>
        <Header title="Modifier la séance" back />
        <Main>
          <div style={{ paddingTop: 24 }}>
            <Card><Loading /></Card>
          </div>
        </Main>
      </>
    );
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

          {differentiated ? (
            <Section title="Difficulté ressentie">
              <Card hint="Échelle CR-10 de Borg : à remplir 30 min après la fin de la séance.">
                <RpeScale
                  label="Souffle, cardio"
                  name="rpe-souffle"
                  value={breathing}
                  onChange={(v) => {
                    setBreathing(v);
                    setError(null);
                  }}
                />
                <div style={{ height: 14 }} />
                <RpeScale
                  label="Jambes, muscles"
                  name="rpe-muscles"
                  value={muscular}
                  onChange={(v) => {
                    setMuscular(v);
                    setError(null);
                  }}
                />
                <p
                  style={{ marginTop: 12, fontSize: 13, color: 'var(--text-secondary)', minHeight: 20 }}
                  aria-live="polite"
                >
                  {rpeLabel ? (
                    <>
                      Moyenne <strong style={{ fontWeight: 660 }}>{effectiveRpe}</strong> — {rpeLabel}
                    </>
                  ) : (
                    'Deux notes attendues : ton souffle et tes jambes.'
                  )}
                </p>
              </Card>
            </Section>
          ) : (
            <Section title="Difficulté ressentie (RPE)">
              <Card hint="Échelle CR-10 de Borg : à remplir 30 min après la fin de la séance.">
                <RpeScale
                  label="Note RPE de 1 a 10"
                  name="rpe"
                  hideLabel
                  value={rpe}
                  onChange={(v) => {
                    setRpe(v);
                    setError(null);
                  }}
                />
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
          )}

          {volumeLoad && (
            <ExerciseList rows={exercises} onChange={setExercises} />
          )}

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
                  {volumeLoad
                    ? `${usableExercises(exercises).length} exercice(s) × séries × reps × kg`
                    : `${effectiveRpe ?? '—'} (RPE) × ${duration} min`}
                </span>
                <span style={{ fontSize: 22, fontWeight: 660, letterSpacing: '-0.02em' }}>
                  {load === null ? '—' : `${Math.round(load)} UA`}
                </span>
              </div>
              {model.effectiveFrom && (
                <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                  Modèle {DOMAIN_LABEL[model.domain].toLowerCase()} choisi par ton équipe.
                </p>
              )}
              {volumeLoad && usableExercises(exercises).length === 0 && (
                <p style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text-muted)' }}>
                  Sans exercice détaillé, le tonnage vaut 0. Ta note et ta durée sont enregistrées
                  quand même : tu peux compléter plus tard depuis l’historique.
                </p>
              )}
            </Card>
          </Section>

          {error && (
            <div className="alert alert--error" style={{ marginTop: 14 }} role="alert">
              {error}
            </div>
          )}

          <div className="stack" style={{ marginTop: 18 }}>
            <button className="btn" type="submit" disabled={busy}>
              {busy
                ? 'Enregistrement...'
                : editing
                  ? 'Enregistrer les modifications'
                  : 'Enregistrer la séance'}
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

/** Rampe RPE 1-10, identique partout : une seule définition du geste. */
function RpeScale({
  label,
  name,
  value,
  onChange,
  hideLabel,
}: {
  label: string;
  name: string;
  value: number | null;
  onChange: (v: number) => void;
  hideLabel?: boolean;
}) {
  return (
    <div>
      {!hideLabel && (
        <div className="field__label" style={{ marginBottom: 6 }}>
          {label}
        </div>
      )}
      <div className="rpe-scale" role="group" aria-label={label}>
        {RPE_SCALE.map((r) => (
          <button
            key={r.value}
            type="button"
            className="rpe-btn"
            style={rpeVars(r.value)}
            aria-pressed={value === r.value}
            aria-label={`${name} : ${r.value} — ${r.label}`}
            onClick={() => onChange(r.value)}
          >
            {r.value}
            <span className="rpe-btn__bar" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Liste d'exercices du volume-load.
 *
 * Volontairement réduite à trois nombres par ligne, sans nom d'exercice ni
 * validation bloquante : la formule ne demande que séries, répétitions et
 * kilos, et chaque champ ajouté au-delà du strict nécessaire se paie en
 * saisies abandonnées. La liste démarre vide — le joueur pressé passe devant
 * sans jamais y toucher.
 */
function ExerciseList({
  rows,
  onChange,
}: {
  rows: ExerciseDraft[];
  onChange: (rows: ExerciseDraft[]) => void;
}) {
  function update(i: number, patch: Partial<ExerciseDraft>) {
    onChange(rows.map((r, j) => (i === j ? { ...r, ...patch } : r)));
  }

  return (
    <Section title="Exercices (tonnage)">
      <Card hint="Séries, répétitions et charge. Facultatif : tu peux enregistrer sans.">
        {rows.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
            Aucun exercice saisi.
          </p>
        ) : (
          <div className="stack" style={{ marginBottom: 10 }}>
            {rows.map((row, i) => (
              <div key={i} className="row" style={{ gap: 6, alignItems: 'center' }}>
                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={50}
                  value={row.sets}
                  onChange={(e) => update(i, { sets: e.target.value })}
                  aria-label={`Exercice ${i + 1} : séries`}
                  placeholder="séries"
                  style={{ textAlign: 'center' }}
                />
                <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>×</span>
                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={200}
                  value={row.reps}
                  onChange={(e) => update(i, { reps: e.target.value })}
                  aria-label={`Exercice ${i + 1} : répétitions`}
                  placeholder="reps"
                  style={{ textAlign: 'center' }}
                />
                <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>×</span>
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={500}
                  step={0.5}
                  value={row.weightKg}
                  onChange={(e) => update(i, { weightKg: e.target.value })}
                  aria-label={`Exercice ${i + 1} : charge en kilos`}
                  placeholder="kg"
                  style={{ textAlign: 'center' }}
                />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Retirer l’exercice ${i + 1}`}
                  onClick={() => onChange(rows.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => onChange([...rows, { ...EMPTY_EXERCISE }])}
        >
          + Ajouter un exercice
        </button>
      </Card>
    </Section>
  );
}
