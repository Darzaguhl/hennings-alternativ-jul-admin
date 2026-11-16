import { useEffect, useMemo, useState } from 'react'
import { useEvents } from '../context/EventContext'
import { api, ApiError } from '../api/client'
import type { Standing as StandingRow, StandingLevel, StandingOverrideLevel } from '../types'
import { Badge, Button, Card, ErrorText, Input, PageHeader, Select } from '../components/ui'
import { hasAdminAccess } from '../utils/roles'

const LEVEL_LABEL: Record<StandingLevel, string> = { good: 'Bra', concern: 'Følg opp', new: 'Ny' }
const LEVEL_TONE: Record<StandingLevel, 'success' | 'critical' | 'neutral'> = {
  good: 'success',
  concern: 'critical',
  new: 'neutral',
}

const explain = (r: StandingRow) => {
  const parts: string[] = []
  if (r.reasons.includes('bekymring')) parts.push(`${r.ratings.bekymring} vurdering(er) med Bekymring`)
  if (r.reasons.includes('no_shows')) {
    const judged = r.attended + r.no_shows
    parts.push(`uteblitt på ${r.no_shows} av ${judged} vakter`)
  }
  return parts.join(' · ')
}

// Internal standing of volunteers: derived from post-event ratings, check-in
// attendance and fremhevinger, with an admin override (and a required reason).
// Admin-only and never shown to the volunteer. It only *filters* -- a human
// still decides who gets asked back.
export default function Standing() {
  const { selectedEvent } = useEvents()
  const isAdmin = hasAdminAccess(selectedEvent?.viewer_role)

  const [rows, setRows] = useState<StandingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'' | StandingLevel>('')

  // Which person's override editor is open, and its draft.
  const [editing, setEditing] = useState<number | null>(null)
  const [draftLevel, setDraftLevel] = useState<StandingOverrideLevel>('good')
  const [draftNote, setDraftNote] = useState('')
  const [busy, setBusy] = useState<number | null>(null)

  const load = () => {
    if (!isAdmin) return
    setLoading(true)
    setError('')
    api
      .standings()
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Kunne ikke laste standing.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [isAdmin])

  const counts = useMemo(() => {
    const c = { good: 0, concern: 0, new: 0 }
    rows.forEach((r) => (c[r.standing] += 1))
    return c
  }, [rows])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(
      (r) =>
        (!filter || r.standing === filter) &&
        (!q || r.user_name.toLowerCase().includes(q) || r.user_email.toLowerCase().includes(q)),
    )
  }, [rows, search, filter])

  if (!selectedEvent) return <p className="text-ink-600">Ingen arrangement valgt.</p>
  if (!isAdmin) return <p className="text-ink-600">Kun admin har tilgang til standing.</p>

  const openEditor = (r: StandingRow) => {
    setEditing(editing === r.user ? null : r.user)
    setDraftLevel(r.override ?? (r.computed === 'concern' ? 'good' : 'concern'))
    setDraftNote(r.override_note)
    setError('')
  }

  const handleSave = async (r: StandingRow) => {
    if (!draftNote.trim()) {
      setError('Skriv en kort begrunnelse for overstyringen.')
      return
    }
    setBusy(r.user)
    setError('')
    try {
      const updated = await api.setStandingOverride(r.user, { level: draftLevel, note: draftNote.trim() })
      setRows((prev) => prev.map((x) => (x.user === updated.user ? updated : x)))
      setEditing(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke lagre overstyringen.')
    } finally {
      setBusy(null)
    }
  }

  const handleClear = async (r: StandingRow) => {
    setBusy(r.user)
    setError('')
    try {
      await api.clearStandingOverride(r.user)
      setEditing(null)
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke fjerne overstyringen.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Standing"
        subtitle="Intern oversikt over hvordan de frivillige har vært å jobbe med, basert på vurderinger, oppmøte og fremhevinger. Kun admin ser dette; de frivillige får aldri vite det. Dette filtrerer bare — du bestemmer selv hvem som spørres igjen."
      />
      <div className="mb-4">
        <ErrorText>{error}</ErrorText>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-[14rem] flex-1">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Søk navn eller e-post" />
        </div>
        <div className="w-48">
          <Select value={filter} onChange={(e) => setFilter(e.target.value as '' | StandingLevel)}>
            <option value="">Alle ({rows.length})</option>
            <option value="good">Bra ({counts.good})</option>
            <option value="concern">Følg opp ({counts.concern})</option>
            <option value="new">Ny ({counts.new})</option>
          </Select>
        </div>
      </div>

      {loading ? (
        <p className="text-ink-600">Laster …</p>
      ) : visible.length === 0 ? (
        <Card>
          <p className="text-ink-600">
            {rows.length === 0 ? 'Ingen frivillige å vise ennå.' : 'Ingen matcher filteret.'}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((r) => (
            <Card key={r.user} className="!p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-ink-900">
                    {r.user_name || r.user_email}{' '}
                    <Badge tone={LEVEL_TONE[r.standing]}>{LEVEL_LABEL[r.standing]}</Badge>
                    {r.override && <span className="ml-2 text-xs text-ink-600">overstyrt</span>}
                  </p>
                  <p className="text-sm text-ink-600">
                    {r.events} arrangement · møtt {r.attended + r.walk_ins}
                    {r.no_shows > 0 ? ` · uteblitt ${r.no_shows}` : ''}
                    {r.excused > 0 ? ` · ${r.excused} unntatt` : ''}
                    {r.upcoming > 0 ? ` · ${r.upcoming} kommende` : ''}
                    {r.commendations > 0 ? ` · ★ ${r.commendations}` : ''}
                  </p>
                  <p className="text-sm text-ink-600">
                    Vurderinger: Utmerket {r.ratings.utmerket} · God {r.ratings.god} · Ok {r.ratings.ok} · Bekymring{' '}
                    {r.ratings.bekymring}
                  </p>
                  {explain(r) && <p className="mt-1 text-sm text-red-600">Automatisk: {explain(r)}</p>}
                  {r.override && (
                    <p className="mt-1 text-sm italic text-ink-600">
                      Overstyrt til «{LEVEL_LABEL[r.override]}»: {r.override_note}
                    </p>
                  )}
                </div>
                <Button variant="secondary" disabled={busy === r.user} onClick={() => openEditor(r)}>
                  {r.override ? 'Endre overstyring' : 'Overstyr'}
                </Button>
              </div>

              {editing === r.user && (
                <div className="mt-3 flex flex-col gap-2 rounded-lg bg-cream-100 p-3">
                  <div className="flex flex-wrap gap-2">
                    {(['good', 'concern'] as const).map((level) => (
                      <Button
                        key={level}
                        variant={draftLevel === level ? 'primary' : 'secondary'}
                        aria-pressed={draftLevel === level}
                        onClick={() => setDraftLevel(level)}
                      >
                        {LEVEL_LABEL[level]}
                      </Button>
                    ))}
                  </div>
                  <Input
                    value={draftNote}
                    onChange={(e) => setDraftNote(e.target.value)}
                    maxLength={300}
                    placeholder="Påkrevd: hvorfor overstyrer du?"
                  />
                  <div className="flex gap-2">
                    <Button disabled={busy === r.user} onClick={() => handleSave(r)}>
                      Lagre
                    </Button>
                    {r.override && (
                      <Button variant="danger" disabled={busy === r.user} onClick={() => handleClear(r)}>
                        Fjern overstyring
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
