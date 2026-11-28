import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Vakter from './pages/Vakter'
import Roller from './pages/Roller'
import Innsjekk from './pages/Innsjekk'
import Arrangement from './pages/Arrangement'
import Frivillige from './pages/Frivillige'
import Historikk from './pages/Historikk'
import Oppgaver from './pages/Oppgaver'
import Lager from './pages/Lager'
import Team from './pages/Team'
import Oppmote from './pages/Oppmote'
import Innlogging from './pages/Innlogging'
import Givere from './pages/Givere'
import Matplan from './pages/Matplan'
import AcceptInvite from './pages/AcceptInvite'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/accept-invite" element={<AcceptInvite />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="vakter" element={<Vakter />} />
              <Route path="frivillige" element={<Frivillige />} />
              <Route path="innsjekk" element={<Innsjekk key="innsjekk" view="innsjekk" />} />
              <Route path="pool" element={<Innsjekk key="pool" view="pool" />} />
              <Route path="roller" element={<Roller />} />
              <Route path="arrangement" element={<Arrangement />} />
              <Route path="historikk" element={<Historikk />} />
              <Route path="oppgaver" element={<Oppgaver />} />
              <Route path="lager" element={<Lager />} />
              <Route path="team" element={<Team />} />
              {/* Old addresses of pages that were merged into others. */}
              <Route path="fremhevinger" element={<Navigate to="/team" replace />} />
              <Route path="vurderinger" element={<Navigate to="/team" replace />} />
              <Route path="standing" element={<Navigate to="/frivillige" replace />} />
              <Route path="oppmote" element={<Oppmote />} />
              <Route path="innlogging" element={<Innlogging />} />
              <Route path="givere" element={<Givere />} />
              <Route path="matplan" element={<Matplan />} />
            </Route>
          </Route>
          {/* Catches anything that doesn't match above -- notably
              /index.html, which a plain (non-SPA-aware) redirect rule on
              the host can land a page refresh on instead of the original
              path. Without this, <Routes> renders nothing for an unknown
              path and the user sees a blank page. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
