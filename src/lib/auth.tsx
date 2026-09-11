import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AuthError } from '@supabase/supabase-js';
import * as db from './db';
import { supabase } from './supabase';
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
  /** Incrémenté à chaque mutation : sert de clé de rafraîchissement aux hooks. */
  revision: number;
  login: (email: string, password: string) => Promise<void>;
  /** Crée le compte, l'équipe associée, et ouvre la session dans la foulée. */
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (
    patch: Partial<Pick<PublicUser, 'firstName' | 'lastName' | 'position'>>,
  ) => Promise<void>;
  joinTeam: (code: string) => Promise<void>;
  /** Coach : crée une équipe et s’y rattache. */
  createOwnTeam: (name: string) => Promise<Team>;
  refresh: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Messages de Supabase Auth traduits ; le reste reste tel quel. */
function authMessage(error: AuthError): string {
  if (/invalid login credentials/i.test(error.message)) {
    return 'E-mail ou mot de passe incorrect.';
  }
  if (/user already registered|already been registered/i.test(error.message)) {
    return 'Un compte existe déjà avec cet e-mail.';
  }
  if (/password should be at least/i.test(error.message)) {
    return 'Le mot de passe doit faire au moins 6 caractères.';
  }
  if (/email address.*invalid|unable to validate email/i.test(error.message)) {
    return 'Adresse e-mail invalide.';
  }
  // Le fournisseur d'e-mail integre de Supabase plafonne a 2 envois par heure,
  // et impose 60 s entre deux demandes pour un meme compte. Sans message dedie,
  // l'utilisateur voit un texte anglais brut et croit a un bug de l'app.
  if (/for security purposes.*after \d+ seconds|only request this after/i.test(error.message)) {
    return 'Trop de tentatives rapprochées. Patiente une minute avant de réessayer.';
  }
  if (/rate limit|too many requests/i.test(error.message)) {
    return (
      "Limite d'envoi d'e-mails atteinte pour le moment. Réessaie dans une heure, " +
      'ou contacte ton coach si le problème persiste.'
    );
  }
  return error.message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(() => setRevision((r) => r + 1), []);

  /**
   * Identifiant de la session en cours de chargement.
   *
   * Le profil se charge de façon asynchrone après l'événement d'auth ; si deux
   * événements s'enchaînent (reconnexion rapide, rafraîchissement de jeton),
   * la réponse la plus lente ne doit pas écraser la plus récente.
   */
  const loadingFor = useRef<string | null>(null);

  const loadProfile = useCallback(async (userId: string | null) => {
    loadingFor.current = userId;

    if (!userId) {
      setUser(null);
      setTeam(null);
      return;
    }

    const profile = await db.getProfile(userId);
    if (loadingFor.current !== userId) return;
    setUser(profile);

    const found = profile?.teamId ? await db.getTeam(profile.teamId) : null;
    if (loadingFor.current !== userId) return;
    setTeam(found);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // `onAuthStateChange` émet aussi la session initiale : pas besoin d'un
    // getSession() séparé, qui produirait un double chargement du profil.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      void loadProfile(session?.user.id ?? null).finally(() => {
        if (!cancelled) setReady(true);
      });
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: db.normalizeEmail(email),
      password,
    });
    if (error) throw new db.DbError(authMessage(error));
    // Le profil est chargé par onAuthStateChange.
  }, []);

  const register = useCallback(
    async (input: RegisterInput) => {
      const email = db.normalizeEmail(input.email);
      const teamName = (input.teamName ?? '').trim();
      const inviteCode = (input.inviteCode ?? '').trim();

      // Validé avant la création du compte : un coach sans nom d'équipe
      // laisserait un compte orphelin qu'il faudrait rattraper ensuite.
      if (input.role === 'coach' && !teamName) {
        throw new db.DbError('Donne un nom à ton équipe.');
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password: input.password,
        options: {
          data: {
            first_name: input.firstName.trim(),
            last_name: input.lastName.trim(),
            role: input.role,
            position: input.position?.trim() || null,
          },
        },
      });
      if (error) throw new db.DbError(authMessage(error));

      const userId = data.user?.id;
      if (!userId) throw new db.DbError("La création du compte n'a pas abouti.");

      // L'inscription ouvre la session immédiatement. Sans session, c'est que
      // « Confirm email » est reste actif cote Supabase : on le dit clairement
      // plutot que de laisser un compte sans equipe, que RLS rendrait inutile.
      if (!data.session) {
        throw new db.DbError(
          'Le compte a été créé mais la confirmation par e-mail est encore ' +
            'activée sur le projet Supabase. Désactive « Confirm email » dans ' +
            'Authentication → Sign In / Providers.',
        );
      }

      // Session ouverte : les écritures passent RLS, l'équipe est reglée ici.
      if (input.role === 'coach') {
        await db.createTeam(teamName, userId);
      } else if (inviteCode) {
        try {
          await db.joinTeamByCode(inviteCode);
        } catch {
          // Un code faux ne doit pas faire echouer une inscription deja actee :
          // le joueur rejoindra son equipe depuis son profil.
        }
      }

      if (input.position?.trim()) {
        await db.updateProfile(userId, { position: input.position });
      }

      await loadProfile(userId);
      refresh();
    },
    [loadProfile, refresh],
  );

  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw new db.DbError(authMessage(error));
    setUser(null);
    setTeam(null);
    refresh();
  }, [refresh]);

  const updateProfile = useCallback<AuthContextValue['updateProfile']>(
    async (patch) => {
      if (!user) throw new db.DbError('Session expirée, reconnecte-toi.');
      setUser(await db.updateProfile(user.id, patch));
      refresh();
    },
    [user, refresh],
  );

  const joinTeam = useCallback(
    async (code: string) => {
      if (!user) throw new db.DbError('Session expirée, reconnecte-toi.');
      const joined = await db.joinTeamByCode(code);
      setUser({ ...user, teamId: joined.id });
      setTeam(joined);
      refresh();
    },
    [user, refresh],
  );

  const createOwnTeam = useCallback(
    async (name: string) => {
      if (!user) throw new db.DbError('Session expirée, reconnecte-toi.');
      const created = await db.createTeam(name, user.id);
      setUser({ ...user, teamId: created.id });
      setTeam(created);
      refresh();
      return created;
    },
    [user, refresh],
  );

  const value = useMemo(
    () => ({
      user,
      team,
      ready,
      revision,
      login,
      register,
      logout,
      updateProfile,
      joinTeam,
      createOwnTeam,
      refresh,
    }),
    [
      user,
      team,
      ready,
      revision,
      login,
      register,
      logout,
      updateProfile,
      joinTeam,
      createOwnTeam,
      refresh,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans un AuthProvider.');
  return ctx;
}
