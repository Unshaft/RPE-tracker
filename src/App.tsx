import { Navigate, Route, HashRouter as Router, Routes, useLocation } from 'react-router-dom';
import { AppShell, BottomNav } from './components/Layout';
import { useAuth } from './lib/auth';
import type { Role } from './lib/types';
import { CoachDashboard } from './pages/coach/CoachDashboard';
import { PlayerDetail } from './pages/coach/PlayerDetail';
import { Roster } from './pages/coach/Roster';
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

export function App() {
  return (
    <Router>
      <AppShell>
        <Routes>
          <Route path="/login" element={<Guest><Login /></Guest>} />
          <Route path="/inscription" element={<Guest><Register /></Guest>} />

          <Route path="/" element={<Protected role="player"><PlayerDashboard /></Protected>} />
          <Route path="/saisie" element={<Protected role="player"><NewSession /></Protected>} />
          <Route path="/historique" element={<Protected role="player"><History /></Protected>} />

          <Route path="/coach" element={<Protected role="coach"><CoachDashboard /></Protected>} />
          <Route path="/coach/effectif" element={<Protected role="coach"><Roster /></Protected>} />
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
