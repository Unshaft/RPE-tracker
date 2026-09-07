import { addDays, startOfWeek, today } from './date';
import {
  getUsers,
  hashPassword,
  isSeeded,
  markSeeded,
  saveAllSessions,
  saveTeams,
  saveUsers,
  uid,
} from './db';
import type { SessionType, Team, TrainingSession, User } from './types';

const SEED_VERSION = 'v1';
export const DEMO_PASSWORD = 'demo1234';

/** PRNG deterministe : le jeu de démonstration est identique a chaque install. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Profile = 'regulier' | 'surcharge' | 'blesse' | 'irregulier' | 'progressif';

const PLAYERS: { first: string; last: string; position: string; profile: Profile }[] = [
  { first: 'Lucas', last: 'Bertrand', position: 'Ailier', profile: 'regulier' },
  { first: 'Nina', last: 'Cordier', position: 'Meneuse', profile: 'progressif' },
  { first: 'Amine', last: 'Daoudi', position: 'Pivot', profile: 'surcharge' },
  { first: 'Sarah', last: 'Fontaine', position: 'Arrière', profile: 'blesse' },
  { first: 'Théo', last: 'Girard', position: 'Ailier fort', profile: 'irregulier' },
  { first: 'Jade', last: 'Lemaire', position: 'Meneuse', profile: 'regulier' },
  { first: 'Yanis', last: 'Moreau', position: 'Arrière', profile: 'progressif' },
  { first: 'Clara', last: 'Nguyen', position: 'Pivot', profile: 'regulier' },
];

interface Slot {
  dayOfWeek: number; // 0 = lundi
  type: SessionType;
  duration: number;
  rpe: number;
}

const BASE_WEEK: Slot[] = [
  { dayOfWeek: 0, type: 'muscu', duration: 50, rpe: 6 },
  { dayOfWeek: 1, type: 'entrainement', duration: 90, rpe: 7 },
  { dayOfWeek: 3, type: 'entrainement', duration: 85, rpe: 6 },
  { dayOfWeek: 4, type: 'individuel', duration: 40, rpe: 5 },
  { dayOfWeek: 5, type: 'match', duration: 80, rpe: 9 },
  { dayOfWeek: 6, type: 'recuperation', duration: 30, rpe: 2 },
];

const COMMENTS = [
  'Bonnes sensations',
  'Jambes lourdes en fin de séance',
  'Beaucoup d’intensité sur les oppositions',
  'Séance courte mais rythmee',
  'Encore un peu de fatigue de la veille',
  '',
  '',
  '',
];

/**
 * Facteur de charge applique a une semaine (0 = semaine la plus ancienne,
 * `weeks - 1` = semaine en cours) selon le profil du joueur.
 */
function weekFactor(profile: Profile, index: number, weeks: number): number {
  const last = weeks - 1;
  switch (profile) {
    case 'surcharge':
      return index >= last - 1 ? 1.45 : 0.95;
    case 'blesse':
      return index === last ? 0.15 : index === last - 1 ? 0.5 : 1;
    case 'progressif':
      return 0.75 + (0.4 * index) / last;
    case 'irregulier':
      return index % 2 === 0 ? 0.6 : 1.2;
    default:
      return 1;
  }
}

function buildSessions(userId: string, seed: number, profile: Profile, weeks: number): TrainingSession[] {
  const rand = mulberry32(seed);
  const currentMonday = startOfWeek(today());
  const out: TrainingSession[] = [];

  for (let w = 0; w < weeks; w++) {
    const monday = addDays(currentMonday, -7 * (weeks - 1 - w));
    const factor = weekFactor(profile, w, weeks);
    for (const slot of BASE_WEEK) {
      const date = addDays(monday, slot.dayOfWeek);
      if (date > today()) continue;
      // Presence : plus la semaine est allegee, plus le joueur saute de séances.
      if (rand() > Math.min(0.97, 0.35 + factor * 0.62)) continue;

      const duration = Math.max(
        15,
        Math.round((slot.duration * factor * (0.9 + rand() * 0.2)) / 5) * 5,
      );
      const rpe = Math.min(
        10,
        Math.max(1, Math.round(slot.rpe * (factor > 1 ? 1.08 : 1) + (rand() * 2 - 1))),
      );
      out.push({
        id: uid('sess'),
        userId,
        date,
        type: slot.type,
        durationMin: duration,
        rpe,
        comment: COMMENTS[Math.floor(rand() * COMMENTS.length)] || undefined,
        createdAt: new Date(`${date}T19:30:00`).toISOString(),
      });
    }
  }
  return out;
}

/** Créé le jeu de démonstration au premier lancement (idempotent). */
export async function seedDemoData(): Promise<void> {
  if (isSeeded(SEED_VERSION) || getUsers().length > 0) return;

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const now = new Date().toISOString();

  const team: Team = {
    id: uid('team'),
    name: 'AS Riviera - Seniors',
    coachId: '',
    inviteCode: 'RIV2026',
    createdAt: now,
  };

  const coach: User = {
    id: uid('user'),
    email: 'coach@demo.fr',
    passwordHash,
    firstName: 'Marc',
    lastName: 'Aubert',
    role: 'coach',
    teamId: team.id,
    createdAt: now,
  };
  team.coachId = coach.id;

  const users: User[] = [coach];
  const sessions: TrainingSession[] = [];

  PLAYERS.forEach((p, i) => {
    const user: User = {
      id: uid('user'),
      // Le premier joueur sert de compte de démonstration documente.
      email: i === 0 ? 'joueur@demo.fr' : `${p.first}.${p.last}@demo.fr`.toLowerCase(),
      passwordHash,
      firstName: p.first,
      lastName: p.last,
      role: 'player',
      teamId: team.id,
      position: p.position,
      createdAt: now,
    };
    users.push(user);
    sessions.push(...buildSessions(user.id, 1000 + i * 37, p.profile, 10));
  });

  saveTeams([team]);
  saveUsers(users);
  saveAllSessions(sessions);
  markSeeded(SEED_VERSION);
}
