import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useEvents } from '../context/EventContext'
import { api, ApiError } from '../api/client'
import type { Assignment, Commendation, Rating, RatingLevel, Shift } from '../types'
import { Button, Card, ErrorText, Input, PageHeader } from '../components/ui'
import { hasAdminAccess } from '../utils/roles'

const LEVELS: { value: RatingLevel; label: string; active: string }[] = [
  { value: 'utmerket', label: 'Utmerket', active: 'bg-green-800 text-cream-50' },
  { value: 'god', label: 'God', active: 'bg-green-700 text-cream-50' },
  { value: 'ok', label: 'Ok', active: 'bg-ink-600 text-cream-50' },
  { value: 'bekymring', label: 'Bekymring', active: 'bg-red-600 text-cream-50' },
]
const levelLabel = (level: RatingLevel) => LEVELS.find((l) => l.value === level)?.label ?? level

// A note written for a concern isn't a note for praise, and the other way round.
const crossesConcern = (a: RatingLevel | null, b: RatingLevel | null) => (a === 'bekymring') !== (b === 'bekymring')
// The note a rating panel starts with when `level` is chosen over `existing`.
const noteFor = (existing: Rating | undefined, level: RatingLevel | null) =>
  existing && !crossesConcern(existing.level, level) ? existing.note : ''

