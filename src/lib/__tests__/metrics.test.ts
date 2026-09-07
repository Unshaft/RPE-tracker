import { describe, expect, it } from 'vitest';
import { addDays } from '../date';
import {
  acwr,
  acwrZone,
  chronicLoad,
  computePlayerMetrics,
  dailySeries,
  loadByType,
  monotony,
  sessionLoad,
  stdDev,
  strain,
  weeklySeries,
} from '../metrics';
import type { SessionType, TrainingSession } from '../types';

const END = '2026-03-15'; // un dimanche

function s(date: string, rpe: number, durationMin: number, type: SessionType = 'entrainement'): TrainingSession {
  return { id: `${date}-${rpe}-${durationMin}`, userId: 'u1', date, type, rpe, durationMin, createdAt: `${date}T18:00:00Z` };
}

/** Une séance de 100 UA par jour sur `days` jours consecutifs se terminant a END. */
function flat(days: number, load = 100): TrainingSession[] {
  return Array.from({ length: days }, (_, i) => s(addDays(END, -i), 10, load / 10));
}

describe('sessionLoad', () => {
  it('multiplie le RPE par la durée', () => {
    expect(sessionLoad({ rpe: 7, durationMin: 90 })).toBe(630);
  });
});

describe('dailySeries', () => {
  it('renvoie une valeur par jour, 0 pour les jours de repos', () => {
    const series = dailySeries([s(END, 8, 60)], END, 7);
    expect(series).toHaveLength(7);
    expect(series[6]).toEqual({ date: END, load: 480 });
    expect(series.slice(0, 6).every((d) => d.load === 0)).toBe(true);
  });

  it('cumule plusieurs séances le même jour', () => {
    const series = dailySeries([s(END, 5, 60), s(END, 5, 30)], END, 1);
    expect(series[0].load).toBe(450);
  });

  it('ignore les séances hors fenêtre', () => {
    const series = dailySeries([s(addDays(END, -30), 9, 100)], END, 7);
    expect(series.every((d) => d.load === 0)).toBe(true);
  });
});

describe('charge aiguë et chronique', () => {
  it('la charge chronique ramene 28 jours a une semaine', () => {
    // 100 UA par jour pendant 28 jours -> 700 UA de moyenne hebdomadaire.
    expect(chronicLoad(flat(28), END)).toBe(700);
  });

  it('ACWR vaut 1 quand la charge est stable', () => {
    expect(acwr(flat(28), END)).toBeCloseTo(1, 10);
  });

  it('ACWR augmente quand la semaine est plus chargee que le bloc', () => {
    const sessions = [...flat(28), ...flat(7, 50)]; // +50 UA/j sur la dernière semaine
    const ratio = acwr(sessions, END)!;
    expect(ratio).toBeGreaterThan(1.3);
  });

  it('renvoie null sans historique', () => {
    expect(acwr([], END)).toBeNull();
  });
});

describe('acwrZone', () => {
  it.each([
    [0.5, 'undertraining'],
    [0.79, 'undertraining'],
    [0.8, 'optimal'],
    [1.3, 'optimal'],
    [1.45, 'caution'],
    [1.5, 'caution'],
    [1.8, 'danger'],
  ])('classe %s en zone %s', (ratio, zone) => {
    expect(acwrZone(ratio)!.zone).toBe(zone);
  });

  it('renvoie null pour un ratio indisponible', () => {
    expect(acwrZone(null)).toBeNull();
  });
});

describe('monotonie et contrainte', () => {
  it('renvoie null quand la charge quotidienne est constante (écart-type nul)', () => {
    expect(monotony(flat(7), END)).toBeNull();
    expect(strain(flat(7), END)).toBeNull();
  });

  it('utilise l écart-type de population sur 7 jours, repos inclus', () => {
    const sessions = [s(END, 10, 20), s(addDays(END, -1), 10, 20)]; // 200, 200, puis 5 jours a 0
    const loads = [0, 0, 0, 0, 0, 200, 200];
    const expected = (400 / 7) / stdDev(loads);
    expect(monotony(sessions, END)).toBeCloseTo(expected, 10);
  });

  it('la contrainte est le produit charge hebdo x monotonie', () => {
    const sessions = [s(END, 10, 20), s(addDays(END, -1), 10, 20)];
    expect(strain(sessions, END)).toBeCloseTo(400 * monotony(sessions, END)!, 10);
  });
});

describe('computePlayerMetrics', () => {
  it('agrege les compteurs de la semaine et la variation', () => {
    const sessions = [
      ...flat(7, 100), // semaine en cours : 700 UA
      ...Array.from({ length: 7 }, (_, i) => s(addDays(END, -7 - i), 10, 5)), // semaine passee : 350 UA
    ];
    const m = computePlayerMetrics(sessions, END);
    expect(m.acute).toBe(700);
    expect(m.previousAcute).toBe(350);
    expect(m.acuteDelta).toBeCloseTo(1, 10);
    expect(m.sessionCount7d).toBe(7);
    expect(m.minutes7d).toBe(70);
    expect(m.avgRpe7d).toBe(10);
  });

  it('ne divise pas par zero quand la semaine précédente est vide', () => {
    const m = computePlayerMetrics(flat(7), END);
    expect(m.acuteDelta).toBeNull();
  });

  it('exclut la séance situee exactement 7 jours avant la fin de fenêtre', () => {
    const m = computePlayerMetrics([s(addDays(END, -7), 10, 60)], END);
    expect(m.sessionCount7d).toBe(0);
    expect(m.acute).toBe(0);
  });
});

describe('weeklySeries', () => {
  it('découpe en fenêtres glissantes de 7 jours se terminant a `end`', () => {
    const series = weeklySeries(flat(14), END, 2);
    expect(series).toHaveLength(2);
    expect(series[1].end).toBe(END);
    expect(series[1].start).toBe(addDays(END, -6));
    expect(series[1].load).toBe(700);
    expect(series[1].sessions).toBe(7);
    // La fenêtre précédente couvre les 7 jours d’avant, sans recouvrement.
    expect(series[0].end).toBe(addDays(END, -7));
    expect(series[0].load).toBe(700);
  });

  it('la dernière fenêtre coïncide avec la charge aiguë', () => {
    const sessions = flat(21);
    const series = weeklySeries(sessions, END, 3);
    expect(series[2].load).toBe(computePlayerMetrics(sessions, END).acute);
  });
});

describe('loadByType', () => {
  it('regroupe la charge par type sur la fenêtre demandee', () => {
    const sessions = [s(END, 8, 60, 'match'), s(addDays(END, -2), 6, 60, 'muscu'), s(addDays(END, -40), 9, 90, 'match')];
    const byType = loadByType(sessions, END, 28);
    expect(byType.get('match')).toBe(480);
    expect(byType.get('muscu')).toBe(360);
  });
});
