import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Header, Main } from '../components/Layout';
import { Avatar, Card, Section } from '../components/ui';
import {
  buildPersonalExport,
  buildTeamExport,
  downloadFile,
  exportFileName,
  sessionsToCsv,
} from '../components/dataExport';
import { useAuth } from '../lib/auth';
import * as db from '../lib/db';
import { useTheme, type ThemePref } from '../lib/theme';

const THEMES: { key: ThemePref; label: string }[] = [
  { key: 'system', label: 'Système' },
  { key: 'light', label: 'Clair' },
  { key: 'dark', label: 'Sombre' },
];

export function Profile() {
  const { user, team, logout, updateProfile, joinTeam, createOwnTeam, deleteAccount } = useAuth();
  const { pref, setPref } = useTheme();
  const [form, setForm] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    position: user?.position ?? '',
  });
  const [code, setCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Suppression : fermee par defaut, et jamais declenchee par le premier clic.
  const [deleting, setDeleting] = useState(false);
  const [teamAck, setTeamAck] = useState(false);
  const [impacted, setImpacted] = useState<number | null>(null);

  if (!user) return null;
  const coachWithTeam = user.role === 'coach' && team !== null;

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
      setMessage({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Enregistrement impossible.',
      });
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
      setMessage({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Création impossible.',
      });
    }
  }

  /**
   * Export personnel : tout ce que l'application sait de l'utilisateur, par
   * l'utilisateur lui-meme. C'est le droit d'acces et la portabilite promis
   * par la politique de confidentialite, sans passer par une demande par
   * e-mail et un aller-retour d'un mois.
   *
   * Les donnees sont lues sous RLS, comme n'importe quel ecran : l'export ne
   * peut donc pas restituer plus que ce que son auteur a le droit de voir.
   */
  async function exportMine() {
    if (!user) return;
    setBusy('mine');
    setMessage(null);
    try {
      const sessions = await db.getSessionsByUser(user.id);
      const at = new Date().toISOString();
      const payload = buildPersonalExport({ user, team, sessions, generatedAt: at });
      const base = `rpe-${user.lastName || 'export'}`;
      downloadFile(
        exportFileName(base, at, 'json'),
        'application/json;charset=utf-8',
        JSON.stringify(payload, null, 2),
      );
      downloadFile(
        exportFileName(base, at, 'csv'),
        'text/csv;charset=utf-8',
        sessionsToCsv(sessions, new Map([[user.id, user]])),
      );
      setMessage({ kind: 'success', text: 'Export téléchargé (JSON et CSV).' });
    } catch (err) {
      setMessage({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Export impossible.',
      });
    } finally {
      setBusy(null);
    }
  }

  /** Réversibilité promise au club par l'article 10 des CGV. */
  async function exportTeam() {
    if (!user || !team) return;
    setBusy('team');
    setMessage(null);
    try {
      const players = await db.getTeamPlayers(team.id);
      const sessionsByPlayer = await db.getSessionsByTeam(team.id);
      const at = new Date().toISOString();
      const payload = buildTeamExport({
        team,
        coach: user,
        players,
        sessionsByPlayer,
        generatedAt: at,
      });
      const flat = players.flatMap((pl) => sessionsByPlayer.get(pl.id) ?? []);
      downloadFile(
        exportFileName(team.name, at, 'json'),
        'application/json;charset=utf-8',
        JSON.stringify(payload, null, 2),
      );
      downloadFile(
        exportFileName(team.name, at, 'csv'),
        'text/csv;charset=utf-8',
        sessionsToCsv(flat, new Map(players.map((pl) => [pl.id, pl]))),
      );
      setMessage({ kind: 'success', text: 'Export de l’équipe téléchargé (JSON et CSV).' });
    } catch (err) {
      setMessage({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Export impossible.',
      });
    } finally {
      setBusy(null);
    }
  }

  /**
   * L'effectif n'est compté qu'au moment d'ouvrir la confirmation :
   * « 14 joueurs seront détachés » est la seule formulation qui rende la
   * conséquence tangible, mais la charger à chaque affichage du profil serait
   * une requête pour rien.
   */
  async function openDelete() {
    setDeleting(true);
    setTeamAck(false);
    setImpacted(null);
    if (coachWithTeam && team) {
      try {
        setImpacted((await db.getTeamPlayers(team.id)).length);
      } catch {
        // Le panneau s'affiche sans le nombre : mieux vaut une confirmation un
        // peu plus vague qu'un ecran bloque.
      }
    }
  }

  async function confirmDelete() {
    setBusy('delete');
    setMessage(null);
    try {
      await deleteAccount(coachWithTeam);
      // Session fermée par `deleteAccount` : la redirection vers /login est
      // prise en charge par la garde <Protected> de App.tsx.
    } catch (err) {
      setMessage({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Suppression impossible.',
      });
      setBusy(null);
    }
  }

  return (
    <>
      <Header title="Profil" />
      {/* Profil : des champs de saisie et du texte. Rien n'y gagne a etre etire
          sur toute la largeur d'un portable, meme cote coach. */}
      <Main narrow>
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
          <div
            className={`alert alert--${message.kind === 'success' ? 'success' : 'error'}`}
            style={{ marginTop: 14 }}
            role="status"
          >
            {message.text}
          </div>
        )}

        <Section title="Mes informations">
          <Card>
            <form className="stack" onSubmit={saveProfile}>
              <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                <div className="field" style={{ flex: 1 }}>
                  <label className="field__label" htmlFor="p-first">
                    Prénom
                  </label>
                  <input
                    id="p-first"
                    className="input"
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label className="field__label" htmlFor="p-last">
                    Nom
                  </label>
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
                  <label className="field__label" htmlFor="p-pos">
                    Poste
                  </label>
                  <input
                    id="p-pos"
                    className="input"
                    value={form.position}
                    onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                    placeholder="Ailier, meneur..."
                  />
                </div>
              )}
              <button className="btn btn--ghost" type="submit">
                Enregistrer
              </button>
            </form>
          </Card>
        </Section>

        <Section title="Équipe">
          <Card>
            {team ? (
              <div className="stack">
                <div className="row row--between">
                  <span style={{ fontSize: 14, fontWeight: 620 }}>{team.name}</span>
                  {user.role === 'coach' && (
                    <span className="tag">
                      {team.inviteCode ? `Code ${team.inviteCode}` : 'Invitation révoquée'}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {user.role === 'coach' ? (
                    <>
                      Tes joueurs rejoignent l’équipe avec ce code ou le lien d’invitation, que tu
                      régénères depuis l’<Link to="/coach/effectif">effectif</Link>.
                    </>
                  ) : (
                    'Ton coach voit la charge que tu déclares, pas tes commentaires privés.'
                  )}
                </p>
              </div>
            ) : user.role === 'coach' ? (
              <form className="stack" onSubmit={submitTeam}>
                <div className="field">
                  <label className="field__label" htmlFor="t-name">
                    Nom de l’équipe
                  </label>
                  <input
                    id="t-name"
                    className="input"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                  />
                </div>
                <button className="btn btn--ghost" type="submit">
                  Créer l’équipe
                </button>
              </form>
            ) : (
              <form className="stack" onSubmit={submitCode}>
                <div className="field">
                  <label className="field__label" htmlFor="t-code">
                    Code d’équipe
                  </label>
                  <input
                    id="t-code"
                    className="input"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="RIV2026"
                    autoCapitalize="characters"
                  />
                </div>
                <button className="btn btn--ghost" type="submit">
                  Rejoindre
                </button>
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
            <dl
              style={{
                margin: 0,
                display: 'grid',
                gap: 10,
                fontSize: 13,
                color: 'var(--text-secondary)',
              }}
            >
              <div>
                <dt style={{ fontWeight: 640, color: 'var(--text-primary)' }}>
                  Charge d’une séance
                </dt>
                <dd style={{ margin: 0 }}>
                  RPE (échelle CR-10) x durée en minutes, en unités arbitraires (UA).
                </dd>
              </div>
              <div>
                <dt style={{ fontWeight: 640, color: 'var(--text-primary)' }}>
                  Charge aiguë / chronique
                </dt>
                <dd style={{ margin: 0 }}>
                  Charge des 7 derniers jours, rapportée à la moyenne hebdomadaire des 28 derniers
                  jours. Zone de référence : 0,80 à 1,30.
                </dd>
              </div>
              <div>
                <dt style={{ fontWeight: 640, color: 'var(--text-primary)' }}>
                  Monotonie et contrainte
                </dt>
                <dd style={{ margin: 0 }}>
                  Monotonie = moyenne / écart-type des charges quotidiennes sur 7 jours (jours de
                  repos inclus). Contrainte = charge hebdomadaire x monotonie.
                </dd>
              </div>
            </dl>
            <p style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
              Indicateurs d’aide au pilotage de l’entraînement : ils ne remplacent pas un avis
              médical.
            </p>
          </Card>
        </Section>

        <Section title="Mes données">
          <Card hint="Profil, séances et commentaires compris, dans un format réutilisable (JSON) et un tableau (CSV).">
            <div className="stack">
              <button
                className="btn btn--ghost"
                disabled={busy !== null}
                onClick={() => void exportMine()}
              >
                {busy === 'mine' ? 'Préparation…' : 'Exporter mes données'}
              </button>
              {coachWithTeam && (
                <>
                  <button
                    className="btn btn--ghost"
                    disabled={busy !== null}
                    onClick={() => void exportTeam()}
                  >
                    {busy === 'team' ? 'Préparation…' : 'Exporter les données de l’équipe'}
                  </button>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    L’export d’équipe contient les séances nominatives de ton effectif. Conserve-le
                    avec le même soin que l’application.
                  </p>
                </>
              )}
            </div>
          </Card>
        </Section>

        <Section title="Compte">
          <div className="stack">
            <button className="btn btn--ghost" onClick={() => void logout()}>
              Se déconnecter
            </button>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
              Tes séances sont enregistrées sur ton compte : tu les retrouves depuis n’importe quel
              appareil.
            </p>
          </div>
        </Section>

        <Section title="Supprimer mon compte">
          <Card>
            {!deleting ? (
              <div className="stack">
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Ton compte, ton profil et toutes tes séances sont effacés définitivement. Pense à
                  exporter tes données avant.
                </p>
                <button className="btn btn--ghost" onClick={() => void openDelete()}>
                  Supprimer mon compte
                </button>
              </div>
            ) : (
              <div className="stack">
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Cette action est <strong>irréversible</strong> : profil, séances et commentaires
                  sont supprimés, sans sauvegarde de notre côté.
                </p>
                {coachWithTeam && team && (
                  <>
                    <div className="alert alert--error" role="alert">
                      Supprimer ton compte supprime aussi l’équipe « {team.name} », son lien
                      d’invitation et ses modèles de charge.{' '}
                      {impacted === null
                        ? 'Les joueurs rattachés'
                        : `${impacted} joueur${impacted > 1 ? 's' : ''} rattaché${impacted > 1 ? 's' : ''}`}{' '}
                      gardent leur compte et leurs séances, mais se retrouvent sans équipe — et tu
                      perds l’accès à leur suivi.
                    </div>
                    <label
                      style={{
                        display: 'flex',
                        gap: 10,
                        alignItems: 'flex-start',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={teamAck}
                        onChange={(e) => setTeamAck(e.target.checked)}
                        style={{
                          width: 18,
                          height: 18,
                          marginTop: 2,
                          flex: 'none',
                          accentColor: 'var(--accent)',
                        }}
                      />
                      <span
                        style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)' }}
                      >
                        Je comprends que l’équipe sera supprimée et ses joueurs détachés.
                      </span>
                    </label>
                  </>
                )}
                <div className="row" style={{ gap: 10 }}>
                  <button
                    className="btn"
                    disabled={busy !== null || (coachWithTeam && !teamAck)}
                    onClick={() => void confirmDelete()}
                  >
                    {busy === 'delete' ? 'Suppression…' : 'Supprimer définitivement'}
                  </button>
                  <button
                    className="btn btn--ghost"
                    disabled={busy !== null}
                    onClick={() => setDeleting(false)}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </Card>
        </Section>
      </Main>
    </>
  );
}
