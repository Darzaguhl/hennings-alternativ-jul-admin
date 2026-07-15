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
import type { EventMetrics, Shift, User } from '../types'
import { Badge, Card, ErrorText, Input, Label, PageHeader } from '../components/ui'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

const todayIso = () => new Date().toISOString().slice(0, 10)

const DOUGHNUT_COLORS = { filled: '#1b4332', empty: '#ebe1cd' }

export default function Dashboard() {
  const { selectedEvent, loading: eventsLoading } = useEvents()
  const [date, setDate] = useState(todayIso())
  const [metrics, setMetrics] = useState<EventMetrics | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [allShifts, setAllShifts] = useState<Shift[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedEvent) return
    setLoading(true)
    setError('')
    api
      .metrics(selectedEvent.id, date)
      .then(setMetrics)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Kunne ikke laste metrikker.'))
      .finally(() => setLoading(false))
  }, [selectedEvent, date])

  useEffect(() => {
    if (!selectedEvent) return
    api.users().then(setUsers).catch(() => {})
    // Unlike metrics.shifts (scoped to the selected date), this is every
    // vakt in the event -- needed to correlate oppgave interest with
    // actual signups/tildelinger regardless of which date is picked above,
    // since most of the year there simply are no vakter "today".
    api.shifts(selectedEvent.id).then(setAllShifts).catch(() => {})
  }, [selectedEvent])

  // Oppgave interest (Skill, a per-user attribute) vs. what actually
  // happens on a vakt with that title -- signups and tildelinger. Shift
  // titles are the oppgave names (see Shift's docstring, e.g. "Kjøkken"),
  // so grouping by normalized title lines the two up. Union of both sides:
  // an oppgave can have interest with no vakt yet, or a vakt with no
  // matching Skill if nobody picked it at signup.
  const oppgaveRows = useMemo(() => {
    const rows = new Map<string, { label: string; interest: number; signups: number; assigned: number }>()
    const rowFor = (rawLabel: string) => {
      const label = rawLabel.trim()
      const key = label.toLowerCase()
      if (!key) return null
      let row = rows.get(key)
      if (!row) {
        row = { label, interest: 0, signups: 0, assigned: 0 }
        rows.set(key, row)
      }
      return row
    }

    users.forEach((u) =>
      u.skills.forEach((s) => {
        const row = rowFor(s.name)
        if (row) row.interest += 1
      })
    )
    allShifts.forEach((s) => {
      const row = rowFor(s.title)
      if (row) {
        row.signups += s.signup_count
        row.assigned += s.assigned_count
      }
    })

    return Array.from(rows.values()).sort((a, b) => b.interest - a.interest || b.signups - a.signups)
  }, [users, allShifts])

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

          {oppgaveRows.length > 0 && (
            <Card>
              <h2 className="mb-1 text-lg font-semibold text-green-900">Oppgaveoversikt</h2>
              <p className="mb-4 text-sm text-ink-600">
                Interesse (krysset av ved påmelding) mot faktiske påmeldinger og tildelinger på vakter med samme
                navn, for hele {selectedEvent.title} — uavhengig av datoen valgt over.
              </p>
              <div style={{ height: Math.min(Math.max(oppgaveRows.length * 40 + 24, 120), 520) }}>
                <Bar
                  data={{
                    labels: oppgaveRows.map((r) => r.label),
                    datasets: [
                      {
                        label: 'Interesserte',
                        data: oppgaveRows.map((r) => r.interest),
                        backgroundColor: '#8a836f',
                        maxBarThickness: 22,
                      },
                      {
                        label: 'Påmeldt vakt',
                        data: oppgaveRows.map((r) => r.signups),
                        backgroundColor: '#c99a3d',
                        maxBarThickness: 22,
                      },
                      {
                        label: 'Tildelt',
                        data: oppgaveRows.map((r) => r.assigned),
                        backgroundColor: '#1b4332',
                        maxBarThickness: 22,
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
