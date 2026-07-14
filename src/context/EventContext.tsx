import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import type { Event } from '../types'
import { useAuth } from './AuthContext'

const SELECTED_EVENT_KEY = 'haj_admin_selected_event'

interface EventContextValue {
  events: Event[]
  selectedEvent: Event | null
  loading: boolean
  selectEvent: (id: number) => void
  refresh: () => Promise<void>
}

const EventContext = createContext<EventContextValue | null>(null)

export function EventProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [events, setEvents] = useState<Event[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    const stored = localStorage.getItem(SELECTED_EVENT_KEY)
    return stored ? Number(stored) : null
  })
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await api.events()
      const sorted = [...list].sort((a, b) => b.id - a.id)
      setEvents(sorted)
      setSelectedId((current) => {
        if (current && sorted.some((e) => e.id === current)) return current
        return sorted[0]?.id ?? null
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user) refresh()
    else {
      setEvents([])
      setLoading(false)
    }
  }, [user, refresh])

  useEffect(() => {
    if (selectedId) localStorage.setItem(SELECTED_EVENT_KEY, String(selectedId))
  }, [selectedId])

  const selectEvent = useCallback((id: number) => setSelectedId(id), [])

  const selectedEvent = events.find((e) => e.id === selectedId) ?? null

  return (
    <EventContext.Provider value={{ events, selectedEvent, loading, selectEvent, refresh }}>
      {children}
    </EventContext.Provider>
  )
}

export function useEvents() {
  const ctx = useContext(EventContext)
  if (!ctx) throw new Error('useEvents must be used within EventProvider')
  return ctx
}
