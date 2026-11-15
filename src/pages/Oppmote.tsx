import { useEffect, useMemo, useState } from 'react'
import { useEvents } from '../context/EventContext'
import { api, ApiError } from '../api/client'
import type { AttendanceDay, AttendanceStatus } from '../types'
import { Badge, Button, Card, ErrorText, PageHeader } from '../components/ui'
import { hasAdminAccess } from '../utils/roles'

const STATUS: Record<AttendanceStatus, { label: string; tone: 'success' | 'critical' | 'neutral' | 'warning' }> = {
  attended: { label: 'Møtt', tone: 'success' },
  walk_in: { label: 'Møtt uten påmelding', tone: 'neutral' },
  no_show: { label: 'Uteblitt', tone: 'critical' },
  untracked: { label: 'Ikke sporet', tone: 'warning' },
  upcoming: { label: 'Kommende', tone: 'neutral' },
}

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('no-NO', { weekday: 'long', day: 'numeric', month: 'long' })

// Per-day attendance: who signed up, who actually checked in, who didn't.
// This is the record behind "uteblitt" in Standing. A past day on which
// nobody was checked in is flagged rather than counted as everyone absent.
export default function Oppmote() {
  const { selectedEvent } = useEvents()
  const isAdmin = hasAdminAccess(selectedEvent?.viewer_role)

  const [days, setDays] = useState<AttendanceDay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [onlyAbsent, setOnlyAbsent] = useState(false)

  useEffect(() => {
    if (!selectedEvent || !isAdmin) return
    setLoading(true)
    setError('')
    api
      .eventAttendance(selectedEvent.id)
      .then((res) => setDays([...res.days].reverse())) // newest first
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Kunne ikke laste oppmøte.'))
      .finally(() => setLoading(false))
  }, [selectedEvent, isAdmin])

  const totals = useMemo(
    () => ({
      noShows: days.reduce((n, d) => n + d.no_shows, 0),
      untracked: days.filter((d) => !d.tracked).length,
    }),
    [days],
  )

  if (!selectedEvent) return <p className="text-ink-600">Ingen arrangement valgt.</p>
  if (!isAdmin) return <p className="text-ink-600">Kun admin har tilgang til oppmøte.</p>

  const shown = onlyAbsent ? days.filter((d) => d.no_shows > 0 || !d.tracked) : days

  return (
    <div>
      <PageHeader
        title="Oppmøte"
        subtitle={`${selectedEvent.title} — hvem som meldte seg på hver dag, hvem som sjekket inn, og hvem som uteble.`}
      />
      <div className="mb-4">
        <ErrorText>{error}</ErrorText>
      </div>

      {loading ? (
        <p className="text-ink-600">Laster …</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <p className="text-sm text-ink-600">
              {totals.noShows} uteblitt totalt
              {totals.untracked > 0 ? ` · ${totals.untracked} dag(er) uten innsjekk` : ''}
            </p>
            <Button variant="secondary" onClick={() => setOnlyAbsent((v) => !v)} aria-pressed={onlyAbsent}>
              {onlyAbsent ? 'Vis alle dager' : 'Vis bare dager med uteblitte'}
            </Button>
          </div>

          {shown.length === 0 ? (
            <Card>
              <p className="text-ink-600">{days.length === 0 ? 'Ingen påmeldinger eller innsjekker ennå.' : 'Ingen dager matcher.'}</p>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {shown.map((day) => (
                <Card key={day.date}>
                  <p className="font-medium capitalize text-ink-900">
                    {formatDate(day.date)}{' '}
                    <span className="text-sm font-normal normal-case text-ink-600">
                      {day.signed_up} påmeldt · {day.checked_in} møtt
                      {day.no_shows > 0 ? ` · ${day.no_shows} uteblitt` : ''}
                    </span>
                  </p>
                  {!day.tracked && (
                    <p className="mt-1 text-sm text-gold-600">
                      Ingen innsjekk registrert denne dagen — påmeldte telles ikke som uteblitt.
                    </p>
                  )}
                  <div className="mt-3 flex flex-col gap-1">
                    {day.people.map((p) => (
                      <div key={p.user} className="flex items-center justify-between gap-3 rounded-lg bg-cream-100 px-3 py-2">
                        <div>
                          <span className="text-sm font-medium text-ink-900">{p.user_name || p.user_email}</span>
                          {(p.assigned || p.oppgaver.length > 0) && (
                            <span className="ml-2 text-xs text-ink-600">{p.assigned ?? p.oppgaver.join(', ')}</span>
                          )}
                        </div>
                        <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
                      </div>
                    ))}
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
