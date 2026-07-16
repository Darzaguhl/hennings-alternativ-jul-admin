import { useEffect, useState } from 'react'
import { useEvents } from '../context/EventContext'
import { api, ApiError } from '../api/client'
import type { Criticality, OppgaveSlot, Shift, ShiftConflict, Skill, User } from '../types'
import { Badge, Button, Card, ErrorText, Input, Label, PageHeader, Select } from '../components/ui'
import { hasAdminAccess } from '../utils/roles'

interface ShiftFormState {
  title: string
  date: string
  start_time: string
  end_time: string
  capacity: string
  min_capacity: string
  criticality: Criticality
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
  leader_ids: shift.leaders.map((l) => l.id),
})

export default function Vakter() {
  const { selectedEvent } = useEvents()
  const [shifts, setShifts] = useState<Shift[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [conflicts, setConflicts] = useState<ShiftConflict[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)
  const [form, setForm] = useState<ShiftFormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [newConflictA, setNewConflictA] = useState('')
  const [newConflictB, setNewConflictB] = useState('')
  const [conflictSaving, setConflictSaving] = useState(false)
  const [slots, setSlots] = useState<OppgaveSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [newSlotSkill, setNewSlotSkill] = useState('')
  const [newSlotCapacity, setNewSlotCapacity] = useState('')
  const [slotSaving, setSlotSaving] = useState(false)

  const isAdmin = hasAdminAccess(selectedEvent?.viewer_role)

  const load = () => {
    if (!selectedEvent) return
    setLoading(true)
    setError('')
    Promise.all([
      api.shifts(selectedEvent.id),
      isAdmin ? api.users() : Promise.resolve([]),
      isAdmin ? api.shiftConflicts(selectedEvent.id) : Promise.resolve([]),
      isAdmin ? api.skills() : Promise.resolve([]),
    ])
      .then(([s, u, c, sk]) => {
        setShifts([...s].sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time)))
        setUsers(u)
        setConflicts(c)
        setSkills(sk)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Kunne ikke laste vakter.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [selectedEvent, isAdmin])

  const loadSlots = (shiftId: number) => {
    setSlotsLoading(true)
    api
      .oppgaveSlots({ shift: shiftId })
      .then(setSlots)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Kunne ikke laste oppgaver for vakten.'))
      .finally(() => setSlotsLoading(false))
  }

  const handleAddSlot = async () => {
    if (editingId === 'new' || editingId === null || !newSlotSkill) return
    setSlotSaving(true)
    setError('')
    try {
      await api.createOppgaveSlot(editingId, Number(newSlotSkill), newSlotCapacity === '' ? null : Number(newSlotCapacity))
      setNewSlotSkill('')
      setNewSlotCapacity('')
      loadSlots(editingId)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke legge til oppgaven.')
    } finally {
      setSlotSaving(false)
    }
  }

  const handleDeleteSlot = async (slot: OppgaveSlot) => {
    if (!confirm(`Fjerne oppgaven «${slot.skill_name}» fra denne vakten?`)) return
    try {
      await api.deleteOppgaveSlot(slot.id)
      setSlots((prev) => prev.filter((s) => s.id !== slot.id))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke fjerne oppgaven.')
    }
  }

  const handleAddConflict = async () => {
    if (!selectedEvent || !newConflictA || !newConflictB || newConflictA === newConflictB) return
    setConflictSaving(true)
    setError('')
    try {
      await api.createShiftConflict(selectedEvent.id, Number(newConflictA), Number(newConflictB))
      setNewConflictA('')
      setNewConflictB('')
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke legge til konflikten.')
    } finally {
      setConflictSaving(false)
    }
  }

  const handleDeleteConflict = async (conflict: ShiftConflict) => {
    if (!confirm(`Fjerne konflikten mellom «${conflict.shift_a_title}» og «${conflict.shift_b_title}»?`)) return
    try {
      await api.deleteShiftConflict(conflict.id)
      setConflicts((prev) => prev.filter((c) => c.id !== conflict.id))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke fjerne konflikten.')
    }
  }

  const openCreate = () => {
    setForm(emptyForm)
    setSlots([])
    setEditingId('new')
  }

  const openEdit = (shift: Shift) => {
    setForm(toFormState(shift))
    setEditingId(shift.id)
    setNewSlotSkill('')
    setNewSlotCapacity('')
    loadSlots(shift.id)
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

      {isAdmin && !loading && (
        <Card className="mt-6">
          <h2 className="mb-1 text-lg font-semibold text-green-900">Vaktkonflikter</h2>
          <p className="mb-4 text-sm text-ink-600">
            Vakter som ikke kan kombineres i samme påmelding — f.eks. fordi de ligger for tett på hverandre til at
            noen bør ta begge. Dette er en vurdering dere gjør selv, ikke noe som regnes ut automatisk fra
            klokkeslett.
          </p>

          {conflicts.length > 0 && (
            <div className="mb-4 flex flex-col gap-2">
              {conflicts.map((conflict) => (
                <div key={conflict.id} className="flex items-center justify-between rounded-lg bg-cream-50 px-4 py-2.5">
                  <span className="text-sm text-ink-900">
                    «{conflict.shift_a_title}» ↔ «{conflict.shift_b_title}»
                  </span>
                  <Button variant="danger" onClick={() => handleDeleteConflict(conflict)} className="!px-3 !py-1.5 !text-xs">
                    Slett
                  </Button>
                </div>
              ))}
            </div>
          )}
          {conflicts.length === 0 && <p className="mb-4 text-sm text-ink-600">Ingen vaktkonflikter er lagt til ennå.</p>}

          <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
            <div>
              <Label>Vakt A</Label>
              <Select value={newConflictA} onChange={(e) => setNewConflictA(e.target.value)}>
                <option value="">Velg vakt</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Vakt B</Label>
              <Select value={newConflictB} onChange={(e) => setNewConflictB(e.target.value)}>
                <option value="">Velg vakt</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              onClick={handleAddConflict}
              disabled={conflictSaving || !newConflictA || !newConflictB || newConflictA === newConflictB}
            >
              {conflictSaving ? 'Legger til …' : 'Legg til'}
            </Button>
          </div>
        </Card>
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
              {isAdmin && editingId !== 'new' && (
                <div className="rounded-lg border border-cream-200 p-3">
                  <Label>Oppgaver for denne vakten</Label>
                  {slotsLoading ? (
                    <p className="text-sm text-ink-600">Laster …</p>
                  ) : (
                    <>
                      {slots.length > 0 && (
                        <div className="mb-3 flex flex-col gap-1.5">
                          {slots.map((slot) => (
                            <div key={slot.id} className="flex items-center justify-between rounded-lg bg-cream-50 px-3 py-2">
                              <span className="text-sm text-ink-900">
                                {slot.skill_name}
                                <span className="ml-2 text-xs text-ink-600">
                                  {slot.assigned_count}
                                  {slot.capacity !== null ? `/${slot.capacity}` : ''} tildelt · {slot.signup_count} interesserte
                                </span>
                              </span>
                              <Button
                                variant="danger"
                                onClick={() => handleDeleteSlot(slot)}
                                className="!px-3 !py-1.5 !text-xs"
                              >
                                Slett
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      {slots.length === 0 && (
                        <p className="mb-3 text-sm text-ink-600">Ingen oppgaver lagt til for denne vakten ennå.</p>
                      )}
                      <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
                        <div>
                          <Label>Oppgave</Label>
                          <Select value={newSlotSkill} onChange={(e) => setNewSlotSkill(e.target.value)}>
                            <option value="">Velg oppgave</option>
                            {skills
                              .filter((sk) => !slots.some((s) => s.skill === sk.id))
                              .map((sk) => (
                                <option key={sk.id} value={sk.id}>
                                  {sk.name}
                                </option>
                              ))}
                          </Select>
                        </div>
                        <div className="w-28">
                          <Label>Kapasitet</Label>
                          <Input
                            type="number"
                            min={0}
                            placeholder="Ubegrenset"
                            value={newSlotCapacity}
                            onChange={(e) => setNewSlotCapacity(e.target.value)}
                          />
                        </div>
                        <Button onClick={handleAddSlot} disabled={slotSaving || !newSlotSkill} className="!px-3 !py-2 !text-xs">
                          {slotSaving ? 'Legger til …' : 'Legg til'}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
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
