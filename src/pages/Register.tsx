import { useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Header, Main } from '../components/Layout';
import { readInviteCode } from '../components/invitations';
import { useAuth } from '../lib/auth';
import type { Role } from '../lib/types';
import { checkEmail, checkPassword } from '../lib/validation';

export function Register() {
  const { register } = useAuth();
  // Le lien d'invitation porte le code dans l'URL. Arriver par ce lien, c'est
  // etre attendu dans un effectif : le formulaire s'ouvre donc cote joueur,
  // avec le code deja rempli, et non sur le choix joueur/coach.
  const invited = readInviteCode(useLocation().search);
  const [role, setRole] = useState<Role>('player');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    position: '',
    teamName: '',
    inviteCode: invited,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Un champ ne signale son erreur qu'une fois quitte (ou apres une tentative
  // d'envoi) : on ne veut pas crier "invalide" des la premiere lettre tapee.
  const [touched, setTouched] = useState({ email: false, password: false });
  // Acceptation des CGU et de la politique de confidentialité. Exigée avant la
  // création du compte : les données saisies ensuite (ressenti d'effort
  // nominatif, visible par le coach) demandent une information préalable.
  const [accepted, setAccepted] = useState(false);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const touch = (key: keyof typeof touched) => () =>
    setTouched((t) => ({ ...t, [key]: true }));

  const emailCheck = useMemo(() => checkEmail(form.email), [form.email]);
  const passwordCheck = useMemo(
    () =>
      checkPassword(form.password, {
        email: form.email,
        firstName: form.firstName,
        lastName: form.lastName,
      }),
    [form.password, form.email, form.firstName, form.lastName],
  );

  const showEmailError = touched.email && !emailCheck.valid;
  const showPasswordError = touched.password && !passwordCheck.valid;
  const canSubmit = emailCheck.valid && passwordCheck.valid && accepted && !busy;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (!emailCheck.valid || !passwordCheck.valid || !accepted) return;

    setError(null);
    setBusy(true);
    try {
      await register({ ...form, email: form.email.trim(), role });
      // La redirection est prise en charge par la garde <Guest> de App.tsx des
      // que la session est ouverte.
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
        <form className="stack" style={{ gap: 14, paddingTop: 12 }} onSubmit={submit} noValidate>
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
            <input
              id="email"
              className={`input${showEmailError ? ' input--invalid' : ''}`}
              type="email"
              inputMode="email"
              autoComplete="email"
              value={form.email}
              onChange={set('email')}
              onBlur={touch('email')}
              placeholder="prénom@club.fr"
              aria-invalid={showEmailError}
              aria-describedby={showEmailError ? 'email-error' : undefined}
              required
            />
            {showEmailError && (
              <span className="field__error" id="email-error" role="alert">
                {emailCheck.error}
              </span>
            )}
            {emailCheck.suggestion && (
              <button
                type="button"
                className="field__suggestion"
                onClick={() => setForm((f) => ({ ...f, email: emailCheck.suggestion as string }))}
              >
                Tu voulais dire <strong>{emailCheck.suggestion}</strong> ?
              </button>
            )}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="password">Mot de passe</label>
            <input
              id="password"
              className={`input${showPasswordError ? ' input--invalid' : ''}`}
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={set('password')}
              onBlur={touch('password')}
              aria-invalid={showPasswordError}
              aria-describedby="password-rules"
              required
            />

            {form.password && (
              <div className="pwstrength">
                <div className="pwstrength__bars" aria-hidden="true">
                  {[1, 2, 3, 4].map((i) => (
                    <span
                      key={i}
                      className="pwstrength__bar"
                      data-on={i <= passwordCheck.score ? passwordCheck.score : 0}
                    />
                  ))}
                </div>
                <span className="pwstrength__label" role="status">
                  Robustesse : {passwordCheck.strengthLabel}
                </span>
              </div>
            )}

            <ul className="pwrules" id="password-rules">
              {passwordCheck.rules.map((rule) => (
                <li key={rule.id} className="pwrules__item" data-met={rule.met}>
                  <span className="pwrules__mark" aria-hidden="true">{rule.met ? '✓' : '·'}</span>
                  {rule.label}
                </li>
              ))}
            </ul>

            {showPasswordError && passwordCheck.rules.every((r) => r.met) && (
              <span className="field__error" role="alert">{passwordCheck.error}</span>
            )}
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

          <div className="field">
            <label
              htmlFor="accept-legal"
              style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}
            >
              <input
                id="accept-legal"
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                style={{ width: 18, height: 18, marginTop: 2, flex: 'none', accentColor: 'var(--accent)' }}
                required
              />
              <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                J’accepte les <Link to="/cgu">conditions générales d’utilisation</Link> et j’ai pris
                connaissance de la{' '}
                <Link to="/confidentialite">politique de confidentialité</Link>. Je comprends que
                mes séances, ressenti d’effort et commentaires compris, sont visibles par le coach
                de mon équipe.
              </span>
            </label>
            <span className="field__hint">
              Si tu es mineur, cette inscription suppose l’accord de ton représentant légal.
            </span>
          </div>

          {error && <div className="alert alert--error" role="alert">{error}</div>}

          <button className="btn" type="submit" disabled={!canSubmit}>
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
