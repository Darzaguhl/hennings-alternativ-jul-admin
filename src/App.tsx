import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Vakter from './pages/Vakter'
import Roller from './pages/Roller'
import Pool from './pages/Pool'
import Innsjekk from './pages/Innsjekk'
import Arrangement from './pages/Arrangement'
import Frivillige from './pages/Frivillige'
import Historikk from './pages/Historikk'
import Oppgaver from './pages/Oppgaver'
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
              <Route path="pool" element={<Pool />} />
              <Route path="innsjekk" element={<Innsjekk />} />
              <Route path="roller" element={<Roller />} />
              <Route path="arrangement" element={<Arrangement />} />
              <Route path="historikk" element={<Historikk />} />
              <Route path="oppgaver" element={<Oppgaver />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
