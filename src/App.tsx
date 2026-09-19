import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell, BottomNav } from './components/Layout';
import { useAuth } from './lib/auth';
import type { Role } from './lib/types';
import { CoachDashboard } from './pages/coach/CoachDashboard';
import { LoadModelSettings } from './pages/coach/LoadModelSettings';
import { PlayerDetail } from './pages/coach/PlayerDetail';
import { Roster } from './pages/coach/Roster';
import { Cgu } from './pages/legal/Cgu';
import { Cgv } from './pages/legal/Cgv';
import { Confidentialite } from './pages/legal/Confidentialite';
import { Cookies } from './pages/legal/Cookies';
import { MentionsLegales } from './pages/legal/MentionsLegales';
import { Login } from './pages/Login';
import { History } from './pages/player/History';
import { NewSession } from './pages/player/NewSession';
import { PlayerDashboard } from './pages/player/PlayerDashboard';
import { Profile } from './pages/Profile';
import { Register } from './pages/Register';

function Protected({ children, role }: { children: JSX.Element; role?: Role }) {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) return null;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  // Chaque role a son propre espace : on renvoie vers l’accueil correspondant.
  if (role && user.role !== role) {
    return <Navigate to={user.role === 'coach' ? '/coach' : '/'} replace />;
  }
  return children;
}

function Guest({ children }: { children: JSX.Element }) {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (user) return <Navigate to={user.role === 'coach' ? '/coach' : '/'} replace />;
  return children;
}

/**
 * Routage en URL franches, sans `#`.
 *
 * `vercel.json` réécrit déjà tout ce qui n'est pas un asset vers `index.html`,
 * donc un rechargement sur `/confidentialite` sert bien l'application. Le
 * `HashRouter` d'origine n'avait plus de raison d'être : le client Supabase est
 * configuré avec `detectSessionInUrl: false` et l'authentification se fait par
 * mot de passe, sans jeton déposé dans le fragment d'URL — le seul cas qui
 * aurait imposé le `#`.
 *
 * Deux gains concrets : les pages légales deviennent des URL citables et
 * indexables — un club qui évalue le service doit pouvoir lire les CGV sans
 * compte — et le lien d'invitation (`/inscription?equipe=…`) porte son
 * paramètre là où le serveur et le navigateur le lisent normalement.
 */
export function App() {
  return (
    <Router>
      <AppShell>
        <Routes>
          <Route path="/login" element={<Guest><Login /></Guest>} />
          <Route path="/inscription" element={<Guest><Register /></Guest>} />

          {/* Pages légales : publiques par obligation, jamais derrière <Protected>
              ni <Guest>. Elles doivent rester lisibles sans compte (joueur mineur,
              représentant légal, club qui évalue le service) et depuis l'app. */}
          <Route path="/mentions-legales" element={<MentionsLegales />} />
          <Route path="/confidentialite" element={<Confidentialite />} />
          <Route path="/cgu" element={<Cgu />} />
          <Route path="/cgv" element={<Cgv />} />
          <Route path="/cookies" element={<Cookies />} />

          <Route path="/" element={<Protected role="player"><PlayerDashboard /></Protected>} />
          <Route path="/saisie" element={<Protected role="player"><NewSession /></Protected>} />
          <Route path="/historique" element={<Protected role="player"><History /></Protected>} />

          <Route path="/coach" element={<Protected role="coach"><CoachDashboard /></Protected>} />
          <Route path="/coach/effectif" element={<Protected role="coach"><Roster /></Protected>} />
          <Route path="/coach/modeles" element={<Protected role="coach"><LoadModelSettings /></Protected>} />
          <Route path="/coach/joueur/:playerId" element={<Protected role="coach"><PlayerDetail /></Protected>} />

          <Route path="/profil" element={<Protected><Profile /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <NavGate />
      </AppShell>
    </Router>
  );
}

/** La barre d’onglets n’apparaît qu’une fois connecte, hors écrans d’auth. */
function NavGate() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const isAuthScreen = pathname === '/login' || pathname === '/inscription';
  if (!user || isAuthScreen) return null;
  return <BottomNav />;
}
