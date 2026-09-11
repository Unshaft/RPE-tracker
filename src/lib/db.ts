import type { PostgrestError } from '@supabase/supabase-js';
import { supabase, type Database } from './supabase';
import type { PublicUser, Team, TrainingSession } from './types';

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
    createdAt: row.created_at,
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Code d'invitation à 6 caractères, sans les glyphes ambigus (0/O, 1/I) : il
 * est lu à voix haute ou recopié depuis un écran.
 */
export function makeInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
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
 * Crée une équipe et y rattache son coach.
 *
 * Le code d'invitation est tiré au sort : en cas de collision (contrainte
 * d'unicité), on retente avec un autre code plutôt que de faire échouer la
 * création sous les yeux du coach.
 */
export async function createTeam(name: string, coachId: string): Promise<Team> {
  const trimmed = name.trim();
  if (!trimmed) throw new DbError('Donne un nom à ton équipe.');

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from('teams')
      .insert({ name: trimmed, coach_id: coachId, invite_code: makeInviteCode() })
      .select('*')
      .single();

    if (!error) {
      const team = fromTeam(data);
      const { error: linkError } = await supabase
        .from('profiles')
        .update({ team_id: team.id })
        .eq('id', coachId);
      if (linkError) fail(linkError, "Équipe créée, mais impossible de t'y rattacher.");
      return team;
    }

    if (error.code !== '23505') fail(error, "Impossible de créer l'équipe.");
  }

  throw new DbError("Impossible de générer un code d'invitation, réessaie.");
}

/**
 * Rejoint une équipe par son code.
 *
 * Passe par une fonction SECURITY DEFINER : les policies interdisent de lister
 * les équipes, sans quoi les codes seraient énumérables.
 */
export async function joinTeamByCode(code: string): Promise<Team> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) throw new DbError("Saisis un code d'équipe.");

  const { data, error } = await supabase.rpc('join_team', { invite_code: trimmed });
  if (error) fail(error, "Code d'équipe inconnu.");
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
    })
    .eq('id', id);
  if (error) fail(error, 'Impossible de modifier la séance.');
}

export async function deleteSession(id: string): Promise<void> {
  const { error } = await supabase.from('training_sessions').delete().eq('id', id);
  if (error) fail(error, 'Impossible de supprimer la séance.');
}
