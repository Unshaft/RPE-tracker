import { useMemo } from 'react';
import { useAuth } from './auth';
import * as db from './db';
import type { TrainingSession } from './types';

/** Séances d’un joueur, recalculees a chaque mutation (`revision`). */
export function usePlayerSessions(userId: string | undefined): TrainingSession[] {
  const { revision } = useAuth();
  return useMemo(
    () => (userId ? db.getSessionsByUser(userId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, revision],
  );
}

/** Séances de tous les joueurs d’une équipe, indexées par joueur. */
export function useTeamSessions(teamId: string | null | undefined) {
  const { revision } = useAuth();
  return useMemo(
    () => (teamId ? db.getSessionsByTeam(teamId) : new Map<string, TrainingSession[]>()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teamId, revision],
  );
}

export function useTeamPlayers(teamId: string | null | undefined) {
  const { revision } = useAuth();
  return useMemo(
    () => (teamId ? db.getTeamPlayers(teamId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teamId, revision],
  );
}
