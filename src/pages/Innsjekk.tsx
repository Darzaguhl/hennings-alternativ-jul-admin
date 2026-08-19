import { useEffect, useRef, useState, type FormEvent } from 'react'
import QRCode from 'qrcode'
import { Link } from 'react-router-dom'
import { useEvents } from '../context/EventContext'
import { api, ApiError } from '../api/client'
import type { OppgaveSlot, PoolEntry, User } from '../types'
import { Badge, Button, Card, ErrorText, Input, Label, PageHeader, Select } from '../components/ui'
import { hasAdminAccess } from '../utils/roles'

const displayName = (user: User) => {
  const name = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim()
  return name || user.email
}

const todayIso = () => new Date().toISOString().slice(0, 10)

// OppgaveSlot.is_full reflects signup interest reaching capacity, which is
// expected to happen routinely (that's the whole point of the pool -- more
// candidates than seats) and says nothing about whether there's still room
// to actually assign someone. The assign picker needs to gate on confirmed
// placements instead.
const isFullForAssignment = (slot: OppgaveSlot) => slot.capacity !== null && slot.assigned_count >= slot.capacity

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' })

type Tab = 'innsjekk' | 'pool'

const tabClass = (active: boolean) =>
  `-mb-px border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
    active ? 'border-green-700 text-green-900' : 'border-transparent text-ink-400 hover:text-ink-600'
  }`

export default function Innsjekk() {
  const { selectedEvent } = useEvents()
  const role = selectedEvent?.viewer_role
  // Same gating as the old separate pages/nav items: checkin_staff and
  // admins can do both; shift_leader can see the pool (to assign from it)
  // but not check people in. canSeeInnsjekk is always a subset of
  // canSeePool -- there's no role that sees Innsjekk but not Pool -- so the
  // Pool tab is always available to anyone who reaches this page at all,
  // and only the Innsjekk tab needs to be conditionally hidden.
  const canSeeInnsjekk = hasAdminAccess(role) || role === 'checkin_staff'
  const canSeePool = hasAdminAccess(role) || role === 'checkin_staff' || role === 'shift_leader'

  // Defaults to 'pool' (always visible to anyone who reaches this page) and
  // switches to 'innsjekk' once we actually know the viewer can see it --
  // NOT via useState's initializer, since selectedEvent (and so role/
  // canSeeInnsjekk) is still null on the very first render, before
  // EventContext's fetch resolves. A useState initial value only runs
  // once, on mount, so computing it from canSeeInnsjekk there would
  // permanently lock every viewer onto the Pool tab regardless of role.
  // The tabInitialized ref makes this a one-time default, not something
  // that fights the user's own later tab clicks.
  const [tab, setTab] = useState<Tab>('pool')
  const tabInitialized = useRef(false)

  useEffect(() => {
    if (!tabInitialized.current && selectedEvent) {
      tabInitialized.current = true
      setTab(canSeeInnsjekk ? 'innsjekk' : 'pool')
    }
  }, [selectedEvent, canSeeInnsjekk])

  // Innsjekk state
  const [userCode, setUserCode] = useState('')
  const [innsjekkMessage, setInnsjekkMessage] = useState('')
  const [innsjekkError, setInnsjekkError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [users, setUsers] = useState<User[]>([])
  const [search, setSearch] = useState('')
  const [checkingInId, setCheckingInId] = useState<number | null>(null)

  // Pool state
  const [date, setDate] = useState(todayIso())
  const [entries, setEntries] = useState<PoolEntry[]>([])
  const [selection, setSelection] = useState<Record<number, number>>({})
  const [poolLoading, setPoolLoading] = useState(true)
  const [assigning, setAssigning] = useState<number | null>(null)
  const [poolError, setPoolError] = useState('')

  useEffect(() => {
    if (canSeeInnsjekk) api.users().then(setUsers).catch(() => {})
  }, [canSeeInnsjekk])

  useEffect(() => {
    if (selectedEvent?.checkin_mode === 'event_qr' && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, selectedEvent.code, { width: 260, margin: 1 }).catch(() => {})
    }
  }, [selectedEvent])

  const loadPool = () => {
    if (!selectedEvent) return
    setPoolLoading(true)
    setPoolError('')
    api
      .pool(selectedEvent.id, date)
      .then((data) => {
        setEntries(data)
        const defaults: Record<number, number> = {}
        data.forEach((entry) => {
          if (entry.suggested_oppgave_slot) defaults[entry.user.id] = entry.suggested_oppgave_slot.id
        })
        setSelection(defaults)
      })
      .catch((err) => setPoolError(err instanceof ApiError ? err.message : 'Kunne ikke laste pool.'))
      .finally(() => setPoolLoading(false))
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
      // The person who just checked in may now be waiting in today's pool --
      // refresh it so switching to that tab shows them immediately instead
      // of whatever was loaded before this check-in happened.
      loadPool()
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
      loadPool()
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

  return (
    <div>
      <PageHeader title={canSeeInnsjekk ? 'Innsjekk & pool' : 'Pool & tildeling'} subtitle={selectedEvent.title} />

      {canSeeInnsjekk && (
        <div className="mb-6 flex gap-6 border-b border-cream-200">
          <button onClick={() => setTab('innsjekk')} className={tabClass(tab === 'innsjekk')}>
            Innsjekk
          </button>
          <button onClick={() => setTab('pool')} className={tabClass(tab === 'pool')}>
            Pool &amp; tildeling
          </button>
        </div>
      )}

      {tab === 'innsjekk' && canSeeInnsjekk && (
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

      {tab === 'pool' && canSeePool && (
        <>
          <div className="mb-6 flex items-start justify-between gap-4">
            <p className="text-sm text-ink-600">
              Innsjekkede frivillige som venter på en oppgave, eldste ankomst først
            </p>
            <div className="w-40 flex-shrink-0">
              <Label>Dato</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <ErrorText>{poolError}</ErrorText>

          {poolLoading ? (
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
                          {entry.candidates.map((c) => (
                            <option
                              key={c.oppgave_slot.id}
                              value={c.oppgave_slot.id}
                              disabled={isFullForAssignment(c.oppgave_slot)}
                            >
                              {c.oppgave_slot.shift_title} — {c.oppgave_slot.skill_name}
                              {c.oppgave_slot.capacity !== null
                                ? ` (${c.oppgave_slot.assigned_count}/${c.oppgave_slot.capacity})`
                                : ''}
                              {isFullForAssignment(c.oppgave_slot) ? ' · full' : ''}
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
