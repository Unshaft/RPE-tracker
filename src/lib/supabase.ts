import { createClient } from '@supabase/supabase-js';
import type { Role, SessionType } from './types';

/**
 * Schéma de la base, tel que le voit PostgREST. Décrit à la main plutôt que
 * généré : le modèle tient en trois tables et la génération demanderait le CLI
 * Supabase dans la boucle de build.
 *
 * Les colonnes sont en `snake_case` (convention Postgres) alors que l'app parle
 * `camelCase` : la traduction se fait dans `db.ts`, et nulle part ailleurs.
 */
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          first_name: string;
          last_name: string;
          role: Role;
          team_id: string | null;
          position: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          first_name?: string;
          last_name?: string;
          role?: Role;
          team_id?: string | null;
          position?: string | null;
        };
        Update: {
          first_name?: string;
          last_name?: string;
          position?: string | null;
          team_id?: string | null;
        };
        Relationships: [];
      };
      teams: {
        Row: {
          id: string;
          name: string;
          coach_id: string;
          invite_code: string;
          created_at: string;
        };
        Insert: { name: string; coach_id: string; invite_code: string };
        Update: { name?: string };
        Relationships: [];
      };
      training_sessions: {
        Row: {
          id: string;
          user_id: string;
          session_date: string;
          type: SessionType;
          duration_min: number;
          rpe: number;
          comment: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          session_date: string;
          type: SessionType;
          duration_min: number;
          rpe: number;
          comment?: string | null;
        };
        Update: {
          session_date?: string;
          type?: SessionType;
          duration_min?: number;
          rpe?: number;
          comment?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      join_team: {
        Args: { invite_code: string };
        Returns: Database['public']['Tables']['teams']['Row'];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Échouer ici, au chargement, plutôt que de laisser chaque requête partir en
  // erreur réseau opaque une fois l'utilisateur dans l'app.
  throw new Error(
    "Configuration Supabase absente. Lancer `vercel env pull` pour récupérer " +
      'SUPABASE_URL et SUPABASE_ANON_KEY dans .env.local.',
  );
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
