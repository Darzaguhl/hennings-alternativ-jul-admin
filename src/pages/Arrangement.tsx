import { useEffect, useState } from 'react'
import { useEvents } from '../context/EventContext'
import { api, ApiError } from '../api/client'
import { Button, Card, ErrorText, Input, Label, PageHeader } from '../components/ui'
import { hasAdminAccess } from '../utils/roles'

export default function Arrangement() {
  const { selectedEvent, refresh, selectEvent } = useEvents()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (!selectedEvent) return
    setTitle(selectedEvent.title)
    setDescription(selectedEvent.description)
    setDate(selectedEvent.date ? selectedEvent.date.slice(0, 10) : '')
  }, [selectedEvent])

  const handleCreated = (id: number) => {
    refresh()
    selectEvent(id)
  }

  if (!selectedEvent) {
    return (
      <div>
        <PageHeader title="Arrangement" subtitle="Opprett det første arrangementet" />
        <NewEventCard onCreated={handleCreated} />
      </div>
    )
  }

  if (!hasAdminAccess(selectedEvent.viewer_role)) {
    return (
      <Card>
        <p className="text-ink-600">Bare admin kan administrere arrangementet.</p>
      </Card>
    )
  }

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

  return (
    <div>
      <PageHeader title="Arrangement" subtitle="Rediger detaljer for det valgte arrangementet" />

      <Card className="max-w-lg">
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
    </Card>
  )
}
