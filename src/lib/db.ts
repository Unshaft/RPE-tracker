import type { PostgrestError } from '@supabase/supabase-js';
import { buildLoadContext, type LoadContext } from './loadModels';
import { supabase, type Database, type Json } from './supabase';
import type {
  LoadDomain,
  LoadModel,
  LoadModelInputSchema,
  LoadModelParams,
  PublicUser,
  SessionInputs,
  Team,
  TeamLoadModel,
  TrainingSession,
} from './types';

/**
 * Couche de persistance : Supabase (Postgres + RLS).
 *
 * C'est le seul fichier qui connaît la forme des tables. Les écrans parlent en
 * `camelCase` et en types du domaine ; la traduction depuis les colonnes
 * `snake_case` se fait ici, dans les fonctions `from*` ci-dessous.
 *
 * L'isolation des données n'est pas assurée par ce fichier mais par les
 * policies RLS : une requête qui tenterait de lire les séances d'un autre
 * joueur ne renverrait simplement aucune ligne.
 */

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type TeamRow = Database['public']['Tables']['teams']['Row'];
type SessionRow = Database['public']['Tables']['training_sessions']['Row'];
type LoadModelRow = Database['public']['Tables']['load_models']['Row'];
type TeamLoadModelRow = Database['public']['Tables']['team_load_models']['Row'];

export class DbError extends Error {}

/**
 * Traduit une erreur PostgREST en message affichable.
 *
 * Les codes Postgres remontent tels quels côté client ; on ne traduit que ceux
 * qui correspondent à une erreur d'usage réelle, le reste tombe dans un message
 * générique plutôt que d'exposer le détail interne de la base.
 */
function fail(error: PostgrestError, fallback: string): never {
  switch (error.code) {
    case '23505':
      throw new DbError('Cette valeur existe déjà.');
    case '23514':
      throw new DbError('Valeur hors des limites autorisées.');
    case '42501':
      throw new DbError("Tu n'as pas les droits pour cette action.");
    case 'P0002':
      throw new DbError("Code d'équipe inconnu.");
    case 'P0003':
      throw new DbError(
        'Supprimer ton compte supprimerait aussi ton équipe : confirme-le explicitement.',
      );
    case 'P0004':
      throw new DbError('Tu as déjà une équipe.');
    default:
      throw new DbError(fallback);
  }
}

// --- Traductions ligne ↔ domaine ------------------------------------------

function fromProfile(row: ProfileRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    teamId: row.team_id,
    position: row.position ?? undefined,
    createdAt: row.created_at,
  };
}

function fromTeam(row: TeamRow): Team {
  return {
    id: row.id,
    name: row.name,
    coachId: row.coach_id,
    inviteCode: row.invite_code,
    inviteExpiresAt: row.invite_expires_at,
    inviteRotatedAt: row.invite_rotated_at,
    createdAt: row.created_at,
  };
}

function fromSession(row: SessionRow): TrainingSession {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.session_date,
    type: row.type,
    durationMin: row.duration_min,
    rpe: row.rpe,
    comment: row.comment ?? undefined,
    inputs: fromInputs(row.inputs),
    createdAt: row.created_at,
  };
}

function asRecord(raw: Json): Record<string, Json> | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : null;
}

/**
 * Entrees additionnelles d'une seance.
 *
 * La forme du jsonb est garantie par un `check` en base ; ici on ne fait que
 * traduire les cles et ignorer ce qui est absent, pour qu'une seance saisie
 * avant l'arrivee d'un modele etendu reste parfaitement exploitable.
 */
