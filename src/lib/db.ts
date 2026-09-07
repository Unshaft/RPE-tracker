import type { PublicUser, Team, TrainingSession, User } from './types';

/**
 * Couche de persistance.
 *
 * Implementation locale (localStorage) volontairement isolée derriere une API
 * asynchrone : brancher une vraie API REST / Supabase revient a réécrire ce
 * seul fichier, sans toucher aux écrans.
 */

const KEYS = {
  users: 'rpe.users',
  teams: 'rpe.teams',
  sessions: 'rpe.sessions',
  currentUser: 'rpe.currentUser',
  seeded: 'rpe.seedVersion',
} as const;

export class DbError extends Error {}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function uid(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}

/**
 * Hachage SHA-256 salé. Suffisant pour une demo 100 % locale ; une vraie mise
 * en production doit déléguer l’authentification a un backend (bcrypt/argon2).
 */
export async function hashPassword(password: string, salt = 'rpe-tracker'): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _ignored, ...rest } = user;
  return rest;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function makeInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

// --- Utilisateurs ---------------------------------------------------------

export function getUsers(): User[] {
  return read<User[]>(KEYS.users, []);
}

export function saveUsers(users: User[]): void {
  write(KEYS.users, users);
}

export function findUserByEmail(email: string): User | undefined {
  const target = normalizeEmail(email);
  return getUsers().find((u) => u.email === target);
}

export function getUser(id: string): User | undefined {
  return getUsers().find((u) => u.id === id);
}

export function upsertUser(user: User): void {
  const users = getUsers();
  const i = users.findIndex((u) => u.id === user.id);
  if (i >= 0) users[i] = user;
  else users.push(user);
  saveUsers(users);
}

export function getTeamPlayers(teamId: string): PublicUser[] {
  return getUsers()
    .filter((u) => u.role === 'player' && u.teamId === teamId)
    .map(toPublicUser)
    .sort((a, b) => a.lastName.localeCompare(b.lastName));
}

// --- Équipes --------------------------------------------------------------

export function getTeams(): Team[] {
  return read<Team[]>(KEYS.teams, []);
}

export function saveTeams(teams: Team[]): void {
  write(KEYS.teams, teams);
}

export function getTeam(id: string | null): Team | undefined {
  if (!id) return undefined;
  return getTeams().find((t) => t.id === id);
}

export function findTeamByCode(code: string): Team | undefined {
  const target = code.trim().toUpperCase();
  return getTeams().find((t) => t.inviteCode === target);
}

export function createTeam(name: string, coachId: string): Team {
  const team: Team = {
    id: uid('team'),
    name: name.trim(),
    coachId,
    inviteCode: makeInviteCode(),
    createdAt: new Date().toISOString(),
  };
  saveTeams([...getTeams(), team]);
  return team;
}

// --- Séances --------------------------------------------------------------

export function getAllSessions(): TrainingSession[] {
  return read<TrainingSession[]>(KEYS.sessions, []);
}

export function saveAllSessions(sessions: TrainingSession[]): void {
  write(KEYS.sessions, sessions);
}

/** Séances d’un joueur, triées de la plus récente a la plus ancienne. */
export function getSessionsByUser(userId: string): TrainingSession[] {
  return getAllSessions()
    .filter((s) => s.userId === userId)
    .sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));
}

export function getSessionsByTeam(teamId: string): Map<string, TrainingSession[]> {
  const playerIds = new Set(getTeamPlayers(teamId).map((p) => p.id));
  const out = new Map<string, TrainingSession[]>();
  for (const id of playerIds) out.set(id, []);
  for (const s of getAllSessions()) {
    if (playerIds.has(s.userId)) out.get(s.userId)!.push(s);
  }
  return out;
}

export function addSession(input: Omit<TrainingSession, 'id' | 'createdAt'>): TrainingSession {
  const session: TrainingSession = {
    ...input,
    id: uid('sess'),
    createdAt: new Date().toISOString(),
  };
  saveAllSessions([...getAllSessions(), session]);
  return session;
}

export function updateSession(id: string, patch: Partial<TrainingSession>): void {
  saveAllSessions(getAllSessions().map((s) => (s.id === id ? { ...s, ...patch, id: s.id } : s)));
}

export function deleteSession(id: string): void {
  saveAllSessions(getAllSessions().filter((s) => s.id !== id));
}

// --- Session courante -----------------------------------------------------

export function getCurrentUserId(): string | null {
  return read<string | null>(KEYS.currentUser, null);
}

export function setCurrentUserId(id: string | null): void {
  if (id === null) localStorage.removeItem(KEYS.currentUser);
  else write(KEYS.currentUser, id);
}

// --- Amorcage / reinitialisation ------------------------------------------

export function isSeeded(version: string): boolean {
  return read<string | null>(KEYS.seeded, null) === version;
}

export function markSeeded(version: string): void {
  write(KEYS.seeded, version);
}

export function resetAll(): void {
  for (const key of Object.values(KEYS)) localStorage.removeItem(key);
}
