import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as db from './db';
import { seedDemoData } from './seed';
import type { PublicUser, Role, Team } from './types';

interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: Role;
  /** Coach : nom de l’équipe créée. Joueur : code d’invitation. */
  teamName?: string;
  inviteCode?: string;
  position?: string;
}

interface AuthContextValue {
  user: PublicUser | null;
  team: Team | null;
  ready: boolean;
  /** Incremente a chaque mutation de données : sert de cle de rafraichissement. */
  revision: number;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
  updateProfile: (patch: Partial<Pick<PublicUser, 'firstName' | 'lastName' | 'position'>>) => void;
  joinTeam: (code: string) => void;
  /** Coach : créé une équipe et s’y rattaché. */
  createOwnTeam: (name: string) => Team;
  refresh: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(() => setRevision((r) => r + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await seedDemoData();
      if (cancelled) return;
      const id = db.getCurrentUserId();
      const found = id ? db.getUser(id) : undefined;
      setUser(found ? db.toPublicUser(found) : null);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const found = db.findUserByEmail(email);
    if (!found) throw new db.DbError('Aucun compte avec cet e-mail.');
    const hash = await db.hashPassword(password);
    if (hash !== found.passwordHash) throw new db.DbError('Mot de passe incorrect.');
    db.setCurrentUserId(found.id);
    setUser(db.toPublicUser(found));
    refresh();
  }, [refresh]);

  const register = useCallback(async (input: RegisterInput) => {
    const email = db.normalizeEmail(input.email);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new db.DbError('Adresse e-mail invalide.');
    }
    if (input.password.length < 6) {
      throw new db.DbError('Le mot de passe doit faire au moins 6 caractères.');
    }
    if (db.findUserByEmail(email)) {
      throw new db.DbError('Un compte existe déjà avec cet e-mail.');
    }

    let teamId: string | null = null;
    if (input.role === 'player') {
      const code = (input.inviteCode ?? '').trim();
      if (code) {
        const team = db.findTeamByCode(code);
        if (!team) throw new db.DbError("Code d’équipe inconnu.");
        teamId = team.id;
      }
    }

    const newUser = {
      id: db.uid('user'),
      email,
      passwordHash: await db.hashPassword(input.password),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      role: input.role,
      teamId,
      position: input.position?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    if (input.role === 'coach') {
      const name = (input.teamName ?? '').trim();
      if (!name) throw new db.DbError("Donne un nom à ton équipe.");
      const team = db.createTeam(name, newUser.id);
      newUser.teamId = team.id;
    }

    db.upsertUser(newUser);
    db.setCurrentUserId(newUser.id);
    setUser(db.toPublicUser(newUser));
    refresh();
  }, [refresh]);

  const logout = useCallback(() => {
    db.setCurrentUserId(null);
    setUser(null);
    refresh();
  }, [refresh]);

  const updateProfile = useCallback<AuthContextValue['updateProfile']>((patch) => {
    setUser((current) => {
      if (!current) return current;
      const stored = db.getUser(current.id);
      if (!stored) return current;
      const next = { ...stored, ...patch };
      db.upsertUser(next);
      return db.toPublicUser(next);
    });
    refresh();
  }, [refresh]);

  const joinTeam = useCallback((code: string) => {
    const team = db.findTeamByCode(code);
    if (!team) throw new db.DbError("Code d’équipe inconnu.");
    setUser((current) => {
      if (!current) return current;
      const stored = db.getUser(current.id);
      if (!stored) return current;
      const next = { ...stored, teamId: team.id };
      db.upsertUser(next);
      return db.toPublicUser(next);
    });
    refresh();
  }, [refresh]);

  const createOwnTeam = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) throw new db.DbError("Donne un nom à ton équipe.");
    const current = db.getCurrentUserId();
    const stored = current ? db.getUser(current) : undefined;
    if (!stored) throw new db.DbError('Session expirée, reconnecte-toi.');
    const created = db.createTeam(trimmed, stored.id);
    const next = { ...stored, teamId: created.id };
    db.upsertUser(next);
    setUser(db.toPublicUser(next));
    refresh();
    return created;
  }, [refresh]);

  const team = useMemo(
    () => (user ? db.getTeam(user.teamId) ?? null : null),
    // `revision` capture les changements d’équipe (création, adhesion).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, revision],
  );

  const value = useMemo(
    () => ({ user, team, ready, revision, login, register, logout, updateProfile, joinTeam, createOwnTeam, refresh }),
    [user, team, ready, revision, login, register, logout, updateProfile, joinTeam, createOwnTeam, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit etre utilise dans un AuthProvider.');
  return ctx;
}
