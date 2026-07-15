import { useEffect, useState } from 'react'
import { useEvents } from '../context/EventContext'
import { api, ApiError } from '../api/client'
import type { Criticality, Phase, Shift, User } from '../types'
import { Badge, Button, Card, ErrorText, Input, Label, PageHeader, Select } from '../components/ui'
import { hasAdminAccess } from '../utils/roles'

const phaseLabels: Record<Phase, string> = {
  setup: 'Forberedelse',
  guest: 'Gjester til stede',
  teardown: 'Rydding',
  '': 'Ikke satt',
}

interface ShiftFormState {
  title: string
  date: string
  start_time: string
  end_time: string
  capacity: string
  min_capacity: string
  criticality: Criticality
  phase: Phase
  leader_ids: number[]
}

const emptyForm: ShiftFormState = {
  title: '',
  date: '',
  start_time: '',
  end_time: '',
  capacity: '',
  min_capacity: '',
  criticality: 'normal',
  phase: '',
  leader_ids: [],
}

const toFormState = (shift: Shift): ShiftFormState => ({
  title: shift.title,
  date: shift.date,
  start_time: shift.start_time.slice(0, 5),
  end_time: shift.end_time.slice(0, 5),
  capacity: shift.capacity?.toString() ?? '',
  min_capacity: shift.min_capacity?.toString() ?? '',
  criticality: shift.criticality,
  phase: shift.phase,
  leader_ids: shift.leaders.map((l) => l.id),
})

export default function Vakter() {
  const { selectedEvent } = useEvents()
  const [shifts, setShifts] = useState<Shift[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)
  const [form, setForm] = useState<ShiftFormState>(emptyForm)
  const [saving, setSaving] = useState(false)

  const isAdmin = hasAdminAccess(selectedEvent?.viewer_role)

  const load = () => {
    if (!selectedEvent) return
    setLoading(true)
    setError('')
    Promise.all([api.shifts(selectedEvent.id), isAdmin ? api.users() : Promise.resolve([])])
      .then(([s, u]) => {
        setShifts([...s].sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time)))
        setUsers(u)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Kunne ikke laste vakter.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [selectedEvent, isAdmin])

  const openCreate = () => {
    setForm(emptyForm)
    setEditingId('new')
  }

  const openEdit = (shift: Shift) => {
    setForm(toFormState(shift))
    setEditingId(shift.id)
  }

  const closeForm = () => setEditingId(null)

  const handleSubmit = async () => {
    if (!selectedEvent) return
    setSaving(true)
    setError('')
    const payload = {
      title: form.title,
      date: form.date,
      start_time: form.start_time,
      end_time: form.end_time,
      capacity: form.capacity === '' ? null : Number(form.capacity),
      min_capacity: form.min_capacity === '' ? null : Number(form.min_capacity),
      criticality: form.criticality,
      phase: form.phase,
      ...(isAdmin ? { leader_ids: form.leader_ids } : {}),
    }
    try {
      if (editingId === 'new') {
        await api.createShift({ ...payload, event: selectedEvent.id })
      } else if (editingId !== null) {
        await api.updateShift(editingId, payload)
      }
      closeForm()
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke lagre vakten.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (shift: Shift) => {
    if (!confirm(`Slette «${shift.title}»?`)) return
    try {
      await api.deleteShift(shift.id)
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke slette vakten.')
    }
  }

  if (!selectedEvent) return <p className="text-ink-600">Ingen arrangement valgt.</p>

  return (
    <div>
      <PageHeader
        title="Vakter"
        subtitle={`${shifts.length} vakter i ${selectedEvent.title}`}
        action={isAdmin ? <Button onClick={openCreate}>+ Ny vakt</Button> : undefined}
      />

      <ErrorText>{error}</ErrorText>

      {loading ? (
        <p className="text-ink-600">Laster …</p>
      ) : (
        <div className="flex flex-col gap-2">
          {shifts.map((shift) => (
            <Card key={shift.id} className="!p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink-900">{shift.title}</span>
                    {shift.phase && <Badge tone="neutral">{phaseLabels[shift.phase]}</Badge>}
                    {shift.criticality === 'critical' && <Badge tone="critical">Krever erfaring</Badge>}
                    {shift.is_understaffed && <Badge tone="warning">Underbemannet</Badge>}
                    {shift.is_full && <Badge tone="success">Fullt</Badge>}
                  </div>
                  <p className="mt-0.5 text-sm text-ink-600">
                    {shift.date} · {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)} ·{' '}
                    {shift.assigned_count}
                    {shift.capacity !== null ? `/${shift.capacity}` : ''} tildelt · {shift.signup_count} interesserte
                    {shift.leaders.length > 0 && <> · Ledere: {shift.leaders.map((l) => l.email).join(', ')}</>}
                  </p>
                </div>
                {(isAdmin || shift.is_led_by_viewer) && (
                  <div className="flex flex-shrink-0 gap-2">
                    <Button variant="secondary" onClick={() => openEdit(shift)}>
                      Rediger
                    </Button>
                    {isAdmin && (
                      <Button variant="danger" onClick={() => handleDelete(shift)}>
                        Slett
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </Card>
          ))}
          {shifts.length === 0 && <p className="text-ink-600">Ingen vakter er lagt til ennå.</p>}
        </div>
      )}

      {editingId !== null && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-ink-900/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-md">
            <h2 className="mb-4 text-lg font-semibold text-green-900">
              {editingId === 'new' ? 'Ny vakt' : 'Rediger vakt'}
            </h2>
            <div className="flex flex-col gap-3">
              <div>
                <Label>Tittel</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Dato</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
                <div>
                  <Label>Fra</Label>
                  <Input
                    type="time"
                    value={form.start_time}
                    onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Til</Label>
                  <Input
                    type="time"
                    value={form.end_time}
                    onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Kapasitet (maks)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.capacity}
                    onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Min. bemanning</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.min_capacity}
                    onChange={(e) => setForm({ ...form, min_capacity: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Krever erfaring</Label>
                  <Select
                    value={form.criticality}
                    onChange={(e) => setForm({ ...form, criticality: e.target.value as Criticality })}
                  >
                    <option value="normal">Nei</option>
                    <option value="critical">Ja</option>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Fase</Label>
                <Select value={form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value as Phase })}>
                  <option value="">Ikke satt</option>
                  <option value="setup">Forberedelse</option>
                  <option value="guest">Gjester til stede</option>
                  <option value="teardown">Rydding</option>
                </Select>
                <p className="mt-1 text-xs text-ink-400">
                  Avgjør hvilke oppgaver som kan velges for denne vakten — se Oppgaver.
                </p>
              </div>
              {isAdmin && (
                <div>
                  <Label>Ledere for denne vakten</Label>
                  <select
                    multiple
                    value={form.leader_ids.map(String)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        leader_ids: Array.from(e.target.selectedOptions, (o) => Number(o.value)),
                      })
                    }
                    className="h-28 w-full rounded-lg border border-cream-200 bg-white px-3 py-2 text-sm"
                  >
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.email}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-ink-400">Cmd/Ctrl-klikk for å velge flere.</p>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={closeForm}>
                Avbryt
              </Button>
              <Button onClick={handleSubmit} disabled={saving}>
                {saving ? 'Lagrer …' : 'Lagre'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
