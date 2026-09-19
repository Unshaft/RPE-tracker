import { useState } from 'react';
import { Card, Section, StatusBadge } from './ui';
import { expiryFromDays, inviteLink, inviteState, inviteStateLabel } from './invitations';
import { useAuth } from '../lib/auth';

/**
 * Administration du jeton d'invitation, côté coach.
 *
 * Un seul secret, deux présentations : le code court pour la dictée au bord du
 * terrain, le lien pour le message d'équipe. Régénérer et révoquer agissent
 * donc sur le même objet — c'est ce que l'écran doit rendre évident, sans quoi
 * un coach croira avoir coupé un accès en n'en coupant qu'une moitié.
 */

/** Durées proposées. `null` = sans expiration, cas de loin le plus courant. */
const DUREES: { label: string; jours: number | null }[] = [
  { label: 'Sans expiration', jours: null },
  { label: '7 jours', jours: 7 },
  { label: '30 jours', jours: 30 },
];

type Confirmation = 'rotate' | 'revoke' | null;

export function InviteCard() {
  const { team, rotateInvite, revokeInvite } = useAuth();
  const [copied, setCopied] = useState<'code' | 'lien' | null>(null);
  const [confirming, setConfirming] = useState<Confirmation>(null);
  const [duree, setDuree] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!team) return null;

  const etat = inviteState(team, new Date());
  const lien = inviteLink(window.location.origin, team.inviteCode);

  async function copier(quoi: 'code' | 'lien', valeur: string) {
    try {
      await navigator.clipboard.writeText(valeur);
      setCopied(quoi);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Presse-papiers refusé (contexte non sécurisé, permission) : le code
      // reste affiché en clair et recopiable à la main, ce n'est pas bloquant.
      setCopied(null);
    }
  }

  async function agir(action: 'rotate' | 'revoke') {
    setBusy(true);
    setError(null);
    try {
      if (action === 'rotate') {
        await rotateInvite(duree === null ? null : expiryFromDays(duree, new Date()));
      } else {
        await revokeInvite();
      }
      setConfirming(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Invitation">
      <Card
        hint={
          etat === 'active'
            ? 'Le code et le lien ouvrent le même accès : révoquer l’un révoque l’autre.'
            : 'Aucun accès ouvert : régénère un lien pour accueillir de nouveaux joueurs.'
        }
        action={
          <StatusBadge status={etat === 'active' ? 'good' : 'warning'}>
            {inviteStateLabel(etat)}
          </StatusBadge>
        }
      >
        {etat === 'active' && team.inviteCode && (
          <div className="stack">
            <div className="row row--between">
              <span
                style={{
                  fontSize: 26,
                  fontWeight: 680,
                  letterSpacing: '0.14em',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}
              >
                {team.inviteCode}
              </span>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => void copier('code', team.inviteCode as string)}
              >
                {copied === 'code' ? 'Copié ✓' : 'Copier le code'}
              </button>
            </div>

            {lien && (
              <div className="row row--between" style={{ gap: 10 }}>
                <span
                  style={{
                    fontSize: 12.5,
                    color: 'var(--text-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}
                >
                  {lien}
                </span>
                <button
                  className="btn btn--ghost btn--sm"
                  style={{ flex: 'none' }}
                  onClick={() => void copier('lien', lien)}
                >
                  {copied === 'lien' ? 'Copié ✓' : 'Copier le lien'}
                </button>
              </div>
            )}

            {team.inviteExpiresAt && (
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                Expire le {new Date(team.inviteExpiresAt).toLocaleDateString('fr-FR')}.
              </p>
            )}
          </div>
        )}

        {etat === 'expired' && (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Ce lien a expiré le {new Date(team.inviteExpiresAt as string).toLocaleDateString('fr-FR')}.
            Personne ne peut plus rejoindre l’équipe avec.
          </p>
        )}

        {etat === 'revoked' && (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            L’invitation a été révoquée. Les joueurs déjà dans l’effectif ne sont pas affectés.
          </p>
        )}

        {error && (
          <div className="alert alert--error" style={{ marginTop: 12 }} role="alert">
            {error}
          </div>
        )}

        {confirming === null ? (
          <div className="row" style={{ gap: 10, marginTop: 14 }}>
            <button className="btn btn--ghost btn--sm" onClick={() => setConfirming('rotate')}>
              {etat === 'active' ? 'Régénérer' : 'Générer un nouveau lien'}
            </button>
            {etat === 'active' && (
              <button className="btn btn--ghost btn--sm" onClick={() => setConfirming('revoke')}>
                Révoquer
              </button>
            )}
          </div>
        ) : (
          <div className="stack" style={{ marginTop: 14 }}>
            {confirming === 'rotate' ? (
              <>
                {/* Formulé en termes de conséquence et non d'action : « régénérer »
                    ne dit rien au coach, « le lien déjà envoyé cessera de
                    fonctionner » lui dit exactement ce qu'il va casser. */}
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {etat === 'active'
                    ? 'Le code et le lien actuels cesseront immédiatement de fonctionner, y compris ceux déjà envoyés à tes joueurs. Les joueurs déjà dans l’effectif restent en place.'
                    : 'Un nouveau code et un nouveau lien seront générés.'}
                </p>
                <div className="field">
                  <span className="field__label">Validité</span>
                  <div className="segmented" role="group" aria-label="Validité du lien">
                    {DUREES.map((d) => (
                      <button
                        key={d.label}
                        type="button"
                        className="segmented__btn"
                        aria-pressed={duree === d.jours}
                        onClick={() => setDuree(d.jours)}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Plus aucun joueur ne pourra rejoindre l’équipe, ni par le code ni par le lien.
                Tu pourras en générer un nouveau à tout moment.
              </p>
            )}
            <div className="row" style={{ gap: 10 }}>
              <button
                className="btn btn--sm"
                disabled={busy}
                onClick={() => void agir(confirming)}
              >
                {busy ? 'En cours…' : confirming === 'rotate' ? 'Confirmer' : 'Révoquer'}
              </button>
              <button
                className="btn btn--ghost btn--sm"
                disabled={busy}
                onClick={() => setConfirming(null)}
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </Card>
    </Section>
  );
}
