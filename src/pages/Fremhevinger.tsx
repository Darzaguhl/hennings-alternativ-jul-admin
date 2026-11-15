import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useEvents } from '../context/EventContext'
import { api, ApiError } from '../api/client'
import type { Assignment, Commendation, Shift } from '../types'
import { Badge, Button, Card, ErrorText, Input, PageHeader } from '../components/ui'
import { hasAdminAccess } from '../utils/roles'

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('no-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const personName = (a: Assignment['user']) =>
  `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim() || a.email

// "Fremhev" = a leader (or admin) flagging someone who could take on more
// responsibility, raised during the event. Internal only -- the flagged
// volunteer never sees it, and a leader only ever sees the flags they
// raised themselves (the API scopes it); admins see everyone's.
export default function Fremhevinger() {
  const { user } = useAuth()
  const { selectedEvent } = useEvents()
  const isAdmin = hasAdminAccess(selectedEvent?.viewer_role)

  const [shifts, setShifts] = useState<Shift[]>([])
  const [teams, setTeams] = useState<Record<number, Assignment[]>>({})
  const [flags, setFlags] = useState<Commendation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Which person's note box is open, and its draft text.
  const [notingKey, setNotingKey] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const load = () => {
    if (!selectedEvent) return
    setLoading(true)
    setError('')
    api
      .shifts(selectedEvent.id)
      .then(async (all) => {
        // Admins can flag anyone assigned on any vakt; a leader only their
        // own -- is_led_by_viewer mirrors the backend's permission check.
        const mine = (isAdmin ? all : all.filter((s) => s.is_led_by_viewer)).sort((a, b) =>
          `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`),
        )
        const [assignments, commendations] = await Promise.all([
          Promise.all(mine.map((s) => api.shiftAssignments(s.id))),
          api.commendations({ event: selectedEvent.id }),
        ])
        const byShift: Record<number, Assignment[]> = {}
        mine.forEach((s, i) => {
          byShift[s.id] = assignments[i]
        })
        setShifts(mine)
        setTeams(byShift)
        setFlags(commendations)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Kunne ikke laste fremhevinger.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [selectedEvent, isAdmin])

  const flagFor = useMemo(() => {
    const map = new Map<string, Commendation>()
    flags.forEach((f) => map.set(`${f.shift}-${f.user}`, f))
    return map
  }, [flags])

  if (!selectedEvent) return <p className="text-ink-600">Ingen arrangement valgt.</p>

  const handleFlag = async (shiftId: number, userId: number) => {
    const key = `${shiftId}-${userId}`
    setBusyKey(key)
    setError('')
    try {
      const created = await api.createCommendation({ shift: shiftId, user: userId, note: note.trim() })
      setFlags((prev) => [created, ...prev])
      setNotingKey(null)
      setNote('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke fremheve.')
    } finally {
      setBusyKey(null)
    }
  }

  const handleRemove = async (flag: Commendation) => {
    if (!confirm(`Fjerne fremhevingen av ${flag.user_name || flag.user_email}?`)) return
    setError('')
    try {
      await api.deleteCommendation(flag.id)
      setFlags((prev) => prev.filter((f) => f.id !== flag.id))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke fjerne fremhevingen.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Fremhevinger"
        subtitle={`${selectedEvent.title} — fremhev noen som kan ta mer ansvar. Kun admin og den som fremhevet ser dette; personen får ikke vite det.`}
      />
      <div className="mb-4">
        <ErrorText>{error}</ErrorText>
      </div>

      {loading ? (
        <p className="text-ink-600">Laster …</p>
      ) : (
        <div className="flex flex-col gap-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-600">
              {isAdmin ? 'Fremhevet' : 'Mine fremhevinger'}
            </h2>
            {flags.length === 0 ? (
              <Card>
                <p className="text-ink-600">Ingen er fremhevet ennå.</p>
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {flags.map((f) => (
                  <Card key={f.id} className="!p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-ink-900">{f.user_name || f.user_email}</p>
                        <p className="text-sm text-ink-600">
                          {f.shift_title}
                          {f.skill_name ? ` — ${f.skill_name}` : ''} · {formatDateTime(f.created_at)}
                          {isAdmin && f.flagged_by_email ? ` · av ${f.flagged_by_email}` : ''}
                        </p>
                        {f.note && <p className="mt-1 text-sm italic text-ink-600">«{f.note}»</p>}
                      </div>
                      <Button variant="danger" onClick={() => handleRemove(f)}>
                        Fjern
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-600">
              {isAdmin ? 'Alle vakter' : 'Mine vakter'}
            </h2>
            {shifts.length === 0 ? (
              <Card>
                <p className="text-ink-600">Du leder ingen vakter i dette arrangementet.</p>
              </Card>
            ) : (
              <div className="flex flex-col gap-4">
                {shifts.map((shift) => {
                  // Leaders can't flag themselves (backend rejects it too).
                  const team = (teams[shift.id] ?? []).filter((a) => a.user.id !== user?.id)
                  return (
                    <Card key={shift.id}>
                      <p className="font-medium text-ink-900">
                        {shift.title}{' '}
                        <span className="text-sm font-normal text-ink-600">
                          {shift.date} · {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}
                        </span>
                      </p>
                      {team.length === 0 ? (
                        <p className="mt-2 text-sm text-ink-400">Ingen tildelt ennå.</p>
                      ) : (
                        <div className="mt-3 flex flex-col gap-2">
                          {team.map((a) => {
                            const key = `${shift.id}-${a.user.id}`
                            const flag = flagFor.get(key)
                            return (
                              <div key={a.id} className="rounded-lg bg-cream-100 px-3 py-2">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <span className="text-sm font-medium text-ink-900">{personName(a.user)}</span>
                                    {a.oppgave_slot.skill_name && (
                                      <span className="ml-2 text-xs text-ink-600">{a.oppgave_slot.skill_name}</span>
                                    )}
                                  </div>
                                  {flag ? (
                                    <Badge tone="success">★ Fremhevet</Badge>
                                  ) : (
                                    <Button
                                      variant="secondary"
                                      disabled={busyKey === key}
                                      onClick={() => {
                                        setNotingKey(notingKey === key ? null : key)
                                        setNote('')
                                      }}
                                    >
                                      Fremhev
                                    </Button>
                                  )}
                                </div>
                                {notingKey === key && !flag && (
                                  <div className="mt-2 flex gap-2">
                                    <Input
                                      value={note}
                                      onChange={(e) => setNote(e.target.value)}
                                      maxLength={300}
                                      placeholder="Valgfritt: hva gjorde de bra?"
                                    />
                                    <Button disabled={busyKey === key} onClick={() => handleFlag(shift.id, a.user.id)}>
                                      Lagre
                                    </Button>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </Card>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
