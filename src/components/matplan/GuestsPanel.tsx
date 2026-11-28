import { useState } from 'react'
import { api } from '../../api/client'
import type { GuestCount } from '../../types'
import { Button, ErrorText, Input, Label } from '../ui'
import { message } from './shared'
import { useUnsavedChanges } from '../unsaved'

// Guests served per day: the number food quantities really scale with.
export default function GuestsPanel({ year, guests, onChanged }: { year: number; guests: GuestCount[]; onChanged: () => void }) {
  const [draft, setDraft] = useState({ date: '', guests: '' })
  const [error, setError] = useState('')
  const total = guests.reduce((n, g) => n + g.guests, 0)
  useUnsavedChanges(draft.date !== '' || draft.guests !== '')

  const run = async (action: () => Promise<unknown>, failure: string) => {
    setError('')
    try {
      await action()
      onChanged()
    } catch (err) {
      setError(message(err, failure))
    }
  }

  return (
    <div className="flex flex-col gap-4 text-sm text-ink-900">
      <p className="text-ink-600">Antall serverte per dag i {year}. Gjør forslagene bedre år for år.</p>
      {guests.length === 0 ? (
        <p className="text-ink-600">Ingen registrert ennå.</p>
      ) : (
        <ul className="divide-y divide-cream-200">
          {guests.map((g) => (
            <li key={g.id} className="flex items-center justify-between py-2">
              <span>{new Date(`${g.date}T00:00:00`).toLocaleDateString('no-NO', { day: 'numeric', month: 'long' })}</span>
              <span className="flex items-center gap-3">
                {g.guests}
                <button
                  className="text-xs text-red-600 underline"
                  onClick={() => run(() => api.deleteGuestCount(g.id), 'Kunne ikke fjerne antallet.')}
                >
                  Fjern
                </button>
              </span>
            </li>
          ))}
          <li className="flex justify-between py-2 font-medium">
            <span>Totalt</span>
            <span>{total}</span>
          </li>
        </ul>
      )}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label>Dato</Label>
          <Input type="date" aria-label="Dato" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
        </div>
        <div className="w-28">
          <Label>Gjester</Label>
          <Input inputMode="numeric" aria-label="Gjester" value={draft.guests} onChange={(e) => setDraft({ ...draft, guests: e.target.value })} />
        </div>
        <Button
          disabled={!draft.date || draft.guests === '' || !(Number(draft.guests) >= 0)}
          onClick={() =>
            run(async () => {
              await api.createGuestCount({ date: draft.date, guests: Number(draft.guests) })
              setDraft({ date: '', guests: '' })
            }, 'Kunne ikke lagre antall gjester.')
          }
        >
          Legg til
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  )
}
