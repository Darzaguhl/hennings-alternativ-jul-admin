import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEvents } from '../context/EventContext'
import { visibleSections } from '../nav'

const itemClass = (active: boolean) =>
  `block rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
    active ? 'bg-green-700 text-cream-50' : 'text-cream-100 hover:bg-green-800'
  }`

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `-mb-px whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
    isActive ? 'border-green-700 text-green-900' : 'border-transparent text-ink-400 hover:text-ink-600'
  }`

export default function Layout() {
  const { user, logout } = useAuth()
  const { events, selectedEvent, selectEvent, loading } = useEvents()
  const { pathname } = useLocation()
  const [accountOpen, setAccountOpen] = useState(false)

  const sections = visibleSections(selectedEvent?.viewer_role)
  const current = sections.find((s) => s.tabs.some((t) => t.path === pathname))

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-shrink-0 flex-col bg-green-900 px-4 py-6">
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
          {sections.map((s) => (
            <Link
              key={s.key}
              to={s.tabs[0].path}
              className={itemClass(current?.key === s.key)}
              aria-current={current?.key === s.key ? 'page' : undefined}
            >
              {s.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto border-t border-green-800 pt-3">
          {accountOpen && (
            <div className="mb-1 flex flex-col gap-1">
              <NavLink to="/innlogging" className={({ isActive }) => itemClass(isActive)} onClick={() => setAccountOpen(false)}>
                Innlogging
              </NavLink>
              <button onClick={logout} className={`${itemClass(false)} w-full text-left`}>
                Logg ut
              </button>
            </div>
          )}
          <button
            onClick={() => setAccountOpen((v) => !v)}
            aria-expanded={accountOpen}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-xs text-cream-200/80 hover:bg-green-800"
          >
            <span className="truncate">{user?.email}</span>
            <span aria-hidden>{accountOpen ? '▾' : '▴'}</span>
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto bg-cream-100 p-8">
        {current && current.tabs.length > 1 && (
          <nav className="mb-6 flex gap-6 overflow-x-auto border-b border-cream-200" aria-label={current.label}>
            {current.tabs.map((t) => (
              <NavLink key={t.path} to={t.path} end className={tabClass}>
                {t.label}
              </NavLink>
            ))}
          </nav>
        )}
        <Outlet />
      </main>
    </div>
  )
}
