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
  /**
   * Jeton d’invitation : le code dicté au bord du terrain et le lien partagé
   * sont la même valeur. `null` = invitation révoquée, plus personne n’entre.
   */
  inviteCode: string | null;
  /** Fin de validité du jeton. `null` = pas d’expiration. */
  inviteExpiresAt: string | null;
  /** Dernière régénération ou révocation, affichée au coach. */
  inviteRotatedAt: string;
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
  /** Entrées propres aux modèles étendus. Vide pour une séance session-RPE. */
  inputs?: SessionInputs;
  createdAt: string;
}

/* ------------------------------------------------------------------ *
 * Modèles de charge
 *
 * La formule qui transforme une séance en unités arbitraires n’est plus
 * codée en dur : chaque équipe choisit la sienne dans un catalogue fermé,
 * séparément pour le terrain et la musculation, avec une date d’effet.
 * ------------------------------------------------------------------ */

export type LoadDomain = 'field' | 'strength';

export type LoadModelCode =
  | 'foster_srpe'
  | 'srpe_differentiated'
  | 'foster_srpe_strength'
  | 'volume_load';

/** Seuils de lecture du ratio charge récente / charge habituelle. */
export interface AcwrThresholds {
  low: number;
  optimalMax: number;
  cautionMax: number;
}

/**
 * Surcharges des paramètres d’analyse. Tout est optionnel : une valeur absente
 * vaut le défaut publié (cf. `DEFAULT_LOAD_PARAMS`), ce qui évite d’avoir à
 * réécrire les choix d’une équipe chaque fois qu’un paramètre est ajouté.
 */
export interface LoadModelParams {
  /** Fenêtre de charge aiguë, en jours (3 à 14). */
  acuteWindowDays?: number;
  /** Fenêtre de charge chronique, en jours (14 à 56). */
  chronicWindowDays?: number;
  chronicMethod?: 'rolling_average' | 'ewma';
  acwrThresholds?: AcwrThresholds;
  /** Semaines calendaires de référence du ratio hebdomadaire (2 à 8). */
  weeklyLookbackWeeks?: number;
}

/** Paramètres une fois les défauts appliqués : plus rien d’optionnel. */
export type ResolvedLoadParams = Required<LoadModelParams>;

/** Une entrée du catalogue, en lecture seule côté client. */
export interface LoadModel {
  code: LoadModelCode;
  domain: LoadDomain;
  label: string;
  /** Citation de la littérature, ex. « Foster et al., 1998 ». */
  reference: string;
  /** Champs à demander au joueur ; pilote le formulaire de saisie. */
  inputSchema: LoadModelInputSchema;
  isDefault: boolean;
}

export interface LoadModelInputField {
  key: string;
  /** `column` = colonne dédiée de `training_sessions`, `inputs` = jsonb. */
  source: 'column' | 'inputs';
  type: 'integer' | 'number' | 'array';
  min?: number;
  max?: number;
  required?: boolean;
  /** Pour un champ `array` : description d’un élément de la liste. */
  item?: Omit<LoadModelInputField, 'source' | 'item'>[];
}

export interface LoadModelInputSchema {
  fields?: LoadModelInputField[];
}

/** Choix d’une équipe pour un domaine, à partir d’une date. */
export interface TeamLoadModel {
  id: string;
  teamId: string;
  domain: LoadDomain;
  modelCode: LoadModelCode;
  params: LoadModelParams;
  /** Date d’effet au format YYYY-MM-DD. */
  effectiveFrom: string;
  /**
   * Optionnel : le contrat ne l’expose pas, mais la base l’horodate et l’écran
   * de configuration a besoin de distinguer deux choix saisis le même jour.
   */
  createdAt?: string;
}

export interface SessionExercise {
  sets: number;
  reps: number;
  weightKg: number;
}

export interface SessionInputs {
  rpeBreathing?: number;
  rpeMuscular?: number;
  exercises?: SessionExercise[];
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
