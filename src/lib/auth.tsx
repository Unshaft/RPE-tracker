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
  /**
   * Crée le compte. Renvoie `needsEmailConfirmation` quand le projet Supabase
   * exige une confirmation : il n'y a alors pas encore de session.
   */
  register: (input: RegisterInput) => Promise<{ needsEmailConfirmation: boolean }>;
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
  return error.message;
}

/**
 * Applique le rattachement à une équipe demandé à l'inscription.
 *
 * Quand la confirmation d'e-mail est exigée, l'inscription ne produit aucune
 * session : impossible de créer l'équipe ou de rejoindre celle du coach dans la
 * foulée, puisque toute écriture passe par RLS. L'intention est donc rangée
 * dans les métadonnées du compte et rejouée ici, à la première connexion — puis
 * effacée pour ne pas être rejouée à chaque fois.
 */
async function settlePendingTeam(profile: PublicUser): Promise<PublicUser> {
  if (profile.teamId) return profile;

  const { data } = await supabase.auth.getUser();
  const meta = data.user?.user_metadata ?? {};
  const pendingTeamName = typeof meta.pending_team_name === 'string' ? meta.pending_team_name : '';
  const pendingCode = typeof meta.pending_invite_code === 'string' ? meta.pending_invite_code : '';
  if (!pendingTeamName && !pendingCode) return profile;

  try {
    const team = pendingTeamName
      ? await db.createTeam(pendingTeamName, profile.id)
      : await db.joinTeamByCode(pendingCode);
    await supabase.auth.updateUser({
      data: { pending_team_name: null, pending_invite_code: null },
    });
    return { ...profile, teamId: team.id };
  } catch {
    // Un code devenu invalide ne doit pas bloquer la connexion : l'utilisateur
    // pourra rejoindre son équipe depuis son profil.
    await supabase.auth.updateUser({
      data: { pending_team_name: null, pending_invite_code: null },
    });
    return profile;
  }
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

    let profile = await db.getProfile(userId);
    if (loadingFor.current !== userId) return;
    if (profile) profile = await settlePendingTeam(profile);
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
            // Rejoué à la première connexion par `settlePendingTeam` : sans
            // session, aucune écriture n'est possible ici.
            pending_team_name: input.role === 'coach' ? teamName : null,
            pending_invite_code: input.role === 'player' ? inviteCode || null : null,
          },
        },
      });
      if (error) throw new db.DbError(authMessage(error));

      const userId = data.user?.id;
      if (!userId) throw new db.DbError("La création du compte n'a pas abouti.");

      // Pas de session : le compte attend la confirmation de l'adresse e-mail.
      if (!data.session) return { needsEmailConfirmation: true };

      if (input.position?.trim()) {
        await db.updateProfile(userId, { position: input.position });
      }

      await loadProfile(userId);
      refresh();
      return { needsEmailConfirmation: false };
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
