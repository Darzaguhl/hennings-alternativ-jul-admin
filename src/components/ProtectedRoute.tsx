import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { EventProvider } from '../context/EventContext'

export default function ProtectedRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream-100 text-ink-600">
        Laster …
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return (
    <EventProvider>
      <Outlet />
    </EventProvider>
  )
}
