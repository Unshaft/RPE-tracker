import { describe, expect, it } from 'vitest';
import { addDays } from '../date';
import {
  DEFAULT_LOAD_CONTEXT,
  applyLoadModel,
  buildLoadContext,
  domainForType,
  resolveLoadModel,
  resolveParams,
} from '../loadModels';
import {
  acuteLoad,
  acwr,
  acwrZone,
  calendarWeeks,
  chronicLoad,
  computePlayerMetrics,
  dailySeries,
  loadByType,
  monotony,
  sessionLoad,
  strain,
  weeklyRatio,
  weeklyRatioSeries,
  weeklySeries,
} from '../metrics';
import type {
  LoadDomain,
  LoadModelCode,
  LoadModelParams,
  SessionInputs,
  SessionType,
  TeamLoadModel,
  TrainingSession,
} from '../types';

const END = '2026-03-15'; // un dimanche
const TEAM = 'team-1';

function s(
  date: string,
  rpe: number,
  durationMin: number,
  type: SessionType = 'entrainement',
  inputs?: SessionInputs,
): TrainingSession {
  return {
    id: `${date}-${type}-${rpe}-${durationMin}`,
    userId: 'u1',
    date,
    type,
    rpe,
    durationMin,
    inputs,
    createdAt: `${date}T18:00:00Z`,
  };
}

function choix(
  domain: LoadDomain,
  modelCode: LoadModelCode,
  effectiveFrom: string,
  params: LoadModelParams = {},
): TeamLoadModel {
  return { id: `${domain}-${effectiveFrom}`, teamId: TEAM, domain, modelCode, params, effectiveFrom };
}

/* ------------------------------------------------------------------ *
 * Non-regression
 *
 * C'est le test qui protege les equipes deja en production : avec les
 * modeles par defaut et les parametres par defaut, toutes les metriques
 * doivent rendre exactement les chiffres d'avant l'introduction des
 * modeles, au bit pres. Aucun `toBeCloseTo` ici, volontairement.
 * ------------------------------------------------------------------ */

describe('non-regression : modeles par defaut', () => {
  // Un historique volontairement bigarre : jours de repos, plusieurs seances
  // le meme jour, tous les types de seance, des muscu au milieu.
  const historique: TrainingSession[] = [
    s(END, 8, 60, 'match'),
    s(END, 4, 30, 'recuperation'),
    s(addDays(END, -1), 6, 75, 'muscu'),
    s(addDays(END, -3), 7, 90),
    s(addDays(END, -6), 5, 45, 'individuel'),
    s(addDays(END, -9), 9, 100, 'match'),
    s(addDays(END, -12), 6, 60, 'muscu'),
    s(addDays(END, -20), 7, 80),
    s(addDays(END, -26), 8, 70),
    s(addDays(END, -33), 5, 50),
  ];

  // Ce que l'equipe obtient si elle configure explicitement les modeles par
  // defaut : le resultat doit etre indiscernable de « rien de configure ».
  const explicite = buildLoadContext([
    choix('field', 'foster_srpe', '2020-01-01'),
    choix('strength', 'foster_srpe_strength', '2020-01-01'),
  ]);

  it('la charge d une seance reste RPE x duree', () => {
    for (const session of historique) {
      expect(sessionLoad(session)).toBe(session.rpe * session.durationMin);
      expect(sessionLoad(session, explicite)).toBe(session.rpe * session.durationMin);
    }
  });

  it('toutes les metriques derivees sont identiques, configurees ou non', () => {
    expect(acuteLoad(historique, END, explicite)).toBe(acuteLoad(historique, END));
    expect(chronicLoad(historique, END, explicite)).toBe(chronicLoad(historique, END));
    expect(acwr(historique, END, explicite)).toBe(acwr(historique, END));
    expect(monotony(historique, END, explicite)).toBe(monotony(historique, END));
    expect(strain(historique, END, explicite)).toBe(strain(historique, END));
    expect(dailySeries(historique, END, 14, explicite)).toEqual(
      dailySeries(historique, END, 14),
    );
    expect(weeklySeries(historique, END, 8, explicite)).toEqual(
      weeklySeries(historique, END, 8),
    );
    expect(calendarWeeks(historique, END, 6, explicite)).toEqual(
      calendarWeeks(historique, END, 6),
    );
    expect(weeklyRatio(historique, END, explicite)).toEqual(weeklyRatio(historique, END));
    expect(weeklyRatioSeries(historique, END, 8, explicite)).toEqual(
      weeklyRatioSeries(historique, END, 8),
    );
    expect(loadByType(historique, END, 28, explicite)).toEqual(
      loadByType(historique, END, 28),
    );
    expect(computePlayerMetrics(historique, END, explicite)).toEqual(
      computePlayerMetrics(historique, END),
    );
  });

  it('reproduit les valeurs de reference calculees a la main', () => {
    // 7 derniers jours : 480 + 120 (dimanche) + 450 (muscu) + 630 + 225 = 1905
    expect(acuteLoad(historique, END)).toBe(1905);
    // 28 derniers jours : 1905 + 900 + 360 + 560 + 560 = 4285, ramenes a 7 jours
    expect(chronicLoad(historique, END)).toBe(4285 / 4);
    expect(computePlayerMetrics(historique, END).acwr).toBe(1905 / (4285 / 4));
  });

  it('les parametres par defaut sont ceux du contrat', () => {
    expect(resolveParams(undefined)).toEqual({
      acuteWindowDays: 7,
      chronicWindowDays: 28,
      chronicMethod: 'rolling_average',
      acwrThresholds: { low: 0.8, optimalMax: 1.3, cautionMax: 1.5 },
      weeklyLookbackWeeks: 4,
    });
  });
});

