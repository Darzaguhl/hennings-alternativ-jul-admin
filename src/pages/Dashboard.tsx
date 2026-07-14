import { useEffect, useState } from 'react'
import { Bar } from 'react-chartjs-2'
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js'
import { useEvents } from '../context/EventContext'
import { api, ApiError } from '../api/client'
import type { EventMetrics } from '../types'
import { Badge, Card, ErrorText, Input, Label, PageHeader } from '../components/ui'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const todayIso = () => new Date().toISOString().slice(0, 10)

export default function Dashboard() {
  const { selectedEvent, loading: eventsLoading } = useEvents()
  const [date, setDate] = useState(todayIso())
  const [metrics, setMetrics] = useState<EventMetrics | null>(null)
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

  if (eventsLoading) return <p className="text-ink-600">Laster …</p>
  if (!selectedEvent) {
    return (
      <Card>
        <p className="text-ink-600">Ingen arrangement er opprettet ennå. Gå til Arrangement for å opprette ett.</p>
      </Card>
    )
  }

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

          <Card>
            <h2 className="mb-4 text-lg font-semibold text-green-900">Utnyttelse per vakt ({date})</h2>
            {metrics.shifts.length === 0 ? (
              <p className="text-sm text-ink-600">Ingen vakter denne dagen.</p>
            ) : (
              <>
                <div className="mb-6 h-64">
                  <Bar
                    data={{
                      labels: metrics.shifts.map((s) => s.title),
                      datasets: [
                        {
                          label: 'Tildelt',
                          data: metrics.shifts.map((s) => s.assigned_count),
                          backgroundColor: '#1b4332',
                        },
                        {
                          label: 'Påmeldt (interesse)',
                          data: metrics.shifts.map((s) => s.signup_count),
                          backgroundColor: '#c99a3d',
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
        </>
      )}

      {loading && !metrics && <p className="text-ink-600">Laster metrikker …</p>}
    </div>
  )
}
