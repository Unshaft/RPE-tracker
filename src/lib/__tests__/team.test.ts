import { describe, expect, it } from 'vitest';
import { addDays } from '../date';
import { acuteByPlayer, buildTeamRows } from '../team';
import type { PublicUser, TrainingSession } from '../types';

const END = '2026-03-15';

function player(id: string, lastName: string): PublicUser {
  return {
    id,
    email: `${id}@club.fr`,
    firstName: 'Test',
    lastName,
    role: 'player',
    teamId: 't1',
    createdAt: '2026-01-01T00:00:00Z',
  };
}

function session(userId: string, date: string, rpe: number, durationMin: number): TrainingSession {
  return {
    id: `${userId}-${date}`,
    userId,
    date,
    type: 'entrainement',
    rpe,
    durationMin,
    createdAt: `${date}T18:00:00Z`,
  };
}

function rowsFor(entries: Record<string, TrainingSession[]>, names: Record<string, string>) {
  const players = Object.keys(names).map((id) => player(id, names[id]));
  return buildTeamRows(players, new Map(Object.entries(entries)), END);
}

describe('acuteByPlayer', () => {
  it('classe les joueurs du plus chargé au moins chargé sur 7 jours', () => {
    const rows = rowsFor(
      {
        // 8 * 60 = 480 UA
        a: [session('a', END, 8, 60)],
        // 5 * 60 = 300 UA
        b: [session('b', END, 5, 60)],
        // 2 * 90 + 6 * 60 = 540 UA
        c: [session('c', END, 2, 90), session('c', addDays(END, -2), 6, 60)],
      },
      { a: 'Alpha', b: 'Bravo', c: 'Charlie' },
    );

    const out = acuteByPlayer(rows);
    expect(out.map((o) => o.player.lastName)).toEqual(['Charlie', 'Alpha', 'Bravo']);
    expect(out.map((o) => o.acute)).toEqual([540, 480, 300]);
  });

  it('garde les joueurs sans saisie, à zéro, en fin de classement', () => {
    const rows = rowsFor(
      { a: [session('a', END, 8, 60)], b: [] },
      { a: 'Alpha', b: 'Bravo' },
    );

    const out = acuteByPlayer(rows);
    expect(out).toHaveLength(2);
    expect(out[1].player.lastName).toBe('Bravo');
    expect(out[1].acute).toBe(0);
    expect(out[1].sessionCount7d).toBe(0);
  });

  it('ignore les séances plus vieilles que la fenêtre de 7 jours', () => {
    const rows = rowsFor(
      { a: [session('a', addDays(END, -10), 9, 120)] },
      { a: 'Alpha' },
    );

    const out = acuteByPlayer(rows);
    expect(out[0].acute).toBe(0);
    expect(out[0].sessionCount7d).toBe(0);
  });

  it('compte les séances des 7 derniers jours', () => {
    const rows = rowsFor(
      {
        a: [
          session('a', END, 6, 60),
          session('a', addDays(END, -3), 7, 60),
          session('a', addDays(END, -30), 9, 60),
        ],
      },
      { a: 'Alpha' },
    );

    expect(acuteByPlayer(rows)[0].sessionCount7d).toBe(2);
  });

  it('renvoie une liste vide sans joueur', () => {
    expect(acuteByPlayer([])).toEqual([]);
  });
});
