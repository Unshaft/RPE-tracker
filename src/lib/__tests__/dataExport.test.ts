import { describe, expect, it } from 'vitest';
import {
  buildPersonalExport,
  buildTeamExport,
  exportFileName,
  sessionsToCsv,
} from '../../components/dataExport';
import type { PublicUser, Team, TrainingSession } from '../types';

const joueur: PublicUser = {
  id: 'u1',
  email: 'jo@club.fr',
  firstName: 'Jo',
  lastName: 'Martin',
  role: 'player',
  teamId: 't1',
  position: 'Ailier',
  createdAt: '2026-01-05T08:00:00Z',
};

const coach: PublicUser = {
  id: 'c1',
  email: 'coach@club.fr',
  firstName: 'Ana',
  lastName: 'Roux',
  role: 'coach',
  teamId: 't1',
  createdAt: '2026-01-01T08:00:00Z',
};

const equipe: Team = {
  id: 't1',
  name: 'AS Riviera — Seniors',
  coachId: 'c1',
  inviteCode: 'ABC234',
  inviteExpiresAt: null,
  inviteRotatedAt: '2026-09-01T10:00:00Z',
  createdAt: '2026-01-01T09:00:00Z',
};

const seance: TrainingSession = {
  id: 's1',
  userId: 'u1',
  date: '2026-09-18',
  type: 'entrainement',
  durationMin: 90,
  rpe: 7,
  comment: 'Jambes lourdes ; "grosse" seance',
  inputs: { rpeBreathing: 6, rpeMuscular: 8 },
  createdAt: '2026-09-18T20:10:00Z',
};

describe('buildPersonalExport', () => {
  const sortie = buildPersonalExport({
    user: joueur,
    team: equipe,
    sessions: [seance],
    generatedAt: '2026-09-19T10:00:00Z',
  });

  it('restitue le profil et toutes les seances, entrees comprises', () => {
    expect(sortie.profil.email).toBe('jo@club.fr');
    expect(sortie.seances).toHaveLength(1);
    expect(sortie.seances[0].entrees).toEqual({ rpeBreathing: 6, rpeMuscular: 8 });
    expect(sortie.seances[0].commentaire).toBe('Jambes lourdes ; "grosse" seance');
  });

  it('ne fait pas circuler le jeton d invitation dans un fichier exporte', () => {
    expect(JSON.stringify(sortie)).not.toContain('ABC234');
  });

  it('tolere un utilisateur sans equipe', () => {
    const sans = buildPersonalExport({
      user: { ...joueur, teamId: null },
      team: null,
      sessions: [],
      generatedAt: '2026-09-19T10:00:00Z',
    });
    expect(sans.equipe).toBeNull();
    expect(sans.seances).toEqual([]);
  });
});

describe('buildTeamExport', () => {
  it('range les seances sous chaque joueur, y compris ceux qui n en ont aucune', () => {
    const vide: PublicUser = { ...joueur, id: 'u2', firstName: 'Sam', lastName: 'Bry' };
    const sortie = buildTeamExport({
      team: equipe,
      coach,
      players: [joueur, vide],
      sessionsByPlayer: new Map([
        ['u1', [seance]],
        ['u2', []],
      ]),
      generatedAt: '2026-09-19T10:00:00Z',
    });
    expect(sortie.joueurs).toHaveLength(2);
    expect(sortie.joueurs[0].seances).toHaveLength(1);
    expect(sortie.joueurs[1].seances).toEqual([]);
  });

  it('n invente pas de seances pour un joueur absent de la map', () => {
    const sortie = buildTeamExport({
      team: equipe,
      coach,
      players: [joueur],
      sessionsByPlayer: new Map(),
      generatedAt: '2026-09-19T10:00:00Z',
    });
    expect(sortie.joueurs[0].seances).toEqual([]);
  });
});

describe('sessionsToCsv', () => {
  const csv = sessionsToCsv([seance], new Map([['u1', joueur]]));

  it('commence par le BOM que reclame Excel', () => {
    expect(csv.startsWith('﻿')).toBe(true);
  });

  it('protege un commentaire contenant le separateur et des guillemets', () => {
    // Sans echappement, le point-virgule du commentaire decalerait toutes les
    // colonnes suivantes et l'export deviendrait faux sans prevenir.
    expect(csv).toContain('"Jambes lourdes ; ""grosse"" seance"');
  });

  it('traduit le type de seance en libelle lisible', () => {
    expect(csv).toContain('Entraînement');
  });

  it('produit une ligne d en-tete et une ligne par seance', () => {
    expect(csv.trimEnd().split('\r\n')).toHaveLength(2);
  });

  it('laisse la cellule vide quand il n y a pas de commentaire', () => {
    const sans = sessionsToCsv([{ ...seance, comment: undefined }], new Map([['u1', joueur]]));
    expect(sans).toContain(';;2026-09-18T20:10:00Z');
  });
});

describe('exportFileName', () => {
  it('translittere les accents et remplace les separateurs', () => {
    expect(exportFileName('AS Riviera — Seniors', '2026-09-19T10:00:00Z', 'json')).toBe(
      'as-riviera-seniors-2026-09-19-10-00-00.json',
    );
  });

  it('retombe sur un nom generique si rien d utilisable ne subsiste', () => {
    expect(exportFileName('///', '2026-09-19T10:00:00Z', 'csv')).toBe(
      'export-2026-09-19-10-00-00.csv',
    );
  });
});