function fromInputs(raw: Json): SessionInputs | undefined {
  const o = asRecord(raw);
  if (!o) return undefined;
  const exercises = Array.isArray(o.exercises)
    ? o.exercises.flatMap((item) => {
        const e = asRecord(item);
        return e
          ? [{ sets: Number(e.sets), reps: Number(e.reps), weightKg: Number(e.weight_kg) }]
          : [];
      })
    : undefined;
  const inputs: SessionInputs = {
    ...(typeof o.rpe_breathing === 'number' ? { rpeBreathing: o.rpe_breathing } : {}),
    ...(typeof o.rpe_muscular === 'number' ? { rpeMuscular: o.rpe_muscular } : {}),
    ...(exercises && exercises.length > 0 ? { exercises } : {}),
  };
  // `undefined` plutot qu'un objet vide : l'absence d'entrees etendues est
  // l'etat normal d'une seance session-RPE, pas une donnee a trimbaler.
  return Object.keys(inputs).length > 0 ? inputs : undefined;
}

function toInputs(inputs: SessionInputs | undefined): Json {
  if (!inputs) return {};
  return {
    ...(inputs.rpeBreathing !== undefined ? { rpe_breathing: inputs.rpeBreathing } : {}),
    ...(inputs.rpeMuscular !== undefined ? { rpe_muscular: inputs.rpeMuscular } : {}),
    ...(inputs.exercises?.length
      ? {
          exercises: inputs.exercises.map((e) => ({
            sets: e.sets,
            reps: e.reps,
            weight_kg: e.weightKg,
          })),
        }
      : {}),
  };
}

function fromLoadModel(row: LoadModelRow): LoadModel {
  return {
    code: row.code,
    domain: row.domain,
    label: row.label,
    reference: row.reference,
    inputSchema: (asRecord(row.input_schema) ?? {}) as LoadModelInputSchema,
    isDefault: row.is_default,
  };
}

/**
 * Parametres d'analyse : `snake_case` en base (le `check` connait ces noms-la),
 * `camelCase` dans l'app. La traduction est ecrite a la main plutot que
 * derivee du nom, pour qu'une cle inconnue ne traverse jamais cette frontiere.
 */
function fromParams(raw: Json): LoadModelParams {
  const o = asRecord(raw);
  if (!o) return {};
  const seuils = asRecord(o.acwr_thresholds ?? null);
  return {
    ...(typeof o.acute_window_days === 'number' ? { acuteWindowDays: o.acute_window_days } : {}),
    ...(typeof o.chronic_window_days === 'number'
      ? { chronicWindowDays: o.chronic_window_days }
      : {}),
    ...(o.chronic_method === 'rolling_average' || o.chronic_method === 'ewma'
      ? { chronicMethod: o.chronic_method }
      : {}),
    ...(typeof o.weekly_lookback_weeks === 'number'
      ? { weeklyLookbackWeeks: o.weekly_lookback_weeks }
      : {}),
    ...(seuils
      ? {
          acwrThresholds: {
            low: Number(seuils.low),
            optimalMax: Number(seuils.optimal_max),
            cautionMax: Number(seuils.caution_max),
          },
        }
      : {}),
  };
}

function toParams(params: LoadModelParams | undefined): Json {
  if (!params) return {};
  return {
    ...(params.acuteWindowDays !== undefined ? { acute_window_days: params.acuteWindowDays } : {}),
    ...(params.chronicWindowDays !== undefined
      ? { chronic_window_days: params.chronicWindowDays }
      : {}),
    ...(params.chronicMethod !== undefined ? { chronic_method: params.chronicMethod } : {}),
    ...(params.weeklyLookbackWeeks !== undefined
      ? { weekly_lookback_weeks: params.weeklyLookbackWeeks }
      : {}),
    ...(params.acwrThresholds
      ? {
          acwr_thresholds: {
            low: params.acwrThresholds.low,
            optimal_max: params.acwrThresholds.optimalMax,
            caution_max: params.acwrThresholds.cautionMax,
          },
        }
      : {}),
  };
}

