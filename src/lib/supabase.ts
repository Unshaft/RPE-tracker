import { createClient } from '@supabase/supabase-js';
import type { LoadDomain, LoadModelCode, Role, SessionType } from './types';

/** Valeur jsonb telle que PostgREST la rend : la forme est validée côté base. */
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

/**
 * Schéma de la base, tel que le voit PostgREST. Décrit à la main plutôt que
 * généré : le modèle tient en cinq tables et la génération demanderait le CLI
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
          invite_code: string | null;
          invite_expires_at: string | null;
          invite_rotated_at: string;
          created_at: string;
        };
        // `never` et non un objet : l'`INSERT` est révoqué sur la table, une
        // équipe ne naît plus que de `create_team`. Le déclarer ici fait
        // échouer à la compilation ce qui échouerait sinon en production.
        Insert: never;
        // Le jeton d'invitation est absent : `UPDATE` lui est révoqué au niveau
        // colonne, il ne se manipule que par `rotate_team_invite` /
        // `revoke_team_invite`.
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
          inputs: Json;
          created_at: string;
        };
        Insert: {
          user_id: string;
          session_date: string;
          type: SessionType;
          duration_min: number;
          rpe: number;
          comment?: string | null;
          inputs?: Json;
        };
        Update: {
          session_date?: string;
          type?: SessionType;
          duration_min?: number;
          rpe?: number;
          comment?: string | null;
          inputs?: Json;
        };
        Relationships: [];
      };
      load_models: {
        Row: {
          code: LoadModelCode;
          domain: LoadDomain;
          label: string;
          reference: string;
          input_schema: Json;
          is_default: boolean;
        };
        // Catalogue en lecture seule : aucune policy d'écriture n'existe.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      team_load_models: {
        Row: {
          id: string;
          team_id: string;
          domain: LoadDomain;
          model_code: LoadModelCode;
          params: Json;
          effective_from: string;
          created_at: string;
        };
        Insert: {
          team_id: string;
          domain: LoadDomain;
          model_code: LoadModelCode;
          params?: Json;
          effective_from: string;
        };
        Update: {
          model_code?: LoadModelCode;
          params?: Json;
          effective_from?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      join_team: {
        Args: { invite_code: string };
        // `null` pour un code inconnu, révoqué, expiré — ou pour un appelant
        // qui a épuisé son quota de tentatives. Les quatre cas sont
        // volontairement indiscernables ; voir
        // `20260919130000_invitations_regenerables.sql`.
        Returns: Database['public']['Tables']['teams']['Row'] | null;
      };
      create_team: {
        Args: { team_name: string };
        Returns: Database['public']['Tables']['teams']['Row'];
      };
      rotate_team_invite: {
        Args: { expires_at: string | null };
        Returns: Database['public']['Tables']['teams']['Row'];
      };
      revoke_team_invite: {
        Args: Record<string, never>;
        Returns: Database['public']['Tables']['teams']['Row'];
      };
      delete_my_account: {
        Args: { confirm_team_deletion: boolean };
        Returns: void;
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
