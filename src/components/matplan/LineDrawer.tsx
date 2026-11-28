import type { ReactNode } from 'react'
import type { Acquisition, Donor, ForecastRow, PlanLine, PlanOutcome, PlanStatus } from '../../types'
import { Button, Drawer, ErrorText, Input, Label, Select } from '../ui'
import { NumberField, TextField } from './Fields'
import {
  ACQ_LABEL,
  ACTION_ICON,
  canApply,
  CONFIDENCE_LABEL,
  kr,
  OUTCOME_LABEL,
  STATUS_LABEL,
  trim,
  type Mode,
} from './shared'

type FieldKey =
  | 'requested'
  | 'confirmed'
  | 'received'
  | 'status'
  | 'donor'
  | 'acquisition'
  | 'price'
  | 'date'
  | 'delivery'
  | 'outcome'
  | 'leftover'
  | 'ranOut'
  | 'comment'
  | 'nextYear'

const ALL: FieldKey[] = [
  'requested', 'confirmed', 'received', 'status', 'donor', 'acquisition', 'price', 'date', 'delivery',
  'outcome', 'leftover', 'ranOut', 'comment', 'nextYear',
]
// What you're most likely to touch in each season; the rest is one click away.
const FIRST: Record<Mode, FieldKey[]> = {
  plan: ['requested', 'status', 'donor', 'comment'],
  mottak: ['confirmed', 'received', 'status', 'date', 'delivery'],
  evaluering: ['outcome', 'leftover', 'ranOut', 'nextYear'],
}

