import { useEffect, useMemo, useState } from 'react'
import { useEvents } from '../context/EventContext'
import { api, ApiError } from '../api/client'
import type {
  Acquisition,
  CrmImportReport,
  CrmSummary,
  Donor,
  ForecastRow,
  GuestCount,
  PlanLine,
  PlanOutcome,
  PlanStatus,
} from '../types'
import { Badge, Button, Card, ErrorText, FileInput, Input, Label, PageHeader, Select } from '../components/ui'
import { hasAdminAccess } from '../utils/roles'

const STATUS_LABEL: Record<PlanStatus, string> = {
  planned: 'Planlagt',
  asked: 'Spurt',
  confirmed: 'Bekreftet',
  delivered: 'Mottatt',
  cancelled: 'Droppet',
}
const OUTCOME_LABEL: Record<PlanOutcome, string> = {
  '': '— ikke registrert',
  ran_out_early: 'Tomt tidlig',
  ran_out: 'Tomt',
  right: 'Passet',
  leftover: 'Rest igjen',
}
const ACQ_LABEL: Record<Acquisition, string> = { gift: 'Gave', purchase: 'Kjøpt', mixed: 'Gave og kjøp', unknown: 'Ukjent' }
const ACTION_ICON: Record<ForecastRow['action'], string> = { increase: '▲', decrease: '▼', keep: '＝', drop: '✕', none: '·' }
const CONFIDENCE_LABEL = { high: 'sikker', medium: 'middels sikker', low: 'usikker' }

const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback)
const num = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? null : Number(v))
const trim = (v: string | number | null | undefined) => {
  const n = num(v)
  return n === null ? '' : new Intl.NumberFormat('no-NO', { maximumFractionDigits: 2 }).format(n)
}
const kr = (n: number) => new Intl.NumberFormat('no-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(n)

// A number that saves when you leave the field.
function NumberCell({ value, onSave, width = 'w-20' }: { value: string | null; onSave: (v: string | null) => void; width?: string }) {
  const shown = value === null ? '' : String(Number(value))
  const [text, setText] = useState(shown)
  useEffect(() => setText(shown), [shown])
  return (
    <input
      inputMode="decimal"
      className={`${width} rounded-md border border-cream-200 bg-white px-2 py-1 text-right text-sm text-ink-900 focus:border-gold-500 focus:outline-none`}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const cleaned = text.trim().replace(',', '.')
        if (cleaned === shown || (cleaned !== '' && shown !== '' && Number(cleaned) === Number(shown))) return
        if (cleaned !== '' && Number.isNaN(Number(cleaned))) return setText(shown)
        onSave(cleaned === '' ? null : cleaned)
      }}
    />
  )
}

// Free text that saves when you leave the field.
function TextField({ label, value, onSave, multiline = false }: { label: string; value: string; onSave: (v: string) => void; multiline?: boolean }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const common = {
    value: text,
    onChange: (e: { target: { value: string } }) => setText(e.target.value),
    onBlur: () => text !== value && onSave(text),
  }
  return (
    <div>
      <Label>{label}</Label>
      {multiline ? (
        <textarea
          rows={2}
          className="w-full rounded-lg border border-cream-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-gold-500 focus:outline-none"
          {...common}
        />
      ) : (
        <Input {...common} />
      )}
    </div>
  )
}

