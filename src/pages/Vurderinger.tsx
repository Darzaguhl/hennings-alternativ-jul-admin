import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useEvents } from '../context/EventContext'
import { api, ApiError } from '../api/client'
import type { Assignment, Rating, RatingLevel, Shift } from '../types'
import { Badge, Button, Card, ErrorText, Input, PageHeader } from '../components/ui'
import { hasAdminAccess } from '../utils/roles'

const LEVELS: { value: RatingLevel; label: string; tone: 'success' | 'neutral' | 'critical' }[] = [
  { value: 'utmerket', label: 'Utmerket', tone: 'success' },
  { value: 'god', label: 'God', tone: 'success' },
  { value: 'ok', label: 'Ok', tone: 'neutral' },
  { value: 'bekymring', label: 'Bekymring', tone: 'critical' },
]
const levelInfo = (level: RatingLevel) => LEVELS.find((l) => l.value === level) ?? LEVELS[2]

const personName = (a: Assignment['user']) =>
  `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim() || a.email

// Post-event rating of the volunteers on a vakt: Utmerket / God / Ok /
// Bekymring, per person, per vakt, per leader. Internal only -- the rated
// volunteer never sees it. What a leader can read of *other* leaders'
// ratings is an event setting (Arrangement); the API enforces it, this page
// just shows whatever comes back. "Bekymring" needs a note.
export default function Vurderinger() {
  const { user } = useAuth()
  const { selectedEvent } = useEvents()
  const isAdmin = hasAdminAccess(selectedEvent?.viewer_role)

  const [shifts, setShifts] = useState<Shift[]>([])
  const [teams, setTeams] = useState<Record<number, Assignment[]>>({})
  const [ratings, setRatings] = useState<Rating[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Which person's editor is open, and its draft.
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draftLevel, setDraftLevel] = useState<RatingLevel | null>(null)
  const [draftNote, setDraftNote] = useState('')
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const load = () => {
    if (!selectedEvent) return
    setLoading(true)
    setError('')
    api
      .shifts(selectedEvent.id)
      .then(async (all) => {
        const mine = (isAdmin ? all : all.filter((s) => s.is_led_by_viewer)).sort((a, b) =>
          `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`),
        )
        const [assignments, fetched] = await Promise.all([
          Promise.all(mine.map((s) => api.shiftAssignments(s.id))),
          api.ratings({ event: selectedEvent.id }),
        ])
        const byShift: Record<number, Assignment[]> = {}
        mine.forEach((s, i) => {
          byShift[s.id] = assignments[i]
        })
        setShifts(mine)
        setTeams(byShift)
        setRatings(fetched)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Kunne ikke laste vurderinger.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [selectedEvent, isAdmin])

  // My own rating of someone on a vakt (at most one), and everyone else's
  // (only non-empty for admins, or when the event shares ratings).
  const { mineByKey, othersByKey } = useMemo(() => {
    const mine = new Map<string, Rating>()
    const others = new Map<string, Rating[]>()
    ratings.forEach((r) => {
      const key = `${r.shift}-${r.user}`
      if (r.rated_by === user?.id) mine.set(key, r)
      else others.set(key, [...(others.get(key) ?? []), r])
    })
    return { mineByKey: mine, othersByKey: others }
  }, [ratings, user?.id])

  if (!selectedEvent) return <p className="text-ink-600">Ingen arrangement valgt.</p>

  const openEditor = (key: string, existing?: Rating) => {
    setEditingKey(editingKey === key ? null : key)
    setDraftLevel(existing?.level ?? null)
    setDraftNote(existing?.note ?? '')
    setError('')
  }

  const handleSave = async (shiftId: number, userId: number, existing?: Rating) => {
    const key = `${shiftId}-${userId}`
    if (!draftLevel) {
      setError('Velg en vurdering først.')
      return
    }
    if (draftLevel === 'bekymring' && !draftNote.trim()) {
      setError('Bekymring må ha en kort begrunnelse.')
      return
    }
    setBusyKey(key)
    setError('')
    try {
      if (existing) {
        const updated = await api.updateRating(existing.id, { level: draftLevel, note: draftNote.trim() })
        setRatings((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
      } else {
        const created = await api.createRating({ shift: shiftId, user: userId, level: draftLevel, note: draftNote.trim() })
        setRatings((prev) => [created, ...prev])
      }
      setEditingKey(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke lagre vurderingen.')
    } finally {
      setBusyKey(null)
    }
  }

  const handleRemove = async (rating: Rating) => {
    if (!confirm(`Fjerne vurderingen av ${rating.user_name || rating.user_email}?`)) return
    setError('')
    try {
      await api.deleteRating(rating.id)
      setRatings((prev) => prev.filter((r) => r.id !== rating.id))
      setEditingKey(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke fjerne vurderingen.')
    }
  }

  const concerns = ratings.filter((r) => r.level === 'bekymring')

  return (
    <div>
      <PageHeader
        title="Vurderinger"
        subtitle={`${selectedEvent.title} — vurder de frivillige etter arrangementet. Kun admin og de som vurderer ser dette; den som vurderes får ikke vite det.`}
      />
      <div className="mb-4">
        <ErrorText>{error}</ErrorText>
      </div>

      {loading ? (
        <p className="text-ink-600">Laster …</p>
      ) : (
        <div className="flex flex-col gap-8">
          {isAdmin && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-600">Bekymringer</h2>
              {concerns.length === 0 ? (
                <Card>
                  <p className="text-ink-600">Ingen bekymringer registrert.</p>
                </Card>
              ) : (
                <div className="flex flex-col gap-2">
                  {concerns.map((r) => (
                    <Card key={r.id} className="!p-4">
                      <p className="font-medium text-ink-900">{r.user_name || r.user_email}</p>
                      <p className="text-sm text-ink-600">
                        {r.shift_title}
                        {r.skill_name ? ` — ${r.skill_name}` : ''}
                        {r.rated_by_email ? ` · av ${r.rated_by_email}` : ''}
                      </p>
                      <p className="mt-1 text-sm italic text-ink-600">«{r.note}»</p>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          )}

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
                  // Nobody rates themselves (backend rejects it too).
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
                            const mine = mineByKey.get(key)
                            const others = othersByKey.get(key) ?? []
                            return (
                              <div key={a.id} className="rounded-lg bg-cream-100 px-3 py-2">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <span className="text-sm font-medium text-ink-900">{personName(a.user)}</span>
                                    {a.oppgave_slot.skill_name && (
                                      <span className="ml-2 text-xs text-ink-600">{a.oppgave_slot.skill_name}</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {mine && <Badge tone={levelInfo(mine.level).tone}>{levelInfo(mine.level).label}</Badge>}
                                    <Button
                                      variant="secondary"
                                      disabled={busyKey === key}
                                      onClick={() => openEditor(key, mine)}
                                    >
                                      {mine ? 'Endre' : 'Vurder'}
                                    </Button>
                                  </div>
                                </div>

                                {mine?.note && editingKey !== key && (
                                  <p className="mt-1 text-sm italic text-ink-600">«{mine.note}»</p>
                                )}
                                {others.map((r) => (
                                  <p key={r.id} className="mt-1 text-xs text-ink-600">
                                    {levelInfo(r.level).label} fra {r.rated_by_email ?? 'ukjent'}
                                    {r.note ? ` — «${r.note}»` : ''}
                                  </p>
                                ))}

                                {editingKey === key && (
                                  <div className="mt-3 flex flex-col gap-2">
                                    <div className="flex flex-wrap gap-2">
                                      {LEVELS.map((l) => (
                                        <Button
                                          key={l.value}
                                          variant={draftLevel === l.value ? 'primary' : 'secondary'}
                                          aria-pressed={draftLevel === l.value}
                                          onClick={() => setDraftLevel(l.value)}
                                        >
                                          {l.label}
                                        </Button>
                                      ))}
                                    </div>
                                    <Input
                                      value={draftNote}
                                      onChange={(e) => setDraftNote(e.target.value)}
                                      maxLength={500}
                                      placeholder={
                                        draftLevel === 'bekymring'
                                          ? 'Påkrevd: hva skjedde?'
                                          : 'Valgfritt: en kort kommentar'
                                      }
                                    />
                                    <div className="flex gap-2">
                                      <Button disabled={busyKey === key} onClick={() => handleSave(shift.id, a.user.id, mine)}>
                                        Lagre
                                      </Button>
                                      {mine && (
                                        <Button variant="danger" onClick={() => handleRemove(mine)}>
                                          Fjern
                                        </Button>
                                      )}
                                    </div>
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
