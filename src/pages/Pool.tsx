import { useEffect, useState } from 'react'
import { useEvents } from '../context/EventContext'
import { api, ApiError } from '../api/client'
import type { PoolEntry } from '../types'
import { Badge, Button, Card, ErrorText, Input, Label, PageHeader, Select } from '../components/ui'

const todayIso = () => new Date().toISOString().slice(0, 10)

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' })

export default function Pool() {
  const { selectedEvent } = useEvents()
  const [date, setDate] = useState(todayIso())
  const [entries, setEntries] = useState<PoolEntry[]>([])
  const [selection, setSelection] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState<number | null>(null)
  const [error, setError] = useState('')

  const load = () => {
    if (!selectedEvent) return
    setLoading(true)
    setError('')
    api
      .pool(selectedEvent.id, date)
      .then((data) => {
        setEntries(data)
        const defaults: Record<number, number> = {}
        data.forEach((entry) => {
          if (entry.suggested_shift) defaults[entry.user.id] = entry.suggested_shift.id
        })
        setSelection(defaults)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Kunne ikke laste pool.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [selectedEvent, date])

  if (!selectedEvent) return <p className="text-ink-600">Ingen arrangement valgt.</p>

  const handleAssign = async (userId: number) => {
    const shiftId = selection[userId]
    if (!shiftId) return
    setAssigning(userId)
    setError('')
    try {
      await api.assign(selectedEvent.id, userId, shiftId)
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke tildele oppgave.')
    } finally {
      setAssigning(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Pool & tildeling"
        subtitle="Innsjekkede frivillige som venter på en oppgave, eldste ankomst først"
        action={
          <div className="w-40">
            <Label>Dato</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        }
      />

      <ErrorText>{error}</ErrorText>

      {loading ? (
        <p className="text-ink-600">Laster …</p>
      ) : entries.length === 0 ? (
        <Card>
          <p className="text-ink-600">Ingen venter i poolen akkurat nå.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((entry) => (
            <Card key={entry.user.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-ink-900">{entry.user.email}</p>
                  <p className="text-sm text-ink-600">Sjekket inn kl. {formatTime(entry.checked_in_at)}</p>
                  {entry.candidates.length === 0 ? (
                    <p className="mt-1 text-sm text-ink-400">Ikke meldt interesse for noen vakt i dag.</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {entry.candidates.map((c) => (
                        <Badge
                          key={c.id}
                          tone={c.shift.id === entry.suggested_shift?.id ? 'success' : 'neutral'}
                        >
                          {c.shift.title}
                          {c.shift.is_critical && (c.has_relevant_experience ? ' · erfaren' : ' · uerfaren')}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-shrink-0 items-end gap-2">
                  <div className="w-56">
                    <Label>Tildel vakt</Label>
                    <Select
                      value={selection[entry.user.id] ?? ''}
                      onChange={(e) =>
                        setSelection({ ...selection, [entry.user.id]: Number(e.target.value) })
                      }
                    >
                      <option value="">Velg vakt …</option>
                      {entry.candidates.map((c) => (
                        <option key={c.shift.id} value={c.shift.id}>
                          {c.shift.title}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button
                    onClick={() => handleAssign(entry.user.id)}
                    disabled={!selection[entry.user.id] || assigning === entry.user.id}
                  >
                    {assigning === entry.user.id ? 'Tildeler …' : 'Tildel'}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
