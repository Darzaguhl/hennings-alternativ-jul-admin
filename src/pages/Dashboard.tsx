import { useEffect, useMemo, useState } from 'react'
import { Bar, Doughnut } from 'react-chartjs-2'
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js'
import { useEvents } from '../context/EventContext'
import { api, ApiError } from '../api/client'
import type { EventMetrics, OppgaveSlot, Shift } from '../types'
import { Badge, Card, ErrorText, Input, Label, PageHeader } from '../components/ui'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

const todayIso = () => new Date().toISOString().slice(0, 10)

const DOUGHNUT_COLORS = { filled: '#1b4332', empty: '#ebe1cd' }

export default function Dashboard() {
  const { selectedEvent, loading: eventsLoading } = useEvents()
  const [date, setDate] = useState('')
  const [dateInitialized, setDateInitialized] = useState(false)
  const [metrics, setMetrics] = useState<EventMetrics | null>(null)
  const [allShifts, setAllShifts] = useState<Shift[]>([])
  const [shiftsLoaded, setShiftsLoaded] = useState(false)
  const [oppgaveSlots, setOppgaveSlots] = useState<OppgaveSlot[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedEvent) return
    // Unlike metrics.shifts (scoped to the selected date), these are every
    // vakt/oppgave-slot in the event -- needed for the date default below
    // and the per-oppgave correlation, regardless of which date is picked,
    // since most of the year there simply are no vakter "today".
    setShiftsLoaded(false)
    api
      .shifts(selectedEvent.id)
      .then(setAllShifts)
      .finally(() => setShiftsLoaded(true))
    api.oppgaveSlots({ event: selectedEvent.id }).then(setOppgaveSlots).catch(() => {})
  }, [selectedEvent])

  // The event only runs a handful of days in December, so "today" is a
  // meaningless default the other ~360 days of the year -- default instead
  // to the event's earliest actual vakt date. Runs once per event
  // (dateInitialized), so it doesn't clobber a date the admin picked
  // afterwards; waits for shiftsLoaded so an event with no vakter yet
  // doesn't get stuck deciding between "still loading" and "genuinely
  // empty".
  useEffect(() => {
    setDateInitialized(false)
    setDate('')
  }, [selectedEvent?.id])

  useEffect(() => {
    if (!selectedEvent || dateInitialized || !shiftsLoaded) return
    const earliest =
      allShifts.length > 0
        ? allShifts.reduce((min, s) => (s.date < min ? s.date : min), allShifts[0].date)
        : (selectedEvent.date?.slice(0, 10) ?? todayIso())
    setDate(earliest)
    setDateInitialized(true)
  }, [selectedEvent, allShifts, shiftsLoaded, dateInitialized])

  useEffect(() => {
    if (!selectedEvent || !date) return
    setLoading(true)
    setError('')
    api
      .metrics(selectedEvent.id, date)
      .then(setMetrics)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Kunne ikke laste metrikker.'))
      .finally(() => setLoading(false))
  }, [selectedEvent, date])

  // Interest is now literally "signed up for this specific oppgave on this
  // specific vakt" (OppgaveSlot.signup_count) -- summed per oppgave (Skill)
  // across every vakt it's offered on, since that's the actual unit an
  // admin cares about staffing.
  const skillRows = useMemo(() => {
    const rows = new Map<string, { interest: number; assigned: number }>()
    oppgaveSlots.forEach((slot) => {
      const row = rows.get(slot.skill_name) ?? { interest: 0, assigned: 0 }
      row.interest += slot.signup_count
      row.assigned += slot.assigned_count
      rows.set(slot.skill_name, row)
    })
    return Array.from(rows.entries())
      .map(([label, r]) => ({ label, ...r }))
      .sort((a, b) => b.interest - a.interest)
  }, [oppgaveSlots])

  if (eventsLoading) return <p className="text-ink-600">Laster …</p>
  if (!selectedEvent) {
    return (
      <Card>
        <p className="text-ink-600">Ingen arrangement er opprettet ennå. Gå til Arrangement for å opprette ett.</p>
      </Card>
    )
  }

  const shiftsWithCapacity = metrics?.shifts.filter((s) => s.capacity !== null) ?? []

  return (
    <div>
      <PageHeader
        title="Oversikt"
        subtitle={selectedEvent.title}
        action={
          <div className="w-40">
            <Label>Dato</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        }
      />

      <ErrorText>{error}</ErrorText>

      {metrics && (
        <>
          <div className="mb-6 grid grid-cols-3 gap-4">
            <Card className="text-center">
              <p className="text-3xl font-semibold text-green-800">{metrics.checked_in}</p>
              <p className="mt-1 text-sm text-ink-600">Innsjekket i dag</p>
            </Card>
            <Card className="text-center">
              <p className="text-3xl font-semibold text-green-800">{metrics.assigned}</p>
              <p className="mt-1 text-sm text-ink-600">Tildelt oppgave</p>
            </Card>
            <Card className="text-center">
              <p className="text-3xl font-semibold text-gold-600">{metrics.in_pool}</p>
              <p className="mt-1 text-sm text-ink-600">I pool (venter)</p>
            </Card>
          </div>

          <Card className="mb-6">
            <h2 className="mb-4 text-lg font-semibold text-green-900">Utnyttelse per vakt ({date})</h2>
            {metrics.shifts.length === 0 ? (
              <p className="text-sm text-ink-600">Ingen vakter denne dagen.</p>
            ) : (
              <>
                <div className="mb-6" style={{ height: 256 }}>
                  <Bar
                    data={{
                      labels: metrics.shifts.map((s) => s.title),
                      datasets: [
                        {
                          label: 'Tildelt',
                          data: metrics.shifts.map((s) => s.assigned_count),
                          backgroundColor: '#1b4332',
                          maxBarThickness: 40,
                        },
                        {
                          label: 'Påmeldt (interesse)',
                          data: metrics.shifts.map((s) => s.signup_count),
                          backgroundColor: '#c99a3d',
                          maxBarThickness: 40,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
                    }}
                  />
                </div>

                {shiftsWithCapacity.length > 0 && (
                  <div className="mb-6 grid grid-cols-4 gap-4 sm:grid-cols-6 lg:grid-cols-8">
                    {shiftsWithCapacity.map((s) => {
                      const filled = Math.min(s.assigned_count, s.capacity ?? 0)
                      const empty = Math.max((s.capacity ?? 0) - filled, 0)
                      return (
                        <div key={s.id} className="text-center">
                          <div className="mx-auto h-16 w-16">
                            <Doughnut
                              data={{
                                labels: ['Tildelt', 'Ledig'],
                                datasets: [
                                  {
                                    data: [filled, empty],
                                    backgroundColor: [DOUGHNUT_COLORS.filled, DOUGHNUT_COLORS.empty],
                                    borderWidth: 0,
                                  },
                                ],
                              }}
                              options={{ plugins: { legend: { display: false }, tooltip: { enabled: false } }, cutout: '65%' }}
                            />
                          </div>
                          <p className="mt-1 truncate text-xs text-ink-600" title={s.title}>
                            {s.title}
                          </p>
                          <p className="text-xs font-semibold text-ink-900">
                            {filled}/{s.capacity}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  {metrics.shifts.map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded-lg bg-cream-50 px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-ink-900">{s.title}</span>
                        {s.criticality === 'critical' && <Badge tone="critical">Krever erfaring</Badge>}
                        {s.is_understaffed && <Badge tone="warning">Underbemannet</Badge>}
                        {s.is_full && <Badge tone="success">Fullt</Badge>}
                      </div>
                      <span className="text-sm text-ink-600">
                        {s.assigned_count}
                        {s.capacity !== null ? ` / ${s.capacity}` : ''} tildelt
                        {s.min_capacity !== null ? ` · min ${s.min_capacity}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          {skillRows.length > 0 && (
            <Card>
              <h2 className="mb-1 text-lg font-semibold text-green-900">Interesse per oppgave</h2>
              <p className="mb-4 text-sm text-ink-600">
                Påmeldt interesse mot faktisk tildelt, summert per oppgave på tvers av alle vakter i{' '}
                {selectedEvent.title} — uavhengig av datoen valgt over.
              </p>
              <div style={{ height: Math.min(Math.max(skillRows.length * 36 + 24, 120), 480) }}>
                <Bar
                  data={{
                    labels: skillRows.map((r) => r.label),
                    datasets: [
                      {
                        label: 'Interesserte',
                        data: skillRows.map((r) => r.interest),
                        backgroundColor: '#c99a3d',
                        maxBarThickness: 28,
                      },
                      {
                        label: 'Tildelt',
                        data: skillRows.map((r) => r.assigned),
                        backgroundColor: '#1b4332',
                        maxBarThickness: 28,
                      },
                    ],
                  }}
                  options={{
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
                  }}
                />
              </div>
            </Card>
          )}
        </>
      )}

      {loading && !metrics && <p className="text-ink-600">Laster metrikker …</p>}
    </div>
  )
}
