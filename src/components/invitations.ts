import type { Team } from '../lib/types';

/**
 * Le jeton d'invitation, côté interface.
 *
 * Un seul secret pour deux usages : le code court se dicte au bord du terrain,
 * le lien se colle dans un message d'équipe. Le lien ne fait que porter le code
 * dans son `?equipe=` — il n'y a donc rien de plus à révoquer que le code.
 */

/** Paramètre d'URL du lien d'invitation. */
export const INVITE_PARAM = 'equipe';

/** `null` quand l'invitation est révoquée : il n'y a alors pas de lien. */
export function inviteLink(origin: string, code: string | null): string | null {
  if (!code) return null;
  return `${origin.replace(/\/$/, '')}/inscription?${INVITE_PARAM}=${encodeURIComponent(code)}`;
}

/**
 * Code lu depuis l'URL d'inscription.
 *
 * Filtré et non pas seulement passé en majuscules : cette valeur vient d'un
 * lien que n'importe qui peut fabriquer, et elle part ensuite dans un champ de
 * formulaire. On n'en garde que ce qui peut être un code.
 */
export function readInviteCode(search: string): string {
  const raw = new URLSearchParams(search).get(INVITE_PARAM) ?? '';
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export type InviteState = 'active' | 'expired' | 'revoked';

/**
 * L'expiration est évaluée ici pour l'affichage seulement. La décision qui
 * compte est prise par `join_team` : un lien affiché « actif » sur un écran
 * resté ouvert n'ouvre rien de plus qu'un lien expiré.
 */
export function inviteState(team: Pick<Team, 'inviteCode' | 'inviteExpiresAt'>, now: Date): InviteState {
  if (!team.inviteCode) return 'revoked';
  if (team.inviteExpiresAt && new Date(team.inviteExpiresAt).getTime() <= now.getTime()) {
    return 'expired';
  }
  return 'active';
}

export function inviteStateLabel(state: InviteState): string {
  switch (state) {
    case 'active':
      return 'Active';
    case 'expired':
      return 'Expirée';
    case 'revoked':
      return 'Révoquée';
  }
}

/**
 * Date d'expiration à `jours` jours, ramenée à la fin de journée locale.
 *
 * Un lien qui meurt à 14 h 32 parce qu'il a été créé à 14 h 32 sept jours plus
 * tôt est incompréhensible pour le coach qui l'a distribué le matin même.
 */
export function expiryFromDays(jours: number, from: Date): string {
  const d = new Date(from);
  d.setDate(d.getDate() + jours);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}
