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
              <Route path="innsjekk" element={<Innsjekk />} />
              {/* Innsjekk and Pool & tildeling used to be separate pages,
                  now they're tabs on the same one -- keep old /pool links
                  (bookmarks, anything hardcoded elsewhere) working. */}
              <Route path="pool" element={<Navigate to="/innsjekk" replace />} />
              <Route path="roller" element={<Roller />} />
              <Route path="arrangement" element={<Arrangement />} />
              <Route path="historikk" element={<Historikk />} />
              <Route path="oppgaver" element={<Oppgaver />} />
              <Route path="lager" element={<Lager />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