function LineRow({
  line,
  suggestion,
  donors,
  onPatch,
  onDelete,
}: {
  line: PlanLine
  suggestion: ForecastRow | undefined
  donors: Donor[]
  onPatch: (id: number, patch: Record<string, unknown>) => void
  onDelete: (line: PlanLine) => void
}) {
  const [open, setOpen] = useState(false)
  const planned = num(line.quantity_requested)
  const differs = suggestion && suggestion.action !== 'none' && planned !== suggestion.suggested_quantity
  const struck = line.status === 'cancelled'

  return (
    <div className={`rounded-lg bg-cream-100 px-3 py-2 ${struck ? 'opacity-60' : ''}`}>
      <div className="grid grid-cols-1 items-center gap-2 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.5fr)_repeat(3,5.5rem)_8rem_9rem_minmax(0,1.8fr)]">
        <div>
          <p className="text-sm font-medium text-ink-900">
            {line.item_name} {line.unit && <span className="text-xs font-normal text-ink-600">({line.unit})</span>}
          </p>
          {line.quantity_note && <p className="text-xs text-ink-600">{line.quantity_note}</p>}
        </div>
        <p className="text-sm text-ink-600">
          {line.donor_name ?? '—'}
          {line.via_donor_name && <span className="text-xs"> via {line.via_donor_name}</span>}
        </p>
        <div title="Ønsket">
          <NumberCell value={line.quantity_requested} onSave={(v) => onPatch(line.id, { quantity_requested: v })} />
        </div>
        <div title="Bekreftet">
          <NumberCell value={line.quantity_confirmed} onSave={(v) => onPatch(line.id, { quantity_confirmed: v })} />
        </div>
        <div title="Mottatt">
          <NumberCell value={line.quantity_received} onSave={(v) => onPatch(line.id, { quantity_received: v })} />
        </div>
        <Select value={line.status} onChange={(e) => onPatch(line.id, { status: e.target.value })}>
          {(Object.keys(STATUS_LABEL) as PlanStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <div>
          <Select value={line.outcome} onChange={(e) => onPatch(line.id, { outcome: e.target.value })}>
            {(Object.keys(OUTCOME_LABEL) as PlanOutcome[]).map((o) => (
              <option key={o} value={o}>
                {OUTCOME_LABEL[o]}
              </option>
            ))}
          </Select>
          {line.outcome && line.outcome_source === 'imported' && (
            <p className="mt-0.5 text-[11px] text-gold-600" title="Gjettet fra gamle kommentarer. Velg på nytt for å bekrefte.">
              gjettet fra kommentar
            </p>
          )}
        </div>
        <div className="text-sm">
          {suggestion ? (
            <div title={`${suggestion.reasons.join(' · ')} (${CONFIDENCE_LABEL[suggestion.confidence]})`}>
              <span className="font-medium text-ink-900">
                {ACTION_ICON[suggestion.action]} {suggestion.action === 'drop' ? 'Dropp?' : `${trim(suggestion.suggested_quantity)} ${suggestion.unit}`}
              </span>
              <p className="text-[11px] text-ink-600">
                {suggestion.reasons[0]} · {CONFIDENCE_LABEL[suggestion.confidence]}
              </p>
              {differs && suggestion.action !== 'drop' && (
                <button
                  className="text-xs font-medium text-green-800 underline"
                  onClick={() => onPatch(line.id, { quantity_requested: String(suggestion.suggested_quantity) })}
                >
                  Bruk forslaget
                </button>
              )}
              {suggestion.action === 'drop' && line.status !== 'cancelled' && (
                <button className="text-xs font-medium text-red-600 underline" onClick={() => onPatch(line.id, { status: 'cancelled' })}>
                  Marker som droppet
                </button>
              )}
            </div>
          ) : (
            <span className="text-xs text-ink-400">ingen historikk</span>
          )}
        </div>
      </div>

      <button className="mt-1 text-xs text-ink-600 underline" onClick={() => setOpen((v) => !v)}>
        {open ? 'Skjul detaljer' : 'Detaljer'}
      </button>
      {open && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label>Giver</Label>
            <Select value={line.donor ?? ''} onChange={(e) => onPatch(line.id, { donor: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Ingen</option>
              {donors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Gave eller kjøp</Label>
            <Select value={line.acquisition} onChange={(e) => onPatch(line.id, { acquisition: e.target.value })}>
              {(Object.keys(ACQ_LABEL) as Acquisition[]).map((a) => (
                <option key={a} value={a}>
                  {ACQ_LABEL[a]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Pris per {line.unit || 'enhet'} (kr)</Label>
            <NumberCell width="w-full" value={line.unit_price} onSave={(v) => onPatch(line.id, { unit_price: v })} />
            {line.price_note && <p className="mt-0.5 text-[11px] text-ink-600">{line.price_note}</p>}
            {line.estimated_cost !== null && <p className="text-[11px] text-ink-600">Anslått kostnad: {kr(line.estimated_cost)}</p>}
          </div>
          <div>
            <Label>Leveringsdato</Label>
            <Input type="date" value={line.delivery_date ?? ''} onChange={(e) => onPatch(line.id, { delivery_date: e.target.value || null })} />
          </div>
          <div>
            <Label>Hentes / leveres</Label>
            <Select value={line.delivery_mode} onChange={(e) => onPatch(line.id, { delivery_mode: e.target.value })}>
              <option value="unknown">Ukjent</option>
              <option value="pickup">Vi henter</option>
              <option value="delivery">De leverer</option>
            </Select>
          </div>
          {line.outcome === 'leftover' && (
            <div>
              <Label>Hvor mye var igjen ({line.unit})</Label>
              <NumberCell width="w-full" value={line.leftover_quantity} onSave={(v) => onPatch(line.id, { leftover_quantity: v })} />
            </div>
          )}
          <TextField label="Når ble det tomt?" value={line.ran_out_note} onSave={(v) => onPatch(line.id, { ran_out_note: v })} />
          <TextField label="Kommentar" multiline value={line.comment} onSave={(v) => onPatch(line.id, { comment: v })} />
          <TextField label="Til neste år" multiline value={line.next_year_note} onSave={(v) => onPatch(line.id, { next_year_note: v })} />
          <div className="sm:col-span-3">
            <Button variant="danger" onClick={() => onDelete(line)}>
              Slett linjen
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ImportPanel({ onImported }: { onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<CrmImportReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async (dryRun: boolean) => {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const result = await api.crmImport(file, dryRun)
      setReport(result)
      if (!dryRun) onImported()
    } catch (err) {
      // A rejected file comes back as an ApiError with the reason. Anything
      // else means no answer arrived at all (network, or the server gave up
      // waiting) -- say so rather than a vague "failed".
      setError(
        err instanceof ApiError
          ? err.message || 'Kunne ikke importere filen.'
          : 'Fikk ikke svar fra serveren. Importen kan ha tatt for lang tid. Last siden på nytt og se om noe ble importert, eller prøv igjen.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mb-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-600">Importer fra Excel</h2>
      <p className="mb-3 text-sm text-ink-600">
        Leser arkene «Matvarer» og «Kontakt &amp; Levering» fra årets arbeidsbok: givere, kontaktpersoner og linjene for forrige år, i år og
        neste år. Forhåndsvis først, så ser du hvordan leverandørnavn kobles til givere. Importen kan kjøres flere ganger: den fyller bare ut
        tomme felt og overskriver ikke det du har endret.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <FileInput
          accept=".xlsx"
          fileName={file?.name}
          chooseLabel="Velg Excel-fil"
          changeLabel="Bytt fil"
          onChange={(f) => {
            setFile(f)
            setReport(null)
            setError('')
          }}
        />
        {file && <span className="text-sm text-ink-600">{file.name}</span>}
        <Button variant="secondary" disabled={!file || busy} onClick={() => run(true)}>
          Forhåndsvis
        </Button>
        <Button disabled={!file || busy} onClick={() => run(false)}>
          Importer
        </Button>
      </div>
      {busy && <p className="mt-2 text-sm text-ink-600">Leser filen …</p>}
      <div className="mt-2">
        <ErrorText>{error}</ErrorText>
      </div>
      {report && (
        <div className="mt-4 text-sm text-ink-900">
          <p className="font-medium">
            {report.dry_run ? 'Forhåndsvisning (ingenting er lagret)' : 'Importert'}
            {report.years.current && ` · ${report.years.previous}–${report.years.next}`}
          </p>
          <p className="text-ink-600">
            Givere: {report.donors.created} nye · Kontakter: {report.contacts.created} nye · Varer: {report.items.created} nye · Linjer:{' '}
            {report.lines.created} nye, {report.lines.updated} utfylt
          </p>
          {report.supplier_resolution.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-ink-600">Slik ble leverandørnavn koblet ({report.supplier_resolution.length})</summary>
              <ul className="mt-1 list-disc pl-5 text-ink-600">
                {report.supplier_resolution.map((d) => (
                  <li key={d.text}>
                    «{d.text}» → {d.donor}
                    {d.via && ` via ${d.via}`} <span className="text-xs">({d.how})</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {report.unparsed_quantities.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-gold-600">Mengder jeg ikke kunne lese ({report.unparsed_quantities.length})</summary>
              <ul className="mt-1 list-disc pl-5 text-ink-600">
                {report.unparsed_quantities.map((u, i) => (
                  <li key={i}>
                    {u.item}: «{u.text}»
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Card>
  )
}

// The yearly food plan: every item, who provides it, how much we wanted, what
// was confirmed and received, how it went -- and a suggested amount for next
// year, learned from how last year went, with the reasons. Admin-only.
export default function Matplan() {
  const { selectedEvent } = useEvents()
  const isAdmin = hasAdminAccess(selectedEvent?.viewer_role)

  const [summary, setSummary] = useState<CrmSummary | null>(null)
  const [year, setYear] = useState<number | null>(null)
  const [lines, setLines] = useState<PlanLine[]>([])
  const [forecast, setForecast] = useState<ForecastRow[]>([])
  const [guests, setGuests] = useState<GuestCount[]>([])
  const [donors, setDonors] = useState<Donor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [showImport, setShowImport] = useState(false)
  const [expectedInput, setExpectedInput] = useState('')
  const [expectedGuests, setExpectedGuests] = useState<number | undefined>(undefined)
  const [newGuest, setNewGuest] = useState({ date: '', guests: '' })
  const [adding, setAdding] = useState(false)
  const [newLine, setNewLine] = useState({ name: '', category: '', unit: '', quantity: '', donor: '' })

  const reload = () => setReloadKey((k) => k + 1)

  useEffect(() => {
    if (!isAdmin) return
    api
      .crmSummary()
      .then((s) => {
        setSummary(s)
        setYear((current) => current ?? (s.years.length ? s.year : new Date().getFullYear()))
      })
      .catch((err) => setError(message(err, 'Kunne ikke laste matplanen.')))
  }, [isAdmin, reloadKey])

  useEffect(() => {
    if (!isAdmin || year === null) return
    let cancelled = false
    setLoading(true)
    Promise.all([api.planLines({ year }), api.crmForecast(year, expectedGuests), api.guestCounts(year), api.crmSummary(year), api.donors()])
      .then(([l, f, g, s, d]) => {
        if (cancelled) return
        setLines(l)
        setForecast(f.items)
        setGuests(g)
        setSummary(s)
        setDonors(d)
      })
      .catch((err) => !cancelled && setError(message(err, 'Kunne ikke laste matplanen.')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [isAdmin, year, expectedGuests, reloadKey])

  const years = useMemo(() => {
    const set = new Set<number>(summary?.years ?? [])
    const base = new Date().getFullYear()
    set.add(base)
    set.add(base + 1)
    if (summary?.years.length) set.add(Math.max(...summary.years) + 1)
    return [...set].sort((a, b) => b - a)
  }, [summary])

  const suggestionByItem = useMemo(() => new Map(forecast.map((f) => [f.item, f])), [forecast])
  const plannedItems = useMemo(() => new Set(lines.map((l) => l.item)), [lines])
  const unplanned = forecast.filter((f) => !plannedItems.has(f.item) && f.action !== 'drop')

  const grouped = useMemo(() => {
    const byCategory = new Map<string, PlanLine[]>()
    lines.forEach((l) => byCategory.set(l.category || 'Uten kategori', [...(byCategory.get(l.category || 'Uten kategori') ?? []), l]))
    return [...byCategory.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'no'))
      .map(([category, rows]) => [category, rows.sort((a, b) => a.item_name.localeCompare(b.item_name, 'no'))] as const)
  }, [lines])

  if (!selectedEvent) return <p className="text-ink-600">Ingen arrangement valgt.</p>
  if (!isAdmin) return <p className="text-ink-600">Kun admin har tilgang til matplanen.</p>

  const patchLine = async (id: number, patch: Record<string, unknown>) => {
    setError('')
    try {
      const updated = await api.updatePlanLine(id, patch)
      setLines((prev) => prev.map((l) => (l.id === id ? updated : l)))
      api.crmSummary(year ?? undefined).then(setSummary).catch(() => {})
    } catch (err) {
      setError(message(err, 'Kunne ikke lagre endringen.'))
      reload() // show what the server actually has
    }
  }

  const deleteLine = async (line: PlanLine) => {
    if (!confirm(`Slette linjen for ${line.item_name}?`)) return
    try {
      await api.deletePlanLine(line.id)
      setLines((prev) => prev.filter((l) => l.id !== line.id))
    } catch (err) {
      setError(message(err, 'Kunne ikke slette linjen.'))
    }
  }

  const planYear = async () => {
    if (year === null) return
    setError('')
    setInfo('')
    try {
      const r = await api.crmPlanYear(year, expectedGuests)
      setInfo(
        r.created === 0
          ? 'Ingen nye linjer: alt fra tidligere år er allerede planlagt.'
          : `Opprettet ${r.created} linjer for ${year} fra forrige år${r.skipped_dropped ? ` (${r.skipped_dropped} droppet utelatt)` : ''}.`,
      )
      reload()
    } catch (err) {
      setError(message(err, 'Kunne ikke planlegge året.'))
    }
  }

  const addLine = async () => {
    if (year === null) return
    setError('')
    try {
      await api.createPlanLine({
        year,
        new_item_name: newLine.name.trim(),
        new_item_category: newLine.category.trim(),
        unit: newLine.unit.trim(),
        quantity_requested: newLine.quantity ? newLine.quantity.replace(',', '.') : null,
        donor: newLine.donor ? Number(newLine.donor) : null,
      })
      setNewLine({ name: '', category: '', unit: '', quantity: '', donor: '' })
      setAdding(false)
      reload()
    } catch (err) {
      setError(message(err, 'Kunne ikke legge til linjen.'))
    }
  }

  const addGuests = async () => {
    setError('')
    try {
      const created = await api.createGuestCount({ date: newGuest.date, guests: Number(newGuest.guests) })
      setGuests((prev) => [...prev, created].sort((a, b) => a.date.localeCompare(b.date)))
      setNewGuest({ date: '', guests: '' })
      reload()
    } catch (err) {
      setError(message(err, 'Kunne ikke lagre antall gjester.'))
    }
  }

  const removeGuests = async (g: GuestCount) => {
    try {
      await api.deleteGuestCount(g.id)
      reload()
    } catch (err) {
      setError(message(err, 'Kunne ikke fjerne antallet.'))
    }
  }

  const totalGuests = guests.reduce((n, g) => n + g.guests, 0)
  const confirmedCount = (summary?.by_status.confirmed ?? 0) + (summary?.by_status.delivered ?? 0)

  return (
    <div>
      <PageHeader
        title="Matplan"
        subtitle="Mat og drikke år for år: hvem som gir hva, hva som ble bekreftet og mottatt, hvordan det gikk, og et forslag til neste år. Kun admin ser dette."
        action={
          <div className="w-32">
            <Select value={year ?? ''} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </div>
        }
      />
      <div className="mb-4">
        <ErrorText>{error}</ErrorText>
        {info && <p className="text-sm text-green-800">{info}</p>}
      </div>

      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="!p-4">
            <p className="text-xs uppercase tracking-wide text-ink-600">Linjer</p>
            <p className="text-2xl font-semibold text-ink-900">{summary.lines}</p>
          </Card>
          <Card className="!p-4">
            <p className="text-xs uppercase tracking-wide text-ink-600">Bekreftet / mottatt</p>
            <p className="text-2xl font-semibold text-ink-900">
              {confirmedCount}
              <span className="text-sm font-normal text-ink-600"> · {summary.by_status.delivered ?? 0} mottatt</span>
            </p>
          </Card>
          <Card className="!p-4">
            <p className="text-xs uppercase tracking-wide text-ink-600">Anslått kjøpskostnad</p>
            <p className="text-2xl font-semibold text-ink-900">{kr(summary.estimated_cost)}</p>
            {summary.unpriced_purchase_lines > 0 && (
              <p className="text-xs text-gold-600">{summary.unpriced_purchase_lines} kjøp uten pris</p>
            )}
          </Card>
          <Card className="!p-4">
            <p className="text-xs uppercase tracking-wide text-ink-600">Gjester</p>
            <p className="text-2xl font-semibold text-ink-900">{summary.guests ?? '—'}</p>
          </Card>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <Button onClick={planYear}>Planlegg {year} fra tidligere år</Button>
        <div className="w-44">
          <Label>Forventede gjester {year}</Label>
          <Input
            inputMode="numeric"
            placeholder="valgfritt"
            value={expectedInput}
            onChange={(e) => setExpectedInput(e.target.value)}
            onBlur={() => setExpectedGuests(Number(expectedInput) > 0 ? Number(expectedInput) : undefined)}
          />
        </div>
        <Button variant="secondary" onClick={() => setAdding((v) => !v)}>
          Legg til linje
        </Button>
        <Button variant="secondary" onClick={() => setShowImport((v) => !v)}>
          Importer fra Excel
        </Button>
      </div>
      {expectedGuests && (
        <p className="mb-4 -mt-3 text-xs text-ink-600">
          Forslagene skaleres med forventet antall gjester mot gjestetallet året de bygger på (krever registrerte gjestetall for det året).
        </p>
      )}

      {showImport && <ImportPanel onImported={reload} />}

      {adding && (
        <Card className="mb-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            <div className="sm:col-span-2">
              <Label>Matvare</Label>
              <Input value={newLine.name} onChange={(e) => setNewLine({ ...newLine, name: e.target.value })} placeholder="f.eks. Bacon" />
            </div>
            <div>
              <Label>Kategori</Label>
              <Input value={newLine.category} onChange={(e) => setNewLine({ ...newLine, category: e.target.value })} placeholder="Varmmat" />
            </div>
            <div>
              <Label>Mengde</Label>
              <Input value={newLine.quantity} onChange={(e) => setNewLine({ ...newLine, quantity: e.target.value })} />
            </div>
            <div>
              <Label>Enhet</Label>
              <Input value={newLine.unit} onChange={(e) => setNewLine({ ...newLine, unit: e.target.value })} placeholder="kg" />
            </div>
            <div className="sm:col-span-3">
              <Label>Giver</Label>
              <Select value={newLine.donor} onChange={(e) => setNewLine({ ...newLine, donor: e.target.value })}>
                <option value="">Ingen ennå</option>
                {donors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              <Button disabled={!newLine.name.trim()} onClick={addLine}>
                Legg til
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-600">Gjester per dag {year}</h2>
        <p className="mb-3 text-sm text-ink-600">
          Antall som ble servert hver dag. Det er tallet matmengdene egentlig henger sammen med, og det gjør forslagene bedre år for år.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {guests.map((g) => (
            <span key={g.id} className="rounded-full bg-cream-100 px-3 py-1 text-sm text-ink-900">
              {new Date(`${g.date}T00:00:00`).toLocaleDateString('no-NO', { day: 'numeric', month: 'short' })}: {g.guests}{' '}
              <button className="ml-1 text-ink-400 hover:text-red-600" onClick={() => removeGuests(g)} aria-label="Fjern">
                ×
              </button>
            </span>
          ))}
          {guests.length > 0 && <span className="text-sm text-ink-600">Totalt {totalGuests}</span>}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="w-44">
            <Label>Dato</Label>
            <Input type="date" value={newGuest.date} onChange={(e) => setNewGuest({ ...newGuest, date: e.target.value })} />
          </div>
          <div className="w-32">
            <Label>Gjester</Label>
            <Input inputMode="numeric" value={newGuest.guests} onChange={(e) => setNewGuest({ ...newGuest, guests: e.target.value })} />
          </div>
          <Button variant="secondary" disabled={!newGuest.date || !(Number(newGuest.guests) >= 0) || newGuest.guests === ''} onClick={addGuests}>
            Legg til
          </Button>
        </div>
      </Card>

      {unplanned.length > 0 && (
        <Card className="mb-6 !bg-gold-500/10">
          <p className="text-sm text-ink-900">
            {unplanned.length} varer fra tidligere år er ikke planlagt for {year} ennå. Trykk «Planlegg {year} fra tidligere år» for å hente
            dem med giver og et foreslått beløp (droppede varer utelates).
          </p>
        </Card>
      )}

      {loading ? (
        <p className="text-ink-600">Laster …</p>
      ) : lines.length === 0 ? (
        <Card>
          <p className="text-ink-600">
            Ingen linjer for {year} ennå.{' '}
            {summary && summary.years.length === 0
              ? 'Start med «Importer fra Excel» for å hente inn historikken.'
              : 'Bruk «Planlegg» for å lage dem fra tidligere år.'}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.5fr)_repeat(3,5.5rem)_8rem_9rem_minmax(0,1.8fr)] gap-2 px-3 text-xs font-semibold uppercase tracking-wide text-ink-600 lg:grid">
            <span>Matvare</span>
            <span>Giver</span>
            <span>Ønsket</span>
            <span>Bekreftet</span>
            <span>Mottatt</span>
            <span>Status</span>
            <span>Utfall</span>
            <span>Forslag neste år</span>
          </div>
          {grouped.map(([category, rows]) => {
            const seen = new Set<number>()
            return (
              <section key={category}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-600">
                  {category} <Badge>{rows.length}</Badge>
                </h2>
                <div className="flex flex-col gap-2">
                  {rows.map((line) => {
                    // The suggestion is for the item as a whole, so it sits on
                    // the first line of each item rather than repeating.
                    const first = !seen.has(line.item)
                    seen.add(line.item)
                    return (
                      <LineRow
                        key={line.id}
                        line={line}
                        suggestion={first ? suggestionByItem.get(line.item) : undefined}
                        donors={donors}
                        onPatch={patchLine}
                        onDelete={deleteLine}
                      />
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
