import { useEffect, useState } from 'react'
import { useEvents } from '../context/EventContext'
import { api, ApiError } from '../api/client'
import type { Event } from '../types'
import { Badge, Button, Card, ErrorText, Input, Label, PageHeader } from '../components/ui'
import { hasAdminAccess, isOwner } from '../utils/roles'

const eventYearLabel = (event: Event) => {
  if (event.date) {
    const parsed = new Date(event.date)
    if (!Number.isNaN(parsed.getTime())) return `${parsed.getFullYear()}`
  }
  return event.title
}

const pad = (value: number) => `${value}`.padStart(2, '0')

// <input type="datetime-local"> wants local time with no timezone suffix,
// e.g. "2026-11-01T09:00" -- Date#toISOString() is always UTC, so this
// converts using local getters instead of slicing the ISO string.
const toDatetimeLocal = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const fromDatetimeLocal = (value: string): string | null => (value ? new Date(value).toISOString() : null)

export default function Arrangement() {
  const { events, selectedEvent, loading, refresh, selectEvent } = useEvents()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [lifecycleBusyId, setLifecycleBusyId] = useState<number | null>(null)
  const [lifecycleError, setLifecycleError] = useState('')
  const [signupOpensAt, setSignupOpensAt] = useState('')
  const [signupClosesAt, setSignupClosesAt] = useState('')
  const [savingSignupWindow, setSavingSignupWindow] = useState(false)
  const [signupWindowError, setSignupWindowError] = useState('')
  const [signupWindowStatus, setSignupWindowStatus] = useState('')

  useEffect(() => {
    if (!selectedEvent) return
    setTitle(selectedEvent.title)
    setDescription(selectedEvent.description)
    setDate(selectedEvent.date ? selectedEvent.date.slice(0, 10) : '')
    setSignupOpensAt(toDatetimeLocal(selectedEvent.signup_opens_at))
    setSignupClosesAt(toDatetimeLocal(selectedEvent.signup_closes_at))
  }, [selectedEvent])

  const handleCreated = (id: number) => {
    refresh()
    selectEvent(id)
  }

  if (!loading && !selectedEvent) {
    return (
      <div>
        <PageHeader title="Arrangement" subtitle="Opprett det første arrangementet" />
        <NewEventCard onCreated={handleCreated} />
      </div>
    )
  }

  if (!selectedEvent) return null

  if (!hasAdminAccess(selectedEvent.viewer_role)) {
    return (
      <Card>
        <p className="text-ink-600">Bare admin kan administrere arrangementet.</p>
      </Card>
    )
  }

  const viewerIsOwner = isOwner(selectedEvent.viewer_role)

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setStatus('')
    try {
      await api.updateEvent(selectedEvent.id, {
        title,
        description,
        date: date ? new Date(date).toISOString() : null,
      })
      setStatus('Lagret.')
      refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke lagre.')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveSignupWindow = async () => {
    setSavingSignupWindow(true)
    setSignupWindowError('')
    setSignupWindowStatus('')
    try {
      await api.updateEvent(selectedEvent.id, {
        signup_opens_at: fromDatetimeLocal(signupOpensAt),
        signup_closes_at: fromDatetimeLocal(signupClosesAt),
      })
      setSignupWindowStatus('Lagret.')
      refresh()
    } catch (err) {
      setSignupWindowError(err instanceof ApiError ? err.message : 'Kunne ikke lagre.')
    } finally {
      setSavingSignupWindow(false)
    }
  }

  const toggleCheckinMode = async () => {
    const nextMode = selectedEvent.checkin_mode === 'personal_qr' ? 'event_qr' : 'personal_qr'
    setError('')
    try {
      await api.updateEvent(selectedEvent.id, { checkin_mode: nextMode })
      refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke endre innsjekk-modus.')
    }
  }

  const handleActivate = async (event: Event) => {
    setLifecycleBusyId(event.id)
    setLifecycleError('')
    try {
      await api.activateEvent(event.id)
      await refresh()
    } catch (err) {
      setLifecycleError(err instanceof ApiError ? err.message : 'Kunne ikke aktivere arrangementet.')
    } finally {
      setLifecycleBusyId(null)
    }
  }

  const handleDeactivate = async (event: Event) => {
    setLifecycleBusyId(event.id)
    setLifecycleError('')
    try {
      await api.deactivateEvent(event.id)
      await refresh()
    } catch (err) {
      setLifecycleError(err instanceof ApiError ? err.message : 'Kunne ikke deaktivere arrangementet.')
    } finally {
      setLifecycleBusyId(null)
    }
  }

  const handleDelete = async (event: Event) => {
    if (!confirm(`Er du sikker på at du vil slette «${event.title}»? Dette fjerner permanent alle vakter, oppgaver og innsjekk-historikk for arrangementet. Dette kan ikke angres.`)) {
      return
    }
    setLifecycleBusyId(event.id)
    setLifecycleError('')
    try {
      await api.deleteEvent(event.id)
      await refresh()
    } catch (err) {
      setLifecycleError(err instanceof ApiError ? err.message : 'Kunne ikke slette arrangementet.')
    } finally {
      setLifecycleBusyId(null)
    }
  }

  return (
    <div>
      <PageHeader title="Arrangement" subtitle="Rediger detaljer for det valgte arrangementet" />

      <Card className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-600">Alle arrangementer</h2>
        <ErrorText>{lifecycleError}</ErrorText>
        <div className="flex flex-col divide-y divide-cream-200">
          {events.map((event) => (
            <div key={event.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <button
                onClick={() => selectEvent(event.id)}
                className={`flex flex-1 flex-col items-start text-left ${event.id === selectedEvent.id ? 'text-green-900' : 'text-ink-700'}`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {event.title}
                  {event.id === selectedEvent.id && <Badge tone="neutral">Valgt</Badge>}
                </span>
                <span className="text-xs text-ink-400">{eventYearLabel(event)}</span>
              </button>
              <Badge tone={event.is_active ? 'success' : 'neutral'}>{event.is_active ? 'Aktiv' : 'Inaktiv'}</Badge>
              {viewerIsOwner && (
                <div className="flex items-center gap-2">
                  {event.is_active ? (
                    <Button
                      variant="secondary"
                      className="!px-3 !py-1.5 !text-xs"
                      disabled={lifecycleBusyId === event.id}
                      onClick={() => handleDeactivate(event)}
                    >
                      Deaktiver
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      className="!px-3 !py-1.5 !text-xs"
                      disabled={lifecycleBusyId === event.id}
                      onClick={() => handleActivate(event)}
                    >
                      Aktiver
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    className="!px-3 !py-1.5 !text-xs"
                    disabled={lifecycleBusyId === event.id}
                    onClick={() => handleDelete(event)}
                  >
                    Slett
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-400">
          Kun ett arrangement er aktivt om gangen — det er det nettsiden og appen viser til frivillige. Kun eier kan
          aktivere, deaktivere eller slette et arrangement.
        </p>
      </Card>

      <Card className="mb-8 max-w-lg">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-600">Detaljer</h2>
        <div className="flex flex-col gap-3">
          <div>
            <Label>Tittel</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label>Beskrivelse</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-cream-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-gold-500 focus:outline-none"
            />
          </div>
          <div>
            <Label>Dato</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <ErrorText>{error}</ErrorText>
          {status && <p className="text-sm text-green-800">{status}</p>}
          <Button onClick={handleSave} disabled={saving} className="self-start">
            {saving ? 'Lagrer …' : 'Lagre'}
          </Button>
        </div>
      </Card>

      <Card className="mb-8 max-w-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-600">Påmelding</h2>
          <Badge tone={selectedEvent.signups_open ? 'success' : 'neutral'}>
            {selectedEvent.signups_open ? 'Åpen' : 'Stengt'}
          </Badge>
        </div>
        <p className="mb-3 text-sm text-ink-600">
          Styrer når frivillige kan melde seg på via nettsiden. La et felt stå tomt for ingen nedre/øvre grense.
        </p>
        <div className="flex flex-col gap-3">
          <div>
            <Label>Påmelding åpner</Label>
            <Input type="datetime-local" value={signupOpensAt} onChange={(e) => setSignupOpensAt(e.target.value)} />
          </div>
          <div>
            <Label>Påmelding stenger</Label>
            <Input type="datetime-local" value={signupClosesAt} onChange={(e) => setSignupClosesAt(e.target.value)} />
          </div>
          <ErrorText>{signupWindowError}</ErrorText>
          {signupWindowStatus && <p className="text-sm text-green-800">{signupWindowStatus}</p>}
          <Button onClick={handleSaveSignupWindow} disabled={savingSignupWindow} className="self-start">
            {savingSignupWindow ? 'Lagrer …' : 'Lagre'}
          </Button>
        </div>
      </Card>

      <Card className="mb-8 max-w-lg">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-600">Innsjekk-modus</h2>
        <p className="mb-3 text-sm text-ink-600">
          {selectedEvent.checkin_mode === 'personal_qr'
            ? 'Personlig QR — en ansvarlig skanner hver frivillig sin egen kode.'
            : 'Delt QR — de frivillige skanner én delt kode selv (vises under Innsjekk).'}
        </p>
        <Button variant="secondary" onClick={toggleCheckinMode}>
          Bytt til {selectedEvent.checkin_mode === 'personal_qr' ? 'delt kode' : 'personlig QR'}
        </Button>
      </Card>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-600">Nytt arrangement</h2>
        <NewEventCard onCreated={handleCreated} />
      </div>
    </div>
  )
}

function NewEventCard({ onCreated }: { onCreated: (id: number) => void }) {
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    if (!title.trim()) return
    setCreating(true)
    setError('')
    try {
      const event = await api.createEvent({ title: title.trim(), checkin_mode: 'event_qr' })
      setTitle('')
      onCreated(event.id)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke opprette arrangement.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Card className="max-w-lg">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Label>Tittel på nytt arrangement</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Hennings Alternativ Jul 2027" />
        </div>
        <Button onClick={handleCreate} disabled={creating || !title.trim()}>
          {creating ? 'Oppretter …' : 'Opprett'}
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
      <p className="mt-2 text-xs text-ink-400">
        Nye arrangementer opprettes som inaktive — aktiver det når det er klart til å vises for frivillige.
      </p>
    </Card>
  )
}