function fromTeamLoadModel(row: TeamLoadModelRow): TeamLoadModel {
  return {
    id: row.id,
    teamId: row.team_id,
    domain: row.domain,
    modelCode: row.model_code,
    params: fromParams(row.params),
    effectiveFrom: row.effective_from,
    createdAt: row.created_at,
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// --- Profils --------------------------------------------------------------

export async function getProfile(id: string): Promise<PublicUser | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
  if (error) fail(error, 'Impossible de charger le profil.');
  return data ? fromProfile(data) : null;
}

export async function updateProfile(
  id: string,
  patch: Partial<Pick<PublicUser, 'firstName' | 'lastName' | 'position'>>,
): Promise<PublicUser> {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      ...(patch.firstName !== undefined ? { first_name: patch.firstName.trim() } : {}),
      ...(patch.lastName !== undefined ? { last_name: patch.lastName.trim() } : {}),
      ...(patch.position !== undefined ? { position: patch.position?.trim() || null } : {}),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) fail(error, 'Impossible d’enregistrer le profil.');
  return fromProfile(data);
}

/** Effectif d'une équipe, trié par nom de famille. */
export async function getTeamPlayers(teamId: string): Promise<PublicUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('team_id', teamId)
    .eq('role', 'player')
    .order('last_name', { ascending: true });
  if (error) fail(error, "Impossible de charger l'effectif.");
  return (data ?? []).map(fromProfile);
}

// --- Équipes --------------------------------------------------------------

export async function getTeam(id: string | null): Promise<Team | null> {
  if (!id) return null;
  const { data, error } = await supabase.from('teams').select('*').eq('id', id).maybeSingle();
  if (error) fail(error, "Impossible de charger l'équipe.");
  return data ? fromTeam(data) : null;
}

/**
 * Crée une équipe et y rattache son coach, en une transaction.
 *
 * Les deux écritures passaient auparavant par deux appels : un échec entre les
 * deux laissait un coach détaché de l'équipe qu'il venait de créer. La fonction
 * SECURITY DEFINER fait les deux ou aucune, et tire elle-même le code
 * d'invitation — le jeton qui ouvre l'effectif n'a pas à venir du navigateur.
 */
export async function createTeam(name: string): Promise<Team> {
  const trimmed = name.trim();
  if (!trimmed) throw new DbError('Donne un nom à ton équipe.');

  const { data, error } = await supabase.rpc('create_team', { team_name: trimmed });
  if (error) fail(error, "Impossible de créer l'équipe.");
  return fromTeam(data);
}

/**
 * Rejoint une équipe par son code.
 *
 * Passe par une fonction SECURITY DEFINER : les policies interdisent de lister
 * les équipes, sans quoi les codes seraient énumérables.
 *
 * L'absence de ligne vaut refus, sans distinguer le code inconnu du code
 * révoqué, expiré ou du quota de tentatives épuisé. C'est voulu côté base :
 * détailler la raison transformerait la limitation en oracle. Le message
 * affiché doit donc rester tout aussi vague.
 */
export async function joinTeamByCode(code: string): Promise<Team> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) throw new DbError("Saisis un code d'équipe.");

  const { data, error } = await supabase.rpc('join_team', { invite_code: trimmed });
  if (error) fail(error, "Code d'équipe inconnu.");
  if (!data) {
    throw new DbError(
      "Ce code d'équipe n'est pas valide. Vérifie-le auprès de ton coach, et " +
        'patiente quelques minutes avant de multiplier les essais.',
    );
  }
  return fromTeam(data);
}

/**
 * Régénère le jeton d'invitation de l'équipe du coach appelant.
 *
 * Le code précédent — et donc le lien déjà distribué — cesse de fonctionner à
 * l'instant même. C'est l'effet recherché quand un joueur quitte le club ;
 * c'est aussi pourquoi l'écran le fait confirmer.
 */
export async function rotateTeamInvite(expiresAt: string | null = null): Promise<Team> {
  const { data, error } = await supabase.rpc('rotate_team_invite', { expires_at: expiresAt });
  if (error) fail(error, "Impossible de régénérer le lien d'invitation.");
  return fromTeam(data);
}

