import { describe, expect, it } from 'vitest';
import { addDays } from '../date';
import { buildLoadContext } from '../loadModels';
import { acuteByPlayer, buildTeamRows, teamWeeklyAverage } from '../team';
import type {
  LoadDomain,
  LoadModelCode,
  LoadModelParams,
  PublicUser,
  SessionInputs,
  TeamLoadModel,
  TrainingSession,
} from '../types';

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


/* ------------------------------------------------------------------ *
 * Le contexte de modèles doit traverser `buildTeamRows`
 *
 * C'est le point faible naturel de ce fichier : un oubli de `ctx` ne casse
 * rien, il fait simplement retomber toute la vue coach sur le modèle par
 * défaut sans le dire. Ces tests échouent si le contexte cesse d'etre
 * transmis.
 * ------------------------------------------------------------------ */

function teamModel(
  domain: LoadDomain,
  modelCode: LoadModelCode,
  effectiveFrom: string,
  params: LoadModelParams = {},
): TeamLoadModel {
  return { id: `${domain}-${effectiveFrom}`, teamId: 't1', domain, modelCode, params, effectiveFrom };
}

function richSession(
  userId: string,
  date: string,
  rpe: number,
  durationMin: number,
  inputs?: SessionInputs,
): TrainingSession {
  return {
    id: `${userId}-${date}`,
    userId,
    date,
    type: 'entrainement',
    rpe,
    durationMin,
    inputs,
    createdAt: `${date}T18:00:00Z`,
  };
}

describe('buildTeamRows avec un contexte de modèles', () => {
  const players = [player('a', 'Alpha')];

  it('applique la formule du modèle choisi par l’équipe', () => {
    const sessions = [richSession('a', END, 5, 60, { rpeBreathing: 8, rpeMuscular: 4 })];
    const ctx = buildLoadContext([
      teamModel('field', 'srpe_differentiated', '2026-01-01'),
    ]);

    const [row] = buildTeamRows(players, new Map([['a', sessions]]), END, ctx);
    // (8 + 4) / 2 × 60 = 360, la ou le session-RPE global donnerait 300.
    expect(row.metrics.acute).toBe(360);
    expect(row.spark[row.spark.length - 1]).toBe(360);
  });

  it('retombe sur le modèle par défaut sans contexte', () => {
    const sessions = [richSession('a', END, 5, 60, { rpeBreathing: 8, rpeMuscular: 4 })];
    const [row] = buildTeamRows(players, new Map([['a', sessions]]), END);
    expect(row.metrics.acute).toBe(300);
  });

  it('ne resout pas le modèle a la date du jour mais a celle de la seance', () => {
    const sessions = [
      richSession('a', addDays(END, -20), 5, 60, { rpeBreathing: 8, rpeMuscular: 4 }),
      richSession('a', END, 5, 60, { rpeBreathing: 8, rpeMuscular: 4 }),
    ];
    // Le modèle differencie ne prend effet qu'une semaine avant END.
    const ctx = buildLoadContext([
      teamModel('field', 'srpe_differentiated', addDays(END, -7)),
    ]);

    const [row] = buildTeamRows(players, new Map([['a', sessions]]), END, ctx);
    const weeks = teamWeeklyAverage([row], END, 4, ctx);
    // La seance ancienne reste a 300 (session-RPE), la recente passe a 360.
    expect(weeks[weeks.length - 1].load).toBe(360);
    expect(weeks.reduce((a, w) => a + w.load, 0)).toBe(660);
  });

  it('lit la zone de risque avec les seuils configures par l’équipe', () => {
    // Quatre semaines de reference identiques a la semaine en cours : ratio 1.
    const sessions = ['2026-02-15', '2026-02-22', '2026-03-01', '2026-03-08', END].map((d) =>
      richSession('a', d, 5, 60),
    );
    const byPlayer = new Map([['a', sessions]]);

    const [parDefaut] = buildTeamRows(players, byPlayer, END);
    expect(parDefaut.metrics.week.ratio).toBe(1);
    expect(parDefaut.zone?.zone).toBe('optimal');

    const ctx = buildLoadContext([
      teamModel('field', 'foster_srpe', '2026-01-01', {
        acwrThresholds: { low: 1.2, optimalMax: 1.5, cautionMax: 2 },
      }),
    ]);
    const [configure] = buildTeamRows(players, byPlayer, END, ctx);
    expect(configure.metrics.week.ratio).toBe(1);
    // Meme ratio, autre lecture : sans les seuils de l'équipe, ce joueur
    // serait affiche « zone optimale ».
    expect(configure.zone?.zone).toBe('undertraining');
  });

  it('respecte la profondeur de reference configuree', () => {
    const sessions = ['2026-03-01', '2026-03-08', END].map((d) => richSession('a', d, 5, 60));
    const ctx = buildLoadContext([
      teamModel('field', 'foster_srpe', '2026-01-01', { weeklyLookbackWeeks: 2 }),
    ]);

    const [row] = buildTeamRows(players, new Map([['a', sessions]]), END, ctx);
    expect(row.metrics.week.lookback).toBe(2);
    expect(row.metrics.week.weeksUsed).toBe(2);
  });
});
