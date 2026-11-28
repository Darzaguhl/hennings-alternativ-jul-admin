import { useState } from 'react'
import { api, ApiError } from '../api/client'
import type { Standing, StandingOverrideLevel } from '../types'
import { Badge, Button, ErrorText, Input, Label } from './ui'
import { explainStanding, STANDING_LABEL, STANDING_TONE } from './standing'

// One volunteer's internal standing: what it's based on, and the manual
// override (which needs a reason). Admin-only, never shown to the volunteer.
export default function StandingPanel({ row, onChanged }: { row: Standing; onChanged: () => void }) {
  const [level, setLevel] = useState<StandingOverrideLevel>(row.override ?? (row.computed === 'concern' ? 'good' : 'concern'))
  const [note, setNote] = useState(row.override_note)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async (action: () => Promise<unknown>, failure: string) => {
    setBusy(true)
    setError('')
    try {
      await action()
      onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : failure)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 text-sm text-ink-900">
      <p>
        <Badge tone={STANDING_TONE[row.standing]}>{STANDING_LABEL[row.standing]}</Badge>
        {row.override && <span className="ml-2 text-xs text-ink-600">overstyrt</span>}
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
        <dt className="text-ink-600">Arrangementer</dt>
        <dd>{row.events}</dd>
        <dt className="text-ink-600">Møtt</dt>
        <dd>{row.attended + row.walk_ins}</dd>
        <dt className="text-ink-600">Uteblitt</dt>
        <dd>
          {row.no_shows}
          {row.excused > 0 && ` (${row.excused} unntatt)`}
        </dd>
        <dt className="text-ink-600">Kommende</dt>
        <dd>{row.upcoming}</dd>
        <dt className="text-ink-600">Fremhevinger</dt>
        <dd>{row.commendations}</dd>
        <dt className="text-ink-600">Vurderinger</dt>
        <dd>
          Utmerket {row.ratings.utmerket} · God {row.ratings.god} · Ok {row.ratings.ok} · Bekymring {row.ratings.bekymring}
        </dd>
      </dl>
      {explainStanding(row) && <p className="text-red-600">Automatisk: {explainStanding(row)}</p>}

      <div className="border-t border-cream-200 pt-4">
        <Label>Overstyr</Label>
        <p className="mb-2 text-xs text-ink-600">Standing filtrerer bare — du bestemmer selv hvem som spørres igjen.</p>
        <div className="mb-2 flex gap-2">
          {(['good', 'concern'] as const).map((l) => (
            <Button key={l} variant={level === l ? 'primary' : 'secondary'} aria-pressed={level === l} onClick={() => setLevel(l)}>
              {STANDING_LABEL[l]}
            </Button>
          ))}
        </div>
        <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Påkrevd: hvorfor overstyrer du?" />
        <div className="mt-2 flex gap-2">
          <Button
            disabled={busy || !note.trim()}
            onClick={() =>
              run(() => api.setStandingOverride(row.user, { level, note: note.trim() }), 'Kunne ikke lagre overstyringen.')
            }
          >
            Lagre
          </Button>
          {row.override && (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => run(() => api.clearStandingOverride(row.user), 'Kunne ikke fjerne overstyringen.')}
            >
              Fjern overstyring
            </Button>
          )}
        </div>
        <ErrorText>{error}</ErrorText>
      </div>
    </div>
  )
}
