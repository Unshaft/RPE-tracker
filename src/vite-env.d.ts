/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL du projet Supabase, injectée par vite.config.ts. */
  readonly VITE_SUPABASE_URL: string;
  /** Clé anon : publique, sa portée est bornée par les policies RLS. */
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
