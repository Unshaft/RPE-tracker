export type Role = 'player' | 'coach';

export type SessionType =
  | 'entrainement'
  | 'match'
  | 'muscu'
  | 'individuel'
  | 'recuperation';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: Role;
  teamId: string | null;
  /** Poste / specialite, libre (ex: "Ailier", "Meneur"). */
  position?: string;
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  coachId: string;
  /** Code partage aux joueurs pour rejoindre l’équipe. */
  inviteCode: string;
  createdAt: string;
}

export interface TrainingSession {
  id: string;
  userId: string;
  /** Jour de la séance au format YYYY-MM-DD. */
  date: string;
  type: SessionType;
  /** Durée en minutes. */
  durationMin: number;
  /** RPE sur l’échelle CR-10 de Borg (1 a 10). */
  rpe: number;
  comment?: string;
  createdAt: string;
}

/** Utilisateur expose a l’UI : jamais de hash de mot de passe. */
export type PublicUser = Omit<User, 'passwordHash'>;

export const SESSION_TYPES: { value: SessionType; label: string; short: string }[] = [
  { value: 'entrainement', label: 'Entraînement', short: 'Entr.' },
  { value: 'match', label: 'Match', short: 'Match' },
  { value: 'muscu', label: 'Musculation', short: 'Muscu' },
  { value: 'individuel', label: 'Individuel', short: 'Indiv.' },
  { value: 'recuperation', label: 'Récupération', short: 'Recup' },
];

export const RPE_SCALE: { value: number; label: string }[] = [
  { value: 1, label: 'Très très facile' },
  { value: 2, label: 'Très facile' },
  { value: 3, label: 'Facile' },
  { value: 4, label: 'Modéré' },
  { value: 5, label: 'Un peu dur' },
  { value: 6, label: 'Dur' },
  { value: 7, label: 'Très dur' },
  { value: 8, label: 'Très très dur' },
  { value: 9, label: 'Proche du max' },
  { value: 10, label: 'Maximal' },
];
