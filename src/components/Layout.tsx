import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEvents } from '../context/EventContext'
import { hasAdminAccess } from '../utils/roles'

const navItemClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-green-700 text-cream-50' : 'text-cream-100 hover:bg-green-800'
  }`

export default function Layout() {
  const { user, logout } = useAuth()
  const { events, selectedEvent, selectEvent, loading } = useEvents()
  const role = selectedEvent?.viewer_role

  const canManageEvent = hasAdminAccess(role)
  const canSeeRoller = hasAdminAccess(role)
  const canSeePool = hasAdminAccess(role) || role === 'checkin_staff' || role === 'shift_leader'
  const canSeeInnsjekk = hasAdminAccess(role) || role === 'checkin_staff'

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 flex-shrink-0 flex-col bg-green-900 px-4 py-6">
        <div className="mb-8 px-2">
          <p className="font-display text-lg font-semibold text-cream-50">Hennings</p>
          <p className="font-display text-base font-semibold text-gold-300">Alternativ Jul</p>
          <p className="mt-1 text-xs text-cream-200/70">Admin</p>
        </div>

        {!loading && events.length > 1 && (
          <select
            value={selectedEvent?.id ?? ''}
            onChange={(e) => selectEvent(Number(e.target.value))}
            className="mb-6 rounded-lg border border-green-700 bg-green-800 px-3 py-2 text-sm text-cream-50"
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
                {ev.is_active ? ' (aktiv)' : ''}
              </option>
            ))}
          </select>
        )}

        <nav className="flex flex-col gap-1">
          <NavLink to="/" end className={navItemClass}>
            Oversikt
          </NavLink>
          <NavLink to="/vakter" className={navItemClass}>
            Vakter
          </NavLink>
          {canSeePool && (
            <NavLink to="/frivillige" className={navItemClass}>
              Frivillige
            </NavLink>
          )}
          {canSeePool && (
            <NavLink to="/pool" className={navItemClass}>
              Pool &amp; tildeling
            </NavLink>
          )}
          {canSeeInnsjekk && (
            <NavLink to="/innsjekk" className={navItemClass}>
              Innsjekk
            </NavLink>
          )}
          {canSeeRoller && (
            <NavLink to="/roller" className={navItemClass}>
              Roller
            </NavLink>
          )}
          {canManageEvent && (
            <NavLink to="/arrangement" className={navItemClass}>
              Arrangement
            </NavLink>
          )}
        </nav>

        <div className="mt-auto border-t border-green-800 pt-4">
          <p className="truncate px-2 text-xs text-cream-200/70">{user?.email}</p>
          <button
            onClick={logout}
            className="mt-2 w-full rounded-lg px-4 py-2 text-left text-sm text-cream-100 hover:bg-green-800"
          >
            Logg ut
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-cream-100 p-8">
        <Outlet />
      </main>
    </div>
  )
}
