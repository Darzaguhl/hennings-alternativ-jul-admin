import { useEffect, useState } from 'react'
import { api, ApiError } from '../api/client'
import type { OppgaveHistoryEntry } from '../types'
import { Badge, Card, ErrorText, PageHeader } from '../components/ui'

const formatPercent = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)} %`)

export default function Historikk() {
  const [entries, setEntries] = useState<OppgaveHistoryEntry[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .oppgaveHistory()
      .then(setEntries)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Kunne ikke laste historikk.'))
  }, [])

  const totalSignups = entries?.reduce((sum, e) => sum + e.total_signups, 0) ?? 0

  return (
    <div>
      <PageHeader title="Historikk" subtitle="Påmeldte mot faktisk fylt, på tvers av alle år" />

      <ErrorText>{error}</ErrorText>

      <Card className="mb-6">
        <p className="text-sm text-ink-600">
          Viser hvor mange som meldte seg på hver oppgave mot hvor mange som faktisk møtte opp og ble tildelt den —
          samlet for alle arrangementer, ikke bare det valgte. Bruk «Anbefalt overbooking» som en pekepinn på hvor
          mange påmeldte du trenger per plass du vil ha fylt, gitt tidligere frafall.
        </p>
      </Card>

      {entries && entries.length === 0 && (
        <Card>
          <p className="text-sm text-ink-600">Ingen data ennå — dette fylles ut etter hvert som arrangementer får påmeldinger og innsjekk.</p>
        </Card>
      )}

      {entries && entries.length > 0 && (
        <Card>
          {totalSignups < 20 && (
            <p className="mb-4 text-xs text-ink-400">
              Foreløpig lite data ({totalSignups} påmeldinger totalt) — tallene blir en sikrere pekepinn etter hvert
              som flere år legges til.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cream-200 text-left text-xs uppercase tracking-wide text-ink-600">
                  <th className="py-2 pr-4">Oppgave</th>
                  <th className="py-2 pr-4">År</th>
                  <th className="py-2 pr-4 text-right">Påmeldte</th>
                  <th className="py-2 pr-4 text-right">Fylt</th>
                  <th className="py-2 pr-4 text-right">Oppmøte</th>
                  <th className="py-2 text-right">Anbefalt overbooking</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.title} className="border-b border-cream-100 last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-ink-900">{entry.title}</td>
                    <td className="py-2.5 pr-4 text-ink-600">{entry.years.map((y) => y.year).join(', ')}</td>
                    <td className="py-2.5 pr-4 text-right text-ink-900">{entry.total_signups}</td>
                    <td className="py-2.5 pr-4 text-right text-ink-900">{entry.total_assigned}</td>
                    <td className="py-2.5 pr-4 text-right">
                      <Badge tone={entry.fill_rate !== null && entry.fill_rate < 0.6 ? 'warning' : 'neutral'}>
                        {formatPercent(entry.fill_rate)}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-right font-medium text-ink-900">
                      {entry.oversubscription_factor === null ? '—' : `${entry.oversubscription_factor}×`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
