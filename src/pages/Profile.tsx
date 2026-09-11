import { useState, type FormEvent } from 'react';
import { Header, Main } from '../components/Layout';
import { Avatar, Card, Section } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useTheme, type ThemePref } from '../lib/theme';

const THEMES: { key: ThemePref; label: string }[] = [
  { key: 'system', label: 'Système' },
  { key: 'light', label: 'Clair' },
  { key: 'dark', label: 'Sombre' },
];

export function Profile() {
  const { user, team, logout, updateProfile, joinTeam, createOwnTeam } = useAuth();
  const { pref, setPref } = useTheme();
  const [form, setForm] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    position: user?.position ?? '',
  });
  const [code, setCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  if (!user) return null;

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    try {
      await updateProfile({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        position: form.position.trim() || undefined,
      });
      setMessage({ kind: 'success', text: 'Profil mis à jour.' });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Enregistrement impossible.' });
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    try {
      await joinTeam(code);
      setCode('');
      setMessage({ kind: 'success', text: 'Équipe rejointe.' });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Code invalide.' });
    }
  }

  async function submitTeam(e: FormEvent) {
    e.preventDefault();
    try {
      const created = await createOwnTeam(teamName);
      setTeamName('');
      setMessage({ kind: 'success', text: `Équipe « ${created.name} » créée.` });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Création impossible.' });
    }
  }

  return (
    <>
      <Header title="Profil" />
      <Main>
        <div className="row" style={{ paddingTop: 18, gap: 14 }}>
          <Avatar user={user} large />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 660, letterSpacing: '-0.02em' }}>
              {user.firstName} {user.lastName}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {user.role === 'coach' ? 'Coach' : 'Joueur'}
              {team ? ` · ${team.name}` : ' · sans équipe'}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{user.email}</div>
          </div>
        </div>

        {message && (
          <div className={`alert alert--${message.kind === 'success' ? 'success' : 'error'}`} style={{ marginTop: 14 }} role="status">
            {message.text}
          </div>
        )}

        <Section title="Mes informations">
          <Card>
            <form className="stack" onSubmit={saveProfile}>
              <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                <div className="field" style={{ flex: 1 }}>
                  <label className="field__label" htmlFor="p-first">Prénom</label>
                  <input
                    id="p-first"
                    className="input"
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label className="field__label" htmlFor="p-last">Nom</label>
                  <input
                    id="p-last"
                    className="input"
                    value={form.lastName}
                    onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  />
                </div>
              </div>
              {user.role === 'player' && (
                <div className="field">
                  <label className="field__label" htmlFor="p-pos">Poste</label>
                  <input
                    id="p-pos"
                    className="input"
                    value={form.position}
                    onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                    placeholder="Ailier, meneur..."
                  />
                </div>
              )}
              <button className="btn btn--ghost" type="submit">Enregistrer</button>
            </form>
          </Card>
        </Section>

        <Section title="Équipe">
          <Card>
            {team ? (
              <div className="stack">
                <div className="row row--between">
                  <span style={{ fontSize: 14, fontWeight: 620 }}>{team.name}</span>
                  {user.role === 'coach' && <span className="tag">Code {team.inviteCode}</span>}
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {user.role === 'coach'
                    ? 'Tes joueurs rejoignent l’équipe avec ce code à l’inscription.'
                    : 'Ton coach voit la charge que tu déclares, pas tes commentaires privés.'}
                </p>
              </div>
            ) : user.role === 'coach' ? (
              <form className="stack" onSubmit={submitTeam}>
                <div className="field">
                  <label className="field__label" htmlFor="t-name">Nom de l’équipe</label>
                  <input id="t-name" className="input" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
                </div>
                <button className="btn btn--ghost" type="submit">Créer l’équipe</button>
              </form>
            ) : (
              <form className="stack" onSubmit={submitCode}>
                <div className="field">
                  <label className="field__label" htmlFor="t-code">Code d’équipe</label>
                  <input
                    id="t-code"
                    className="input"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="RIV2026"
                    autoCapitalize="characters"
                  />
                </div>
                <button className="btn btn--ghost" type="submit">Rejoindre</button>
              </form>
            )}
          </Card>
        </Section>

        <Section title="Apparence">
          <div className="segmented" role="group" aria-label="Theme de l’application">
            {THEMES.map((t) => (
              <button
                key={t.key}
                type="button"
                className="segmented__btn"
                aria-pressed={pref === t.key}
                onClick={() => setPref(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Comment sont calculées les métriques">
          <Card>
            <dl style={{ margin: 0, display: 'grid', gap: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
              <div>
                <dt style={{ fontWeight: 640, color: 'var(--text-primary)' }}>Charge d’une séance</dt>
                <dd style={{ margin: 0 }}>RPE (échelle CR-10) x durée en minutes, en unités arbitraires (UA).</dd>
              </div>
              <div>
                <dt style={{ fontWeight: 640, color: 'var(--text-primary)' }}>Charge aiguë / chronique</dt>
                <dd style={{ margin: 0 }}>
                  Charge des 7 derniers jours, rapportée à la moyenne hebdomadaire des 28 derniers
                  jours. Zone de référence : 0,80 à 1,30.
                </dd>
              </div>
              <div>
                <dt style={{ fontWeight: 640, color: 'var(--text-primary)' }}>Monotonie et contrainte</dt>
                <dd style={{ margin: 0 }}>
                  Monotonie = moyenne / écart-type des charges quotidiennes sur 7 jours (jours de
                  repos inclus). Contrainte = charge hebdomadaire x monotonie.
                </dd>
              </div>
            </dl>
            <p style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
              Indicateurs d’aide au pilotage de l’entraînement : ils ne remplacent pas un avis médical.
            </p>
          </Card>
        </Section>

        <Section title="Compte">
          <div className="stack">
            <button className="btn btn--ghost" onClick={() => void logout()}>Se déconnecter</button>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
              Tes séances sont enregistrées sur ton compte : tu les retrouves depuis
              n’importe quel appareil.
            </p>
          </div>
        </Section>
      </Main>
    </>
  );
}
