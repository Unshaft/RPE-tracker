import { describe, expect, it } from 'vitest';
import { checkEmail, checkPassword, PASSWORD_MIN } from '../validation';

describe('checkEmail', () => {
  it('accepte une adresse normale', () => {
    expect(checkEmail('killian.perzo@ragni.com').valid).toBe(true);
  });

  it('tolere les espaces autour', () => {
    expect(checkEmail('  kp@club.fr  ').valid).toBe(true);
  });

  it.each([
    ['', 'vide'],
    ['kp', 'sans arobase'],
    ['kp@club', 'sans point'],
    ['kp@@club.fr', 'double arobase'],
    ['k p@club.fr', 'espace interne'],
    ['kp@.fr', 'domaine vide'],
    ['kp@club.', 'extension vide'],
  ])('refuse %s (%s)', (input) => {
    expect(checkEmail(input).valid).toBe(false);
  });

  it('suggere une correction sur un domaine mal tape', () => {
    const r = checkEmail('kp@gmial.com');
    expect(r.valid).toBe(true);
    expect(r.suggestion).toBe('kp@gmail.com');
  });

  it('ne suggere rien sur un domaine correct', () => {
    expect(checkEmail('kp@gmail.com').suggestion).toBeNull();
  });
});

describe('checkPassword', () => {
  it('accepte un mot de passe conforme', () => {
    const r = checkPassword('Volant2026');
    expect(r.valid).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(3);
  });

  it(`refuse en dessous de ${PASSWORD_MIN} caracteres`, () => {
    const r = checkPassword('Ab1cde');
    expect(r.valid).toBe(false);
    expect(r.rules.find((x) => x.id === 'length')?.met).toBe(false);
  });

  it('exige majuscule, minuscule et chiffre', () => {
    expect(checkPassword('tropsimple').valid).toBe(false);
    expect(checkPassword('TROPSIMPLE1').valid).toBe(false);
    expect(checkPassword('TropSimple').valid).toBe(false);
  });

  it('refuse un mot de passe courant meme bien forme', () => {
    expect(checkPassword('Password123').valid).toBe(false);
  });

  it('refuse un mot de passe contenant le nom ou l identifiant e-mail', () => {
    expect(checkPassword('Perzo12345', { lastName: 'Perzo' }).valid).toBe(false);
    expect(checkPassword('Killian2026', { email: 'killian@club.fr' }).valid).toBe(false);
  });

  it('ignore un contexte trop court pour etre discriminant', () => {
    expect(checkPassword('Volant2026', { firstName: 'Jo' }).valid).toBe(true);
  });

  it('reserve le score maximal aux mots de passe longs', () => {
    expect(checkPassword('Volant2026').score).toBe(3);
    expect(checkPassword('VolantPlume2026').score).toBe(4);
  });

  it('donne un score nul sur une saisie vide', () => {
    const r = checkPassword('');
    expect(r.score).toBe(0);
    expect(r.valid).toBe(false);
  });
});