const personName = (a: Assignment['user']) => `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim() || a.email
const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback)

// The people on each vakt, with the two things a leader (or admin) can say
// about them in one row: ★ "could take on more responsibility" (fremhev), and
// the rating after the vakt (Utmerket / God / Ok / Bekymring). Both are
// internal -- the volunteer never sees either. What a leader may read of other
// people's flags and ratings is decided by the API; this shows what it returns.
export default function Team() {
  const { user } = useAuth()
  const { selectedEvent } = useEvents()
  const isAdmin = hasAdminAccess(selectedEvent?.viewer_role)

  const [shifts, setShifts] = useState<Shift[]>([])
  const [teams, setTeams] = useState<Record<number, Assignment[]>>({})
  const [flags, setFlags] = useState<Commendation[]>([])
  const [ratings, setRatings] = useState<Rating[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Which person's note panel is open ("shift-user"), and its drafts.
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [draftLevel, setDraftLevel] = useState<RatingLevel | null>(null)
  const [draftNote, setDraftNote] = useState('')
  // What the note field started with, to tell whether anything was typed.
  const [startNote, setStartNote] = useState('')
  const [draftFlagNote, setDraftFlagNote] = useState('')
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const load = () => {
    if (!selectedEvent) return
    setLoading(true)
    setError('')
    api
      .shifts(selectedEvent.id)
      .then(async (all) => {
        // Admins see every vakt; a leader only their own (is_led_by_viewer
        // mirrors the backend's permission check).
        const mine = (isAdmin ? all : all.filter((s) => s.is_led_by_viewer)).sort((a, b) =>
          `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`),
        )
        const [assignments, commendations, fetched] = await Promise.all([
          Promise.all(mine.map((s) => api.shiftAssignments(s.id))),
          api.commendations({ event: selectedEvent.id }),
          api.ratings({ event: selectedEvent.id }),
        ])
        const byShift: Record<number, Assignment[]> = {}
        mine.forEach((s, i) => {
          byShift[s.id] = assignments[i]
        })
        setShifts(mine)
        setTeams(byShift)
        setFlags(commendations)
        setRatings(fetched)
      })
      .catch((err) => setError(message(err, 'Kunne ikke laste teamet.')))
      .finally(() => setLoading(false))
  }

  useEffect(load, [selectedEvent, isAdmin])

  const byKey = useMemo(() => {
    const myRating = new Map<string, Rating>()
    const otherRatings = new Map<string, Rating[]>()
    const myFlag = new Map<string, Commendation>()
    const otherFlags = new Map<string, Commendation[]>()
    ratings.forEach((r) => {
      const key = `${r.shift}-${r.user}`
      if (r.rated_by === user?.id) myRating.set(key, r)
      else otherRatings.set(key, [...(otherRatings.get(key) ?? []), r])
    })
    flags.forEach((f) => {
      const key = `${f.shift}-${f.user}`
      if (f.flagged_by === user?.id) myFlag.set(key, f)
      else otherFlags.set(key, [...(otherFlags.get(key) ?? []), f])
    })
    return { myRating, otherRatings, myFlag, otherFlags }
  }, [ratings, flags, user?.id])

  if (!selectedEvent) return <p className="text-ink-600">Ingen arrangement valgt.</p>

  // True when nothing in the open panel would be lost: a level chosen or text
  // typed there only counts once it's saved, so ask before dropping it.
  const mayDiscardDraft = () => {
    if (!openKey) return true
    const unsaved =
      draftNote !== startNote ||
      draftFlagNote.trim() !== '' ||
      draftLevel !== (byKey.myRating.get(openKey)?.level ?? null)
    return !unsaved || confirm('Du har en vurdering eller et notat som ikke er lagret. Forkaste det?')
  }

  const closePanel = () => {
    if (mayDiscardDraft()) setOpenKey(null)
  }

  const openPanel = (key: string, level?: RatingLevel) => {
    if (openKey !== key && !mayDiscardDraft()) return
    const existing = byKey.myRating.get(key)
    const next = level ?? existing?.level ?? null
    const note = noteFor(existing, next)
    setOpenKey(key)
    setDraftLevel(next)
    setDraftNote(note)
    setStartNote(note)
    setDraftFlagNote('')
    setError('')
  }

  const saveRating = async (shiftId: number, userId: number, level: RatingLevel, note: string) => {
    const key = `${shiftId}-${userId}`
    const existing = byKey.myRating.get(key)
    setBusyKey(key)
    setError('')
    try {
      if (existing) {
        const updated = await api.updateRating(existing.id, { level, note })
        setRatings((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
      } else {
        const created = await api.createRating({ shift: shiftId, user: userId, level, note })
        setRatings((prev) => [created, ...prev])
      }
      // Only this person's panel: someone else's half-written note stays open.
      setOpenKey((open) => (open === key ? null : open))
    } catch (err) {
      setError(message(err, 'Kunne ikke lagre vurderingen.'))
    } finally {
      setBusyKey(null)
    }
  }

  // One click rates, but only when there's no text involved: "Bekymring" needs
  // a reason, a rating that already has a note must not silently carry it over
  // to a new level, and clicking the current rating means "edit it". With the
  // person's panel open, a click only chooses; "Lagre" saves.
  const clickLevel = (shiftId: number, userId: number, level: RatingLevel) => {
    const key = `${shiftId}-${userId}`
    const existing = byKey.myRating.get(key)
    if (openKey === key) {
      if (draftNote === startNote) {
        const note = noteFor(existing, level)
        setDraftNote(note)
        setStartNote(note)
      }
      setDraftLevel(level)
      return
    }
    if (existing?.level === level || level === 'bekymring' || existing?.note) return openPanel(key, level)
    saveRating(shiftId, userId, level, '')
  }

  const removeRating = async (rating: Rating) => {
    if (!confirm(`Fjerne vurderingen av ${rating.user_name || rating.user_email}?`)) return
    try {
      await api.deleteRating(rating.id)
      setRatings((prev) => prev.filter((r) => r.id !== rating.id))
      setOpenKey((open) => (open === `${rating.shift}-${rating.user}` ? null : open))
    } catch (err) {
      setError(message(err, 'Kunne ikke fjerne vurderingen.'))
    }
  }

  const addFlag = async (shiftId: number, userId: number, note: string) => {
    const key = `${shiftId}-${userId}`
    setBusyKey(key)
    setError('')
    try {
      const created = await api.createCommendation({ shift: shiftId, user: userId, note })
      setFlags((prev) => [created, ...prev])
      // Clear the field only if it still holds what was just saved.
      setDraftFlagNote((draft) => (draft.trim() === note ? '' : draft))
    } catch (err) {
      setError(message(err, 'Kunne ikke fremheve.'))
    } finally {
      setBusyKey(null)
    }
  }

  const removeFlag = async (flag: Commendation) => {
    if (!confirm(`Fjerne fremhevingen av ${flag.user_name || flag.user_email}?`)) return
    setError('')
    try {
      await api.deleteCommendation(flag.id)
      setFlags((prev) => prev.filter((f) => f.id !== flag.id))
    } catch (err) {
      setError(message(err, 'Kunne ikke fjerne fremhevingen.'))
    }
  }

  const concerns = isAdmin ? ratings.filter((r) => r.level === 'bekymring') : []
  // Admins see everyone's flags; a leader the ones they raised -- including on
  // people no longer on their vakt, who have no row below to remove it from.
  const listedFlags = isAdmin ? flags : flags.filter((f) => f.flagged_by === user?.id)

  return (
    <div>
      <PageHeader
        title={isAdmin ? 'Team og vurdering' : 'Mitt team'}
        subtitle="★ = kan ta mer ansvar. Kun admin og den som vurderer ser dette."
      />
      <div className="mb-4">
        <ErrorText>{error}</ErrorText>
      </div>

      {loading ? (
        <p className="text-ink-600">Laster …</p>
      ) : (
        <div className="flex flex-col gap-4">
          {(concerns.length > 0 || listedFlags.length > 0) && (
            <Card className="!p-4">
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-ink-900">
                  {isAdmin ? (
                    <>
                      Oppsummering:{' '}
                      <span className={concerns.length ? 'text-red-600' : ''}>
                        {concerns.length} {concerns.length === 1 ? 'bekymring' : 'bekymringer'}
                      </span>{' '}
                      · {listedFlags.length} {listedFlags.length === 1 ? 'fremheving' : 'fremhevinger'}
                    </>
                  ) : (
                    `Mine fremhevinger (${listedFlags.length})`
                  )}
                </summary>
                <ul className="mt-3 flex flex-col gap-2 text-sm">
                  {concerns.map((r) => (
                    <li key={`r${r.id}`}>
                      <span className="font-medium text-red-600">Bekymring:</span> {r.user_name || r.user_email} · {r.shift_title}
                      {r.rated_by_email ? ` · av ${r.rated_by_email}` : ''} — «{r.note}»
                    </li>
                  ))}
                  {listedFlags.map((f) => (
                    <li key={`f${f.id}`}>
                      <span className="font-medium text-green-800">★</span> {f.user_name || f.user_email} · {f.shift_title}
                      {f.flagged_by_email ? ` · av ${f.flagged_by_email}` : ''}
                      {f.note ? ` — «${f.note}»` : ''}{' '}
                      <button className="text-xs text-red-600 underline" onClick={() => removeFlag(f)}>
                        Fjern
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            </Card>
          )}

          {shifts.length === 0 && (
            <Card>
              <p className="text-ink-600">Du leder ingen vakter i dette arrangementet.</p>
            </Card>
          )}

          {shifts.map((shift) => {
            // Nobody rates or flags themselves (the backend rejects it too).
            const members = (teams[shift.id] ?? []).filter((a) => a.user.id !== user?.id)
            return (
              <Card key={shift.id} className="!p-4">
                <p className="font-medium text-ink-900">
                  {shift.title}{' '}
                  <span className="text-sm font-normal text-ink-600">
                    {shift.date} · {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}
                  </span>
                </p>
                {members.length === 0 ? (
                  <p className="mt-1 text-sm text-ink-400">Ingen tildelt ennå.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-cream-200">
                    {members.map((a) => {
                      const key = `${shift.id}-${a.user.id}`
                      const rating = byKey.myRating.get(key)
                      const flag = byKey.myFlag.get(key)
                      const theirFlags = byKey.otherFlags.get(key) ?? []
                      const theirRatings = byKey.otherRatings.get(key) ?? []
                      const busy = busyKey === key
                      return (
                        <li key={a.id} className="py-2">
                          <div className="flex flex-wrap items-center gap-3">
                            <button
                              aria-pressed={!!flag}
                              aria-label={flag ? `Fjern fremheving av ${personName(a.user)}` : `Fremhev ${personName(a.user)}`}
                              title={flag ? 'Fremhevet av deg' : 'Fremhev: kan ta mer ansvar'}
                              disabled={busy}
                              /* With this person's panel open, a reason typed there goes with the star. */
                              onClick={() =>
                                flag ? removeFlag(flag) : addFlag(shift.id, a.user.id, openKey === key ? draftFlagNote.trim() : '')
                              }
                              className={`text-xl leading-none ${flag ? 'text-gold-600' : 'text-ink-400 hover:text-gold-600'}`}
                            >
                              {flag ? '★' : '☆'}
                            </button>
                            <div className="min-w-[10rem] flex-1">
                              <span className="text-sm font-medium text-ink-900">{personName(a.user)}</span>
                              {a.oppgave_slot.skill_name && <span className="ml-2 text-xs text-ink-600">{a.oppgave_slot.skill_name}</span>}
                            </div>
                            <div className="flex flex-wrap gap-1" role="group" aria-label={`Vurdering av ${personName(a.user)}`}>
                              {LEVELS.map((l) => (
                                <button
                                  key={l.value}
                                  aria-pressed={(openKey === key ? draftLevel : rating?.level) === l.value}
                                  disabled={busy}
                                  onClick={() => clickLevel(shift.id, a.user.id, l.value)}
                                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                                    (openKey === key ? draftLevel : rating?.level) === l.value
                                      ? l.active
                                      : 'bg-cream-100 text-ink-600 hover:bg-cream-200'
                                  }`}
                                >
                                  {l.label}
                                </button>
                              ))}
                            </div>
                            <button
                              className="w-12 text-left text-xs text-ink-600 underline"
                              onClick={() => (openKey === key ? closePanel() : openPanel(key))}
                            >
                              {openKey === key ? 'Lukk' : 'Notat'}
                            </button>
                          </div>

                          {openKey !== key && (rating?.note || flag?.note) && (
                            <p className="ml-8 text-xs italic text-ink-600">
                              {[rating?.note && `«${rating.note}»`, flag?.note && `★ «${flag.note}»`].filter(Boolean).join(' · ')}
                            </p>
                          )}
                          {(theirRatings.length > 0 || theirFlags.length > 0) && (
                            <p className="ml-8 text-xs text-ink-600">
                              {[
                                ...theirRatings.map(
                                  (r) => `${levelLabel(r.level)} fra ${r.rated_by_email ?? 'ukjent'}${r.note ? ` («${r.note}»)` : ''}`,
                                ),
                                ...theirFlags.map((f) => `★ fra ${f.flagged_by_email ?? 'ukjent'}${f.note ? ` («${f.note}»)` : ''}`),
                              ].join(' · ')}
                            </p>
                          )}

                          {openKey === key && (
                            <div className="ml-8 mt-2 flex flex-col gap-2 rounded-lg bg-cream-100 p-3">
                              <div className="flex gap-2">
                                <Input
                                  value={draftNote}
                                  onChange={(e) => setDraftNote(e.target.value)}
                                  maxLength={500}
                                  placeholder={
                                    draftLevel === 'bekymring'
                                      ? 'Påkrevd: hva skjedde?'
                                      : draftLevel
                                        ? 'Kommentar til vurderingen (valgfritt)'
                                        : 'Velg en vurdering over først'
                                  }
                                />
                                <Button
                                  disabled={busy || !draftLevel || (draftLevel === 'bekymring' && !draftNote.trim())}
                                  onClick={() => draftLevel && saveRating(shift.id, a.user.id, draftLevel, draftNote.trim())}
                                >
                                  Lagre
                                </Button>
                                {rating && (
                                  <Button variant="danger" onClick={() => removeRating(rating)}>
                                    Fjern
                                  </Button>
                                )}
                              </div>
                              {draftLevel && draftLevel !== rating?.level && (
                                <p className="text-xs text-ink-600">
                                  «{levelLabel(draftLevel)}» er ikke lagret ennå.
                                  {rating?.note && crossesConcern(rating.level, draftLevel) && ` Tidligere notat: «${rating.note}»`}
                                </p>
                              )}
                              {!flag && (
                                <div className="flex gap-2">
                                  <Input
                                    value={draftFlagNote}
                                    onChange={(e) => setDraftFlagNote(e.target.value)}
                                    maxLength={300}
                                    placeholder="★ Fremhev med begrunnelse (valgfritt)"
                                  />
                                  <Button
                                    variant="secondary"
                                    disabled={busy}
                                    onClick={() => addFlag(shift.id, a.user.id, draftFlagNote.trim())}
                                  >
                                    ★ Fremhev
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
