import { describe, expect, it } from 'vitest';
import {
  expiryFromDays,
  inviteLink,
  inviteState,
  inviteStateLabel,
  readInviteCode,
} from '../../components/invitations';

describe('inviteLink', () => {
  it('porte le code dans le parametre attendu par la page d inscription', () => {
    expect(inviteLink('https://rpe.example', 'ABC234')).toBe(
      'https://rpe.example/inscription?equipe=ABC234',
    );
  });

  it('ne double pas la barre oblique quand l origine en porte une', () => {
    expect(inviteLink('https://rpe.example/', 'ABC234')).toBe(
      'https://rpe.example/inscription?equipe=ABC234',
    );
  });

  it('ne fabrique aucun lien pour une invitation revoquee', () => {
    expect(inviteLink('https://rpe.example', null)).toBeNull();
  });
});

describe('readInviteCode', () => {
  it('normalise la casse', () => {
    expect(readInviteCode('?equipe=abc234')).toBe('ABC234');
  });

  it('ne garde que ce qui peut etre un code', () => {
    // L'URL est fabricable par n'importe qui : ce qui en sort part ensuite
    // dans un champ de formulaire puis dans une requete.
    expect(readInviteCode('?equipe=<script>')).toBe('SCRIPT');
    expect(readInviteCode('?equipe=AB-CD-23-45')).toBe('ABCD23');
  });

  it('rend une chaine vide en l absence de parametre', () => {
    expect(readInviteCode('')).toBe('');
    expect(readInviteCode('?autre=1')).toBe('');
  });
});

describe('inviteState', () => {
  const maintenant = new Date('2026-09-19T12:00:00Z');

  it('est active sans date d expiration', () => {
    expect(inviteState({ inviteCode: 'ABC234', inviteExpiresAt: null }, maintenant)).toBe('active');
  });

  it('est active tant que l echeance est devant', () => {
    expect(
      inviteState({ inviteCode: 'ABC234', inviteExpiresAt: '2026-09-20T00:00:00Z' }, maintenant),
    ).toBe('active');
  });

  it('bascule a l echeance exacte, pas apres', () => {
    expect(
      inviteState({ inviteCode: 'ABC234', inviteExpiresAt: '2026-09-19T12:00:00Z' }, maintenant),
    ).toBe('expired');
  });

  it('prime la revocation sur l expiration', () => {
    expect(
      inviteState({ inviteCode: null, inviteExpiresAt: '2026-09-20T00:00:00Z' }, maintenant),
    ).toBe('revoked');
  });

  it('nomme chaque etat en francais', () => {
    expect(inviteStateLabel('active')).toBe('Active');
    expect(inviteStateLabel('expired')).toBe('Expirée');
    expect(inviteStateLabel('revoked')).toBe('Révoquée');
  });
});

describe('expiryFromDays', () => {
  it('repousse l echeance a la fin de la journee locale', () => {
    const at = expiryFromDays(7, new Date(2026, 8, 19, 14, 32));
    const d = new Date(at);
    expect(d.getDate()).toBe(26);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
  });
});
