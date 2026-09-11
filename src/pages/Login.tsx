import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Main } from '../components/Layout';
import { useAuth } from '../lib/auth';

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Main noNav>
      <div style={{ paddingTop: 48 }}>
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              background: 'var(--text-primary)',
              display: 'grid',
              placeItems: 'center',
              marginBottom: 14,
            }}
          >
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 17l4-6 4 3 4-8 4 5" />
            </svg>
          </div>
          <h1 style={{ fontSize: 27, fontWeight: 680, letterSpacing: '-0.03em', lineHeight: 1.15 }}>
            RPE Tracker
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 6, fontSize: 14.5 }}>
            Suis ta charge d’entraînement séance après séance.
          </p>
        </div>

        <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
          <div className="field">
            <label className="field__label" htmlFor="email">E-mail</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prénom@club.fr"
              required
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="password">Mot de passe</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <div className="alert alert--error" role="alert">{error}</div>}

          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 18, fontSize: 14, color: 'var(--text-secondary)' }}>
          Pas encore de compte ? <Link to="/inscription">Créer un compte</Link>
        </p>

      </div>
    </Main>
  );
}