/* ------------------------------------------------------------------ *
 * Catalogue
 * ------------------------------------------------------------------ */

describe('domainForType', () => {
  it('isole la musculation, tout le reste est du terrain', () => {
    expect(domainForType('muscu')).toBe('strength');
    for (const type of ['entrainement', 'match', 'individuel', 'recuperation'] as SessionType[]) {
      expect(domainForType(type)).toBe('field');
    }
  });
});

describe('foster_srpe', () => {
  it('multiplie le RPE par la duree', () => {
    expect(applyLoadModel('foster_srpe', s(END, 7, 90))).toBe(630);
    expect(applyLoadModel('foster_srpe_strength', s(END, 6, 45, 'muscu'))).toBe(270);
  });
});

describe('srpe_differentiated', () => {
  const ctx = buildLoadContext([choix('field', 'srpe_differentiated', '2026-01-01')]);

  it('moyenne les deux RPE avant de multiplier par la duree', () => {
    const session = s(END, 5, 60, 'entrainement', { rpeBreathing: 8, rpeMuscular: 4 });
    expect(sessionLoad(session, ctx)).toBe(((8 + 4) / 2) * 60);
  });

  it('retombe sur le RPE global quand les deux entrees manquent', () => {
    // Cas d'une seance saisie avant le changement de modele : la meilleure
    // approximation disponible est le RPE qui a bien ete saisi, lui.
    expect(sessionLoad(s(END, 7, 90), ctx)).toBe(630);
  });

  it('ne s applique pas a la musculation, qui suit son propre domaine', () => {
    const muscu = s(END, 6, 60, 'muscu', { rpeBreathing: 10, rpeMuscular: 10 });
    expect(sessionLoad(muscu, ctx)).toBe(360);
  });
});

describe('volume_load', () => {
  const ctx = buildLoadContext([choix('strength', 'volume_load', '2026-01-01')]);

  it('somme le tonnage de chaque exercice', () => {
    const session = s(END, 6, 60, 'muscu', {
      exercises: [
        { sets: 4, reps: 8, weightKg: 100 },
        { sets: 3, reps: 10, weightKg: 60 },
      ],
    });
    expect(sessionLoad(session, ctx)).toBe(4 * 8 * 100 + 3 * 10 * 60);
  });

  it('vaut zero sans tonnage saisi, plutot que d inventer une charge', () => {
    expect(sessionLoad(s(END, 8, 60, 'muscu'), ctx)).toBe(0);
  });

  it('laisse le terrain intact', () => {
    expect(sessionLoad(s(END, 8, 60, 'match'), ctx)).toBe(480);
  });
});

/* ------------------------------------------------------------------ *
 * Resolution par date et par domaine
 * ------------------------------------------------------------------ */