/** Coupe l'invitation : plus aucun code ni lien ne permet de rejoindre. */
export async function revokeTeamInvite(): Promise<Team> {
  const { data, error } = await supabase.rpc('revoke_team_invite', {});
  if (error) fail(error, "Impossible de révoquer le lien d'invitation.");
  return fromTeam(data);
}

// --- Séances --------------------------------------------------------------

/** Séances d'un joueur, de la plus récente à la plus ancienne. */
export async function getSessionsByUser(userId: string): Promise<TrainingSession[]> {
  const { data, error } = await supabase
    .from('training_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('session_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) fail(error, "Impossible de charger l'historique.");
  return (data ?? []).map(fromSession);
}

/**
 * Séances de toute l'équipe, indexées par joueur.
 *
 * Une seule requête pour l'ensemble de l'effectif : une requête par joueur
 * ferait exploser le temps de chargement du tableau de bord coach. Les joueurs
 * sans aucune séance doivent tout de même apparaître (participation nulle),
 * d'où l'initialisation de la map à partir de l'effectif.
 */
export async function getSessionsByTeam(
  teamId: string,
): Promise<Map<string, TrainingSession[]>> {
  const players = await getTeamPlayers(teamId);
  const out = new Map<string, TrainingSession[]>(players.map((p) => [p.id, []]));
  if (players.length === 0) return out;

  const { data, error } = await supabase
    .from('training_sessions')
    .select('*')
    .in(
      'user_id',
      players.map((p) => p.id),
    )
    .order('session_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) fail(error, "Impossible de charger les séances de l'équipe.");

  for (const row of data ?? []) out.get(row.user_id)?.push(fromSession(row));
  return out;
}

export async function addSession(
  input: Omit<TrainingSession, 'id' | 'createdAt'>,
): Promise<TrainingSession> {
  const { data, error } = await supabase
    .from('training_sessions')
    .insert({
      user_id: input.userId,
      session_date: input.date,
      type: input.type,
      duration_min: input.durationMin,
      rpe: input.rpe,
      comment: input.comment?.trim() || null,
      inputs: toInputs(input.inputs),
    })
    .select('*')
    .single();
  if (error) fail(error, "Impossible d'enregistrer la séance.");
  return fromSession(data);
}

export async function updateSession(
  id: string,
  patch: Partial<Omit<TrainingSession, 'id' | 'userId' | 'createdAt'>>,
): Promise<void> {
  const { error } = await supabase
    .from('training_sessions')
    .update({
      ...(patch.date !== undefined ? { session_date: patch.date } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.durationMin !== undefined ? { duration_min: patch.durationMin } : {}),
      ...(patch.rpe !== undefined ? { rpe: patch.rpe } : {}),
      ...(patch.comment !== undefined ? { comment: patch.comment?.trim() || null } : {}),
      ...(patch.inputs !== undefined ? { inputs: toInputs(patch.inputs) } : {}),
    })
    .eq('id', id);
  if (error) fail(error, 'Impossible de modifier la séance.');
}

export async function deleteSession(id: string): Promise<void> {
  const { error } = await supabase.from('training_sessions').delete().eq('id', id);
  if (error) fail(error, 'Impossible de supprimer la séance.');
}

// --- Modeles de charge ----------------------------------------------------

/**
 * Catalogue des modeles disponibles.
 *
 * Lecture seule pour tout le monde : aucune policy d'ecriture n'existe, un
 * nouveau modele arrive par migration et par elle seule.
 */
export async function getLoadModelCatalog(): Promise<LoadModel[]> {
  const { data, error } = await supabase
    .from('load_models')
    .select('*')
    .order('domain', { ascending: true })
    .order('code', { ascending: true });
  if (error) fail(error, 'Impossible de charger les modeles de charge.');
  return (data ?? []).map(fromLoadModel);
}

/**
 * Tout l'historique des choix d'une equipe, du plus ancien au plus recent.
 *
 * L'historique entier et pas seulement le choix courant : les courbes se
 * recalculent seance par seance a la date de chaque seance, et resoudre le
 * modele point par point demanderait sinon une requete par point.
 */
export async function getTeamLoadModels(teamId: string): Promise<TeamLoadModel[]> {
  const { data, error } = await supabase
    .from('team_load_models')
    .select('*')
    .eq('team_id', teamId)
    .order('effective_from', { ascending: true });
  if (error) fail(error, "Impossible de charger les modeles de l'equipe.");
  return (data ?? []).map(fromTeamLoadModel);
}

/** Historique pret a etre passe aux fonctions de `metrics.ts`. */
export async function getTeamLoadContext(teamId: string | null): Promise<LoadContext> {
  if (!teamId) return buildLoadContext([]);
  return buildLoadContext(await getTeamLoadModels(teamId));
}

/**
 * Modele en vigueur pour un domaine a une date donnee.
 *
 * `null` quand rien n'a ete configure avant cette date : c'est alors le modele
 * par defaut du catalogue qui s'applique, et c'est a `loadModels.ts` de le
 * dire. La base n'invente pas de ligne pour une equipe qui n'a rien choisi.
 */
export async function getEffectiveTeamLoadModel(
  teamId: string,
  domain: LoadDomain,
  date: string,
): Promise<TeamLoadModel | null> {
  const { data, error } = await supabase
    .from('team_load_models')
    .select('*')
    .eq('team_id', teamId)
    .eq('domain', domain)
    .lte('effective_from', date)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail(error, 'Impossible de charger le modele de charge.');
  return data ? fromTeamLoadModel(data) : null;
}

/**
 * Enregistre le choix d'un coach pour un domaine, a partir d'une date.
 *
 * `upsert` sur (team_id, domain, effective_from) : re-choisir un modele pour
 * une date deja renseignee corrige la ligne existante au lieu d'echouer sur la
 * contrainte d'unicite. Du point de vue du coach, c'est le meme geste.
 */
export async function setTeamLoadModel(input: {
  teamId: string;
  domain: LoadDomain;
  modelCode: TeamLoadModel['modelCode'];
  params?: LoadModelParams;
  effectiveFrom: string;
}): Promise<TeamLoadModel> {
  const { data, error } = await supabase
    .from('team_load_models')
    .upsert(
      {
        team_id: input.teamId,
        domain: input.domain,
        model_code: input.modelCode,
        params: toParams(input.params),
        effective_from: input.effectiveFrom,
      },
      { onConflict: 'team_id,domain,effective_from' },
    )
    .select('*')
    .single();
  if (error) fail(error, "Impossible d'enregistrer le modele de charge.");
  return fromTeamLoadModel(data);
}

/** Retire un choix date, saisi par erreur. */
export async function deleteTeamLoadModel(id: string): Promise<void> {
  const { error } = await supabase.from('team_load_models').delete().eq('id', id);
  if (error) fail(error, 'Impossible de supprimer ce modele de charge.');
}

// --- RGPD -----------------------------------------------------------------

/**
 * Supprime le compte de l'appelant et tout ce qui en dépend.
 *
 * Irréversible, et sans passer par l'administration Supabase : c'est le droit à
 * l'effacement annoncé par la politique de confidentialité.
 *
 * `confirmTeamDeletion` ne concerne que les coachs : supprimer un coach
 * supprime son équipe, et détache ses joueurs (qui gardent, eux, leur compte et
 * leurs séances). La base refuse tant que ce n'est pas assumé explicitement,
 * plutôt que de faire disparaître une saison de travail par un clic de trop.
 */
export async function deleteMyAccount(confirmTeamDeletion = false): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account', {
    confirm_team_deletion: confirmTeamDeletion,
  });
  if (error) fail(error, 'Impossible de supprimer le compte.');
}
