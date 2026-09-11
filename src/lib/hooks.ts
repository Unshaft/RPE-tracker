import { useEffect, useState } from 'react';
import { useAuth } from './auth';
import * as db from './db';
import type { PublicUser, TrainingSession } from './types';

/**
 * Résultat d'un chargement distant.
 *
 * `data` porte toujours une valeur utilisable (liste ou map vide), pour que les
 * écrans n'aient pas à distinguer « pas encore chargé » de « vide » dans leurs
 * calculs ; `loading` sert uniquement à choisir quoi afficher.
 */
export interface Async<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

const EMPTY_SESSIONS: TrainingSession[] = [];
const EMPTY_PLAYERS: PublicUser[] = [];

/**
 * Charge une valeur distante et la recharge quand `deps` change.
 *
 * Les réponses obsolètes sont ignorées : si l'utilisateur change d'écran ou de
 * joueur pendant une requête lente, la réponse tardive ne doit pas écraser
 * l'affichage courant.
 */
function useAsync<T>(load: () => Promise<T>, fallback: T, deps: unknown[]): Async<T> {
  const [state, setState] = useState<Async<T>>({ data: fallback, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    load().then(
      (data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      },
      (err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Chargement impossible.';
        setState({ data: fallback, loading: false, error: message });
      },
    );

    return () => {
      cancelled = true;
    };
    // `load` et `fallback` sont recréés à chaque rendu : les dépendances réelles
    // sont celles que l'appelant déclare, plus la révision des données.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

/** Séances d'un joueur, rechargées à chaque mutation (`revision`). */
export function usePlayerSessions(userId: string | undefined): Async<TrainingSession[]> {
  const { revision } = useAuth();
  return useAsync(
    () => (userId ? db.getSessionsByUser(userId) : Promise.resolve(EMPTY_SESSIONS)),
    EMPTY_SESSIONS,
    [userId, revision],
  );
}

/** Séances de tous les joueurs d'une équipe, indexées par joueur. */
export function useTeamSessions(
  teamId: string | null | undefined,
): Async<Map<string, TrainingSession[]>> {
  const { revision } = useAuth();
  return useAsync(
    () => (teamId ? db.getSessionsByTeam(teamId) : Promise.resolve(new Map())),
    new Map<string, TrainingSession[]>(),
    [teamId, revision],
  );
}

export function useTeamPlayers(teamId: string | null | undefined): Async<PublicUser[]> {
  const { revision } = useAuth();
  return useAsync(
    () => (teamId ? db.getTeamPlayers(teamId) : Promise.resolve(EMPTY_PLAYERS)),
    EMPTY_PLAYERS,
    [teamId, revision],
  );
}