export default function LineDrawer({
  line,
  mode,
  suggestion,
  linesForItem,
  donors,
  error,
  forecastStale,
  position,
  onStep,
  onPatch,
  onDelete,
  onClose,
}: {
  line: PlanLine
  mode: Mode
  suggestion: ForecastRow | undefined
  linesForItem: number
  donors: Donor[]
  /** A failed save or delete -- shown here, since the page's own message is behind the panel. */
  error: string
  /** Suggestions are being recalculated for a new guest figure. */
  forecastStale: boolean
  position: { index: number; total: number }
  onStep: (delta: 1 | -1) => void
  onPatch: (id: number, patch: Record<string, unknown>) => void
  onDelete: (line: PlanLine) => void
  onClose: () => void
}) {
  const save = (patch: Record<string, unknown>) => onPatch(line.id, patch)
  const unit = line.unit ? ` (${line.unit})` : ''

  const field: Record<FieldKey, ReactNode> = {
    requested: <NumberField label={`Ønsket${unit}`} value={line.quantity_requested} onSave={(v) => save({ quantity_requested: v })} />,
    confirmed: <NumberField label={`Bekreftet${unit}`} value={line.quantity_confirmed} onSave={(v) => save({ quantity_confirmed: v })} />,
    received: <NumberField label={`Mottatt${unit}`} value={line.quantity_received} onSave={(v) => save({ quantity_received: v })} />,
    status: (
      <div>
        <Label>Status</Label>
        <Select aria-label="Status" value={line.status} onChange={(e) => save({ status: e.target.value })}>
          {(Object.keys(STATUS_LABEL) as PlanStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </div>
    ),
    donor: (
      <div>
        <Label>Giver</Label>
        <Select aria-label="Giver" value={line.donor ?? ''} onChange={(e) => save({ donor: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Ingen</option>
          {donors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </div>
    ),
    acquisition: (
      <div>
        <Label>Gave eller kjøp</Label>
        <Select aria-label="Gave eller kjøp" value={line.acquisition} onChange={(e) => save({ acquisition: e.target.value })}>
          {(Object.keys(ACQ_LABEL) as Acquisition[]).map((a) => (
            <option key={a} value={a}>
              {ACQ_LABEL[a]}
            </option>
          ))}
        </Select>
      </div>
    ),
    price: (
      <div>
        <NumberField label={`Pris per ${line.unit || 'enhet'} (kr)`} value={line.unit_price} onSave={(v) => save({ unit_price: v })} />
        {line.price_note && <p className="mt-1 text-xs text-ink-600">{line.price_note}</p>}
        {line.estimated_cost !== null && <p className="text-xs text-ink-600">Anslått kostnad: {kr(line.estimated_cost)}</p>}
      </div>
    ),
    date: (
      <div>
        <Label>Leveringsdato</Label>
        <Input type="date" aria-label="Leveringsdato" value={line.delivery_date ?? ''} onChange={(e) => save({ delivery_date: e.target.value || null })} />
      </div>
    ),
    delivery: (
      <div>
        <Label>Hentes / leveres</Label>
        <Select aria-label="Hentes eller leveres" value={line.delivery_mode} onChange={(e) => save({ delivery_mode: e.target.value })}>
          <option value="unknown">Ukjent</option>
          <option value="pickup">Vi henter</option>
          <option value="delivery">De leverer</option>
        </Select>
      </div>
    ),
    outcome: (
      <div className="col-span-2">
        <Label>Hvordan gikk det?</Label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Utfall">
          {(Object.keys(OUTCOME_LABEL) as PlanOutcome[]).map((o) => (
            // Clicking the current choice saves it too: that's how a guess
            // from old comments gets confirmed.
            <Button key={o || 'none'} variant={line.outcome === o ? 'primary' : 'secondary'} aria-pressed={line.outcome === o} onClick={() => save({ outcome: o })}>
              {OUTCOME_LABEL[o]}
            </Button>
          ))}
        </div>
        {line.outcome && line.outcome_source === 'imported' && (
          <p className="mt-1 text-xs text-gold-600">Gjettet fra gamle kommentarer. Trykk på riktig valg for å bekrefte.</p>
        )}
      </div>
    ),
    leftover:
      line.outcome === 'leftover' ? (
        <NumberField label={`Hvor mye var igjen${unit}`} value={line.leftover_quantity} onSave={(v) => save({ leftover_quantity: v })} />
      ) : null,
    ranOut: <TextField label="Når ble det tomt?" value={line.ran_out_note} onSave={(v) => save({ ran_out_note: v })} />,
    comment: (
      <div className="col-span-2">
        <TextField label="Kommentar" multiline value={line.comment} onSave={(v) => save({ comment: v })} />
      </div>
    ),
    nextYear: (
      <div className="col-span-2">
        <TextField label="Til neste år" multiline value={line.next_year_note} onSave={(v) => save({ next_year_note: v })} />
      </div>
    ),
  }
  const render = (keys: FieldKey[]) =>
    keys.map((k) =>
      field[k] ? (
        // Wide fields bring their own col-span; `contents` keeps it effective.
        <div key={k} className="contents">
          {field[k]}
        </div>
      ) : null,
    )

  return (
    <Drawer title={line.item_name} onClose={onClose}>
      <div className="mb-4 flex items-center justify-between gap-3 text-sm text-ink-600">
        <span>
          {line.donor_name ?? 'Ingen giver'}
          {line.via_donor_name && ` via ${line.via_donor_name}`} · {line.year}
        </span>
        <span className="flex flex-shrink-0 items-center gap-1">
          <Button variant="secondary" disabled={position.index <= 0} onClick={() => onStep(-1)} aria-label="Forrige linje">
            ‹
          </Button>
          <span className="px-1 text-xs">
            {position.index + 1} / {position.total}
          </span>
          <Button variant="secondary" disabled={position.index >= position.total - 1} onClick={() => onStep(1)} aria-label="Neste linje">
            ›
          </Button>
        </span>
      </div>
      {error && (
        <div className="mb-3 rounded-lg bg-red-600/10 px-3 py-2" role="alert">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
      {line.quantity_note && <p className="mb-3 text-xs text-ink-600">Fra arket: {line.quantity_note}</p>}

      {mode === 'plan' && suggestion && (
        <div className="mb-4 rounded-lg bg-gold-500/10 p-3 text-sm text-ink-900">
          <p className="font-medium">
            Forslag: {ACTION_ICON[suggestion.action]}{' '}
            {suggestion.action === 'drop' ? 'dropp denne' : `${trim(suggestion.suggested_quantity)} ${suggestion.unit}`}
            <span className="ml-2 text-xs font-normal text-ink-600">{CONFIDENCE_LABEL[suggestion.confidence]}</span>
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs text-ink-600">
            {suggestion.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
            <li>
              Bygger på {suggestion.basis_year}: {trim(suggestion.basis_quantity)} {suggestion.unit}
              {linesForItem > 1 && ` · samlet for ${linesForItem} givere, fordel selv`}
            </li>
          </ul>
          {canApply(line, suggestion, linesForItem) && (
            <Button
              className="mt-2"
              disabled={forecastStale}
              onClick={() => save({ quantity_requested: String(suggestion.suggested_quantity) })}
            >
              Bruk forslaget
            </Button>
          )}
          {suggestion.action === 'drop' && line.status !== 'cancelled' && (
            <Button className="mt-2" variant="danger" onClick={() => save({ status: 'cancelled' })}>
              Marker som droppet
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">{render(FIRST[mode])}</div>

      <details className="mt-5 border-t border-cream-200 pt-3">
        <summary className="cursor-pointer text-sm font-medium text-ink-900">Alle felt</summary>
        <div className="mt-3 grid grid-cols-2 gap-3">{render(ALL.filter((k) => !FIRST[mode].includes(k)))}</div>
        <div className="mt-5">
          <Button variant="danger" onClick={() => onDelete(line)}>
            Slett linjen
          </Button>
        </div>
      </details>
    </Drawer>
  )
}
