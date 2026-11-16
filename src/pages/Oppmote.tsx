import { useEffect, useMemo, useState } from 'react'
import { useEvents } from '../context/EventContext'
import { api, ApiError } from '../api/client'
import type { AttendanceDay, AttendanceStatus } from '../types'
import { Badge, Button, Card, ErrorText, Input, PageHeader } from '../components/ui'
import { hasAdminAccess } from '../utils/roles'

const STATUS: Record<AttendanceStatus, { label: string; tone: 'success' | 'critical' | 'neutral' | 'warning' }> = {
  attended: { label: 'Møtt', tone: 'success' },
  walk_in: { label: 'Møtt uten påmelding', tone: 'neutral' },
  no_show: { label: 'Uteblitt', tone: 'critical' },
  excused: { label: 'Unntatt', tone: 'neutral' },
  upcoming: { label: 'Kommende', tone: 'neutral' },
}

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('no-NO', { weekday: 'long', day: 'numeric', month: 'long' })

// Per-day attendance: who signed up, who actually checked in, who didn't.
// This is the record behind "uteblitt" in Standing. Check-in is expected
// every day, so a past signup with no check-in is an absence -- unless an
// admin excuses it (one person, or every absentee that day at once), e.g. a
// late sick call. Excused absences don't count against anyone.
export default function Oppmote() {
  const { selectedEvent } = useEvents()
  const isAdmin = hasAdminAccess(selectedEvent?.viewer_role)

  const [days, setDays] = useState<AttendanceDay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [onlyAbsent, setOnlyAbsent] = useState(false)

  // Which person-day's excuse note box is open (key = `${date}-${user}`).
  const [excusing, setExcusing] = useState<string | null>(null)
  const [excuseNote, setExcuseNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = () => {
    if (!selectedEvent || !isAdmin) return
    setLoading(true)
    setError('')
    api
      .eventAttendance(selectedEvent.id)
      .then((res) => setDays([...res.days].reverse())) // newest first
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Kunne ikke laste oppmøte.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [selectedEvent, isAdmin])

  const totals = useMemo(
    () => ({
      noShows: days.reduce((n, d) => n + d.no_shows, 0),
      excused: days.reduce((n, d) => n + d.excused, 0),
    }),
    [days],
  )

  if (!selectedEvent) return <p className="text-ink-600">Ingen arrangement valgt.</p>
  if (!isAdmin) return <p className="text-ink-600">Kun admin har tilgang til oppmøte.</p>

  const shown = onlyAbsent ? days.filter((d) => d.no_shows > 0) : days

  // Apply an excuse/un-excuse to the list in place (no reload, so the page
  // doesn't jump): `userId` undefined = every current absentee that day.
  const applyLocally = (date: string, userId: number | undefined, to: 'excused' | 'no_show', note = '') => {
    setDays((prev) =>
      prev.map((d) => {
        if (d.date !== date) return d
        const from = to === 'excused' ? 'no_show' : 'excused'
        const people = d.people.map((p) =>
          p.status === from && (userId === undefined || p.user === userId)
            ? { ...p, status: to, excuse_note: to === 'excused' ? note : '' }
            : p,
        )
        return {
          ...d,
          people,
          no_shows: people.filter((p) => p.status === 'no_show').length,
          excused: people.filter((p) => p.status === 'excused').length,
        }
      }),
    )
  }

  const run = async (key: string, action: () => Promise<unknown>, onDone: () => void, failure: string) => {
    setBusy(key)
    setError('')
    try {
      await action()
      onDone()
      setExcusing(null)
      setExcuseNote('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : failure)
    } finally {
      setBusy(null)
    }
  }

  const excuseOne = (date: string, userId: number) =>
    run(
      `${date}-${userId}`,
      () => api.excuseAbsence(selectedEvent.id, { date, user_id: userId, note: excuseNote.trim() }),
      () => applyLocally(date, userId, 'excused', excuseNote.trim()),
      'Kunne ikke unnta fraværet.',
    )

  const unexcuse = (date: string, userId: number) =>
    run(
      `${date}-${userId}`,
      () => api.unexcuseAbsence(selectedEvent.id, userId, date),
      () => applyLocally(date, userId, 'no_show'),
      'Kunne ikke fjerne unntaket.',
    )

  const excuseAll = (day: AttendanceDay) => {
    if (!confirm(`Unnta alle ${day.no_shows} som uteble ${formatDate(day.date)}? De teller da ikke mot standing.`)) return
    run(
      `${day.date}-all`,
      () => api.excuseAbsence(selectedEvent.id, { date: day.date, all: true }),
      () => applyLocally(day.date, undefined, 'excused'),
      'Kunne ikke unnta fraværet.',
    )
  }

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
              {totals.excused > 0 ? ` · ${totals.excused} unntatt` : ''}
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
                      {day.excused > 0 ? ` · ${day.excused} unntatt` : ''}
                    </span>
                  </p>
                  {day.checked_in === 0 && day.no_shows > 0 && (
                    <p className="mt-1 text-sm text-gold-600">
                      Ingen sjekket inn denne dagen — alle påmeldte står som uteblitt. Ble innsjekk ikke brukt, kan du
                      unnta dem alle.
                    </p>
                  )}
                  {day.no_shows > 1 && (
                    <Button
                      variant="secondary"
                      className="mt-2"
                      disabled={busy === `${day.date}-all`}
                      onClick={() => excuseAll(day)}
                    >
                      Unnta alle uteblitte
                    </Button>
                  )}
                  <div className="mt-3 flex flex-col gap-1">
                    {day.people.map((p) => {
                      const key = `${day.date}-${p.user}`
                      return (
                        <div key={p.user} className="rounded-lg bg-cream-100 px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <span className="text-sm font-medium text-ink-900">{p.user_name || p.user_email}</span>
                              {(p.assigned || p.oppgaver.length > 0) && (
                                <span className="ml-2 text-xs text-ink-600">{p.assigned ?? p.oppgaver.join(', ')}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
                              {p.status === 'no_show' && (
                                <Button
                                  variant="secondary"
                                  disabled={busy === key}
                                  onClick={() => {
                                    setExcusing(excusing === key ? null : key)
                                    setExcuseNote('')
                                  }}
                                >
                                  Unnta
                                </Button>
                              )}
                              {p.status === 'excused' && (
                                <Button variant="danger" disabled={busy === key} onClick={() => unexcuse(day.date, p.user)}>
                                  Fjern unntak
                                </Button>
                              )}
                            </div>
                          </div>
                          {p.status === 'excused' && p.excuse_note && (
                            <p className="mt-1 text-sm italic text-ink-600">«{p.excuse_note}»</p>
                          )}
                          {excusing === key && (
                            <div className="mt-2 flex gap-2">
                              <Input
                                value={excuseNote}
                                onChange={(e) => setExcuseNote(e.target.value)}
                                maxLength={300}
                                placeholder="Valgfritt: hvorfor? (f.eks. syk, ringte)"
                              />
                              <Button disabled={busy === key} onClick={() => excuseOne(day.date, p.user)}>
                                Lagre
                              </Button>
                            </div>
                          )}
                        </div>
                      )
                    })}
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