describe('resolveLoadModel', () => {
  const ctx = buildLoadContext([
    choix('field', 'srpe_differentiated', '2026-03-01'),
    choix('field', 'foster_srpe', '2026-01-01'),
    choix('strength', 'volume_load', '2026-02-01'),
  ]);

  it('retient le dernier choix anterieur ou egal a la date', () => {
    expect(resolveLoadModel(ctx, 'field', '2026-02-28').modelCode).toBe('foster_srpe');
    expect(resolveLoadModel(ctx, 'field', '2026-03-01').modelCode).toBe('srpe_differentiated');
    expect(resolveLoadModel(ctx, 'field', END).modelCode).toBe('srpe_differentiated');
  });

  it('retombe sur le modele par defaut avant toute date d effet', () => {
    const avant = resolveLoadModel(ctx, 'field', '2025-12-31');
    expect(avant.modelCode).toBe('foster_srpe');
    expect(avant.effectiveFrom).toBeNull();
    expect(resolveLoadModel(DEFAULT_LOAD_CONTEXT, 'strength', END).modelCode).toBe(
      'foster_srpe_strength',
    );
  });

  it('ne melange jamais les deux domaines', () => {
    expect(resolveLoadModel(ctx, 'strength', END).modelCode).toBe('volume_load');
    expect(resolveLoadModel(ctx, 'strength', '2026-01-15').modelCode).toBe(
      'foster_srpe_strength',
    );
  });

  it('un changement de modele ne reecrit pas le passe', () => {
    // La meme seance, de part et d'autre de la date d'effet : seule celle qui
    // tombe apres le 1er mars est recalculee.
    const avant = s('2026-02-20', 5, 60, 'entrainement', { rpeBreathing: 9, rpeMuscular: 9 });
    const apres = s('2026-03-10', 5, 60, 'entrainement', { rpeBreathing: 9, rpeMuscular: 9 });
    expect(sessionLoad(avant, ctx)).toBe(300);
    expect(sessionLoad(apres, ctx)).toBe(540);
  });
});

/* ------------------------------------------------------------------ *
 * Parametres d'analyse
 * ------------------------------------------------------------------ */

describe('parametres configurables', () => {
  /** Une seance de 100 UA par jour sur `days` jours consecutifs finissant a END. */
  function plat(days: number, load = 100): TrainingSession[] {
    return Array.from({ length: days }, (_, i) => s(addDays(END, -i), 10, load / 10));
  }

  it('la fenetre aigue suit le parametre de l equipe', () => {
    const ctx = buildLoadContext([
      choix('field', 'foster_srpe', '2020-01-01', { acuteWindowDays: 10 }),
    ]);
    expect(acuteLoad(plat(20), END, ctx)).toBe(1000);
    expect(acuteLoad(plat(20), END)).toBe(700);
  });

  it('la fenetre chronique reste ramenee a la largeur de la fenetre aigue', () => {
    const ctx = buildLoadContext([
      choix('field', 'foster_srpe', '2020-01-01', {
        acuteWindowDays: 10,
        chronicWindowDays: 40,
      }),
    ]);
    // 100 UA/j sur 40 jours -> 1000 UA par tranche de 10 jours.
    expect(chronicLoad(plat(40), END, ctx)).toBe(1000);
    expect(acwr(plat(40), END, ctx)).toBeCloseTo(1, 10);
  });

  it('l EWMA reste proche de 1 sur une charge stable', () => {
    const ctx = buildLoadContext([
      choix('field', 'foster_srpe', '2020-01-01', { chronicMethod: 'ewma' }),
    ]);
    // Sur une charge parfaitement constante, les deux methodes doivent
    // converger : c'est ce qui rend le changement de methode lisible.
    expect(acwr(plat(56), END, ctx)).toBeCloseTo(1, 1);
  });

  it('l EWMA reagit plus vite a un pic que la moyenne glissante', () => {
    const ewma = buildLoadContext([
      choix('field', 'foster_srpe', '2020-01-01', { chronicMethod: 'ewma' }),
    ]);
    const sessions = [...plat(56), ...plat(7, 200)];
    // Le pic recent pese plus dans une moyenne exponentielle : la charge
    // chronique monte davantage, donc le ratio est plus tempere.
    expect(chronicLoad(sessions, END, ewma)).toBeGreaterThan(chronicLoad(sessions, END));
    expect(acwr(sessions, END, ewma)!).toBeLessThan(acwr(sessions, END)!);
  });

  it('les seuils de zone sont deplacables', () => {
    expect(acwrZone(1.4)!.zone).toBe('caution');
    expect(acwrZone(1.4, { low: 0.9, optimalMax: 1.5, cautionMax: 1.8 })!.zone).toBe('optimal');
  });

  it('la profondeur de reference hebdomadaire suit le parametre', () => {
    const ctx = buildLoadContext([
      choix('field', 'foster_srpe', '2020-01-01', { weeklyLookbackWeeks: 2 }),
    ]);
    const r = weeklyRatio(plat(56), END, ctx);
    expect(r.lookback).toBe(2);
    expect(r.weeksUsed).toBe(2);
    expect(weeklyRatio(plat(56), END).weeksUsed).toBe(4);
  });

  it('les parametres appliques sont exposes dans les metriques du joueur', () => {
    const ctx = buildLoadContext([
      choix('field', 'foster_srpe', '2020-01-01', { acuteWindowDays: 5 }),
    ]);
    expect(computePlayerMetrics(plat(10), END, ctx).params.acuteWindowDays).toBe(5);
  });
});
