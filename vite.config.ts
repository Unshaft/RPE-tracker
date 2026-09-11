import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * L'intégration Supabase de Vercel fournit `SUPABASE_URL` / `SUPABASE_ANON_KEY`
 * (et leurs jumeaux `NEXT_PUBLIC_*`), mais Vite n'expose au navigateur que les
 * variables préfixées `VITE_`. Plutôt que de dupliquer les valeurs dans une
 * seconde paire de variables — deux sources de vérité à garder synchronisées —
 * on les réinjecte ici sous le nom attendu par le client.
 *
 * En local elles viennent de `.env.local` (via loadEnv), sur Vercel de
 * l'environnement du build. Ce sont des valeurs publiques par nature : l'URL du
 * projet et la clé anon, dont la portée est bornée par les policies RLS.
 */
export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), '');
  const pick = (...names: string[]) =>
    names.map((n) => fileEnv[n] ?? process.env[n]).find(Boolean) ?? '';

  const supabaseUrl = pick('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL');
  const supabaseAnonKey = pick(
    'SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'VITE_SUPABASE_ANON_KEY',
  );

  return {
    plugins: [react()],
    server: { port: 5173, host: true },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
    },
  };
});
