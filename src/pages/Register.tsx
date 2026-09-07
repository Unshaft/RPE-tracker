import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Header, Main } from '../components/Layout';
import { useAuth } from '../lib/auth';
import type { Role } from '../lib/types';

export function Register() {
  const { register } = useAuth();
  const [role, setRole] = useState<Role>('player');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    position: '',
    teamName: '',
    inviteCode: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await register({ ...form, role });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inscription impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Header title="Créer un compte" back />
      <Main noNav>
        <form className="stack" style={{ gap: 14, paddingTop: 12 }} onSubmit={submit}>
          <div className="field">
            <span className="field__label">Je suis</span>
            <div className="segmented" role="group" aria-label="Type de compte">
              <button type="button" className="segmented__btn" aria-pressed={role === 'player'} onClick={() => setRole('player')}>
                Joueur
              </button>
              <button type="button" className="segmented__btn" aria-pressed={role === 'coach'} onClick={() => setRole('coach')}>
                Coach
              </button>
            </div>
          </div>

          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <div className="field" style={{ flex: 1 }}>
              <label className="field__label" htmlFor="firstName">Prénom</label>
              <input id="firstName" className="input" value={form.firstName} onChange={set('firstName')} required />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label className="field__label" htmlFor="lastName">Nom</label>
              <input id="lastName" className="input" value={form.lastName} onChange={set('lastName')} required />
            </div>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="email">E-mail</label>
            <input id="email" className="input" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={set('email')} required />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="password">Mot de passe</label>
            <input id="password" className="input" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} required />
            <span className="field__hint">6 caractères minimum.</span>
          </div>

          {role === 'player' ? (
            <>
              <div className="field">
                <label className="field__label" htmlFor="position">Poste (optionnel)</label>
                <input id="position" className="input" value={form.position} onChange={set('position')} placeholder="Ailier, meneur..." />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="inviteCode">Code équipe (optionnel)</label>
                <input
                  id="inviteCode"
                  className="input"
                  value={form.inviteCode}
                  onChange={(e) => setForm((f) => ({ ...f, inviteCode: e.target.value.toUpperCase() }))}
                  placeholder="RIV2026"
                  autoCapitalize="characters"
                />
                <span className="field__hint">
                  Fourni par ton coach. Tu pourras le renseigner plus tard depuis ton profil.
                </span>
              </div>
            </>
          ) : (
            <div className="field">
              <label className="field__label" htmlFor="teamName">Nom de l’équipe</label>
              <input id="teamName" className="input" value={form.teamName} onChange={set('teamName')} placeholder="AS Riviera - Seniors" required />
              <span className="field__hint">Un code d’invitation sera généré pour tes joueurs.</span>
            </div>
          )}

          {error && <div className="alert alert--error" role="alert">{error}</div>}

          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Création...' : 'Créer mon compte'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14, color: 'var(--text-secondary)' }}>
          Déjà inscrit ? <Link to="/login">Se connecter</Link>
        </p>
      </Main>
    </>
  );
}
