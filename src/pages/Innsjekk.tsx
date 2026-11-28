import { useEffect, useRef, useState, type FormEvent } from 'react'
import QRCode from 'qrcode'
import { Link, Navigate } from 'react-router-dom'
import { useEvents } from '../context/EventContext'
import { api, ApiError } from '../api/client'
import type { OppgaveSlot, PoolEntry, User } from '../types'
import { Badge, Button, Card, ErrorText, Input, Label, PageHeader, Select } from '../components/ui'
import { hasAdminAccess } from '../utils/roles'
import { eventDayLabel } from '../utils/dates'
import { useToday } from '../utils/useToday'

const displayName = (user: User) => {
  const name = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim()
  return name || user.email
}

// OppgaveSlot.is_full reflects signup interest reaching capacity, which is
// expected to happen routinely (that's the whole point of the pool -- more
// candidates than seats) and says nothing about whether there's still room
// to actually assign someone. The assign picker needs to gate on confirmed
// placements instead.
const isFullForAssignment = (slot: OppgaveSlot) => slot.capacity !== null && slot.assigned_count >= slot.capacity

// What this person can be given: what they signed up for, plus -- for those who
// chose "hva som helst" -- every oppgave on those vakter. Older backends send no
// open_slots.
const assignableSlots = (entry: PoolEntry) => {
  const slots = [...entry.candidates.map((c) => c.oppgave_slot), ...(entry.open_slots ?? [])]
  return slots.filter((slot, i) => slots.findIndex((other) => other.id === slot.id) === i)
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' })

// Two views of the day at the door: checking people in, and placing those who
// have arrived. Each is its own tab in the menu (see nav.ts).
export default function Innsjekk({ view }: { view: 'innsjekk' | 'pool' }) {
  const { selectedEvent } = useEvents()
  const role = selectedEvent?.viewer_role
  // checkin_staff and admins can do both; a shift_leader can see the pool (to
  // assign from it) but not check people in. Mirrors the menu in nav.ts.
  const canSeeInnsjekk = hasAdminAccess(role) || role === 'checkin_staff'
  const canSeePool = hasAdminAccess(role) || role === 'checkin_staff' || role === 'shift_leader'

  // Innsjekk state
  const [userCode, setUserCode] = useState('')
  const [innsjekkMessage, setInnsjekkMessage] = useState('')
  const [innsjekkError, setInnsjekkError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [users, setUsers] = useState<User[]>([])
  const [search, setSearch] = useState('')
  const [checkingInId, setCheckingInId] = useState<number | null>(null)

  // Pool state. Volunteers can only sign up for the event's vakt days, so
  // those are the only days offered. The pool shows today when today is one of
  // them, otherwise the first -- and a day picked by hand holds until the
  // calendar day changes or another event is chosen.
  const today = useToday()
  const [loadedDays, setLoadedDays] = useState<{ event: number; days: string[] } | null>(null)
  const [picked, setPicked] = useState<{ event: number; date: string; on: string } | null>(null)
  const days = loadedDays && loadedDays.event === selectedEvent?.id ? loadedDays.days : null
  const date =
    picked && picked.event === selectedEvent?.id && picked.on === today && days?.includes(picked.date)
      ? picked.date
      : days?.includes(today)
        ? today
        : (days?.[0] ?? '')
  if (picked && selectedEvent && picked.event !== selectedEvent.id) setPicked(null)
  // Only the newest pool request may fill the list.
  const latestPool = useRef(0)
  const [entries, setEntries] = useState<PoolEntry[]>([])
  const [selection, setSelection] = useState<Record<number, number>>({})
  const [poolLoading, setPoolLoading] = useState(true)
  const [assigning, setAssigning] = useState<number | null>(null)
  const [poolError, setPoolError] = useState('')

  useEffect(() => {
    if (canSeeInnsjekk) api.users().then(setUsers).catch(() => {})
  }, [canSeeInnsjekk])

  // The canvas only exists in the check-in view, and only once the event is
  // loaded, so draw it when either changes.
  useEffect(() => {
    if (view === 'innsjekk' && selectedEvent?.checkin_mode === 'event_qr' && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, selectedEvent.code, { width: 260, margin: 1 }).catch(() => {})
    }
  }, [selectedEvent, view])

  useEffect(() => {
    if (!selectedEvent || view !== 'pool') return
    const event = selectedEvent.id
    let cancelled = false
    api
      .shifts(event)
      .then((shifts) => {
        if (!cancelled) setLoadedDays({ event, days: [...new Set(shifts.map((s) => s.date))].sort() })
      })
      .catch((err) => !cancelled && setPoolError(err instanceof ApiError ? err.message : 'Kunne ikke laste vaktdagene.'))
    return () => {
      cancelled = true
    }
  }, [selectedEvent, view])

  const loadPool = () => {
    if (!selectedEvent || !date) return
    const request = ++latestPool.current
    setPoolLoading(true)
    setPoolError('')
    api
      .pool(selectedEvent.id, date)
      .then((data) => {
        if (request !== latestPool.current) return
        setEntries(data)
        const defaults: Record<number, number> = {}
        data.forEach((entry) => {
          if (entry.suggested_oppgave_slot) defaults[entry.user.id] = entry.suggested_oppgave_slot.id
        })
        setSelection(defaults)
      })
      .catch((err) => {
        if (request !== latestPool.current) return
        setEntries([])
        setPoolError(err instanceof ApiError ? err.message : 'Kunne ikke laste pool.')
      })
      .finally(() => request === latestPool.current && setPoolLoading(false))
  }

  useEffect(loadPool, [selectedEvent, date])

  if (!selectedEvent) return <p className="text-ink-600">Ingen arrangement valgt.</p>
  if (!canSeeInnsjekk && !canSeePool) {
    return (
      <Card>
        <p className="text-ink-600">Du har ikke tilgang til innsjekk eller pool.</p>
      </Card>
    )
  }

  const matches =
    search.trim().length < 2
      ? []
      : users.filter((u) => {
          const term = search.trim().toLowerCase()
          return u.email.toLowerCase().includes(term) || displayName(u).toLowerCase().includes(term)
        })

  const handleManualCheckin = async (user: User) => {
    setCheckingInId(user.id)
    setInnsjekkError('')
    setInnsjekkMessage('')
    try {
      const result = await api.checkinByUserId(selectedEvent.id, user.id)
      setInnsjekkMessage(`${result.user.email}: ${result.message}`)
      setSearch('')
    } catch (err) {
      setInnsjekkError(err instanceof ApiError ? err.message : 'Kunne ikke sjekke inn.')
    } finally {
      setCheckingInId(null)
    }
  }

  const handleCodeCheckin = async (e: FormEvent) => {
    e.preventDefault()
    if (!userCode.trim()) return
    setSubmitting(true)
    setInnsjekkError('')
    setInnsjekkMessage('')
    try {
      const result = await api.checkinByCode(selectedEvent.id, userCode.trim())
      setInnsjekkMessage(`${result.user.email}: ${result.message}`)
      setUserCode('')
    } catch (err) {
      setInnsjekkError(err instanceof ApiError ? err.message : 'Kunne ikke sjekke inn.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAssign = async (userId: number) => {
    const oppgaveSlotId = selection[userId]
    if (!oppgaveSlotId) return
    setAssigning(userId)
    setPoolError('')
    try {
      await api.assign(selectedEvent.id, userId, oppgaveSlotId)
      loadPool()
    } catch (err) {
      setPoolError(err instanceof ApiError ? err.message : 'Kunne ikke tildele oppgave.')
    } finally {
      setAssigning(null)
    }
  }

  const handleRemoveCheckin = async (entry: PoolEntry) => {
    if (!confirm(`Fjerne innsjekkingen til ${displayName(entry.user)}?`)) return
    setAssigning(entry.user.id)
    setPoolError('')
    try {
      await api.removeCheckin(selectedEvent.id, entry.user.id, date)
      loadPool()
    } catch (err) {
      setPoolError(err instanceof ApiError ? err.message : 'Kunne ikke fjerne innsjekkingen.')
    } finally {
      setAssigning(null)
    }
  }

  // Someone who may place people but not check them in lands on the pool.
  if (view === 'innsjekk' && !canSeeInnsjekk) return <Navigate to="/pool" replace />

  return (
    <div>
      <PageHeader title={view === 'innsjekk' ? 'Innsjekk' : 'Pool & tildeling'} subtitle={selectedEvent.title} />

      {view === 'innsjekk' && canSeeInnsjekk && (
        <>
          <ErrorText>{innsjekkError}</ErrorText>
          {innsjekkMessage && <p className="mb-4 text-sm text-green-800">{innsjekkMessage}</p>}

          <p className="mb-6 text-sm text-ink-600">
            {selectedEvent.checkin_mode === 'personal_qr'
              ? 'Personlig QR — en ansvarlig skanner hver frivillig sin egen kode.'
              : 'Delt QR — de frivillige skanner én delt kode selv.'}{' '}
            <Link to="/arrangement" className="font-medium text-green-800 underline">
              Endre innsjekk-modus i Arrangement
            </Link>
          </p>

          <Card className="mb-6 max-w-md">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-600">Sjekk inn manuelt</h2>
            <Label>Søk på navn eller e-post</Label>
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Skriv minst 2 tegn …"
            />
            {matches.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                {matches.map((u) => (
                  <div key={u.id} className="flex items-center justify-between rounded-lg bg-cream-50 px-3 py-2">
                    <span className="text-sm text-ink-900">
                      {displayName(u)}
                      {displayName(u) !== u.email && <span className="ml-2 text-xs text-ink-400">{u.email}</span>}
                    </span>
                    <Button
                      onClick={() => handleManualCheckin(u)}
                      disabled={checkingInId === u.id}
                      className="!px-3 !py-1.5 !text-xs"
                    >
                      {checkingInId === u.id ? 'Sjekker inn …' : 'Sjekk inn'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {search.trim().length >= 2 && matches.length === 0 && (
              <p className="mt-2 text-sm text-ink-400">Ingen treff.</p>
            )}
          </Card>

          {selectedEvent.checkin_mode === 'personal_qr' ? (
            <Card className="max-w-md">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-600">Skann personlig QR</h2>
              <form onSubmit={handleCodeCheckin} className="flex flex-col gap-3">
                <div>
                  <Label>Kode (skann eller skriv inn)</Label>
                  <Input
                    value={userCode}
                    onChange={(e) => setUserCode(e.target.value)}
                    placeholder="f.eks. fra en håndholdt skanner"
                  />
                </div>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Sjekker inn …' : 'Sjekk inn'}
                </Button>
              </form>
            </Card>
          ) : (
            <Card className="max-w-md text-center">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-600">Delt innsjekk-kode</h2>
              <p className="mb-4 text-sm text-ink-600">
                Vis denne på en skjerm ved inngangen — de frivillige skanner den selv i appen.
              </p>
              <canvas ref={canvasRef} className="mx-auto" />
            </Card>
          )}
        </>
      )}

      {view === 'pool' && canSeePool && (
        <>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <p className="text-sm text-ink-600">
              Innsjekkede frivillige som venter på en oppgave, eldste ankomst først
            </p>
            <div className="w-56 max-w-full">
              <Label>Dato</Label>
              <Select aria-label="Dato" value={date} disabled={!days?.length} onChange={(e) => setPicked({ event: selectedEvent.id, date: e.target.value, on: today })}>
                {days?.map((d) => (
                  <option key={d} value={d}>
                    {eventDayLabel(d)}
                    {d === today ? ' (i dag)' : ''}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <ErrorText>{poolError}</ErrorText>

          {days?.length === 0 ? (
            <Card>
              <p className="text-ink-600">Arrangementet har ingen vakter ennå, så det er ingen dager å velge.</p>
            </Card>
          ) : poolLoading && !poolError ? (
            <p className="text-ink-600">Laster …</p>
          ) : entries.length === 0 ? (
            <Card>
              <p className="text-ink-600">Ingen venter i poolen akkurat nå.</p>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {entries.map((entry) => (
                <Card key={entry.user.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-ink-900">{entry.user.email}</p>
                      <p className="text-sm text-ink-600">Sjekket inn kl. {formatTime(entry.checked_in_at)}</p>
                      {entry.candidates.length === 0 ? (
                        <p className="mt-1 text-sm text-ink-400">Ikke meldt interesse for noen oppgave i dag.</p>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {entry.candidates.map((c) => (
                            <Badge
                              key={c.id}
                              tone={
                                isFullForAssignment(c.oppgave_slot)
                                  ? 'critical'
                                  : c.oppgave_slot.id === entry.suggested_oppgave_slot?.id
                                    ? 'success'
                                    : 'neutral'
                              }
                            >
                              {c.oppgave_slot.shift_title} — {c.oppgave_slot.skill_name}
                              {c.shift.is_critical && (c.has_relevant_experience ? ' · erfaren' : ' · uerfaren')}
                              {isFullForAssignment(c.oppgave_slot) && ' · full'}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-shrink-0 items-end gap-2">
                      <div className="w-64">
                        <Label>Tildel oppgave</Label>
                        <Select
                          value={selection[entry.user.id] ?? ''}
                          onChange={(e) => setSelection({ ...selection, [entry.user.id]: Number(e.target.value) })}
                        >
                          <option value="">Velg oppgave …</option>
                          {assignableSlots(entry).map((slot) => (
                            <option key={slot.id} value={slot.id} disabled={isFullForAssignment(slot)}>
                              {slot.shift_title} — {slot.skill_name}
                              {slot.capacity !== null ? ` (${slot.assigned_count}/${slot.capacity})` : ''}
                              {isFullForAssignment(slot) ? ' · full' : ''}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <Button
                        onClick={() => handleAssign(entry.user.id)}
                        disabled={!selection[entry.user.id] || assigning === entry.user.id}
                      >
                        {assigning === entry.user.id ? 'Tildeler …' : 'Tildel'}
                      </Button>
                      {canSeeInnsjekk && (
                        <Button
                          variant="danger"
                          onClick={() => handleRemoveCheckin(entry)}
                          disabled={assigning === entry.user.id}
                        >
                          Fjern
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
