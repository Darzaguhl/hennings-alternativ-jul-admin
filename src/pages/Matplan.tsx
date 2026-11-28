import { Fragment, useEffect, useMemo, useState } from 'react'
import { useEvents } from '../context/EventContext'
import { api } from '../api/client'
import type { CrmSummary, Donor, ForecastRow, GuestCount, PlanLine } from '../types'
import { Badge, Button, Card, Drawer, ErrorText, Input, Menu, PageHeader, Segmented, Select } from '../components/ui'
import AddLineForm from '../components/matplan/AddLineForm'
import GuestsPanel from '../components/matplan/GuestsPanel'
import ImportPanel from '../components/matplan/ImportPanel'
import LineDrawer from '../components/matplan/LineDrawer'
import {
  ACTION_ICON,
  canApply,
  defaultMode,
  kr,
  message,
  OUTCOME_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  trim,
  type Mode,
} from '../components/matplan/shared'
import { hasAdminAccess } from '../utils/roles'

type Filter = 'all' | 'unconfirmed' | 'differs' | 'missing' | 'noOutcome' | 'guessed'
type Panel = 'import' | 'guests' | 'add' | null

const FILTERS: Record<Mode, { value: Filter; label: string }[]> = {
  plan: [
    { value: 'all', label: 'Alle linjer' },
    { value: 'unconfirmed', label: 'Ikke bekreftet' },
    { value: 'differs', label: 'Avviker fra forslaget' },
  ],
  mottak: [
    { value: 'all', label: 'Alle linjer' },
    { value: 'missing', label: 'Ikke mottatt' },
  ],
  evaluering: [
    { value: 'all', label: 'Alle linjer' },
    { value: 'noOutcome', label: 'Uten utfall' },
    { value: 'guessed', label: 'Gjettet, ikke bekreftet' },
  ],
}

const COLUMNS: Record<Mode, string[]> = {
  plan: ['Matvare', 'Giver', 'Ønsket', 'Forslag', 'Status'],
  mottak: ['Matvare', 'Giver', 'Bekreftet', 'Mottatt', 'Status'],
  evaluering: ['Matvare', 'Giver', 'Mengde', 'Utfall', 'Til neste år'],
}

const categoryOf = (l: PlanLine) => l.category || 'Uten kategori'

// The yearly food plan: who gives what, what arrived, how it went, and a
// suggested amount for next time. One season-shaped view at a time, read-only
// rows, and a side panel to edit one line. Admin-only.
export default function Matplan() {
  const { selectedEvent } = useEvents()
  const isAdmin = hasAdminAccess(selectedEvent?.viewer_role)

  const [summary, setSummary] = useState<CrmSummary | null>(null)
  const [year, setYear] = useState<number | null>(null)
  const [mode, setMode] = useState<Mode>('plan')
  const [lines, setLines] = useState<PlanLine[]>([])
  const [forecast, setForecast] = useState<ForecastRow[]>([])
  const [guests, setGuests] = useState<GuestCount[]>([])
  const [donors, setDonors] = useState<Donor[]>([])
  const [loadedYear, setLoadedYear] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [panel, setPanel] = useState<Panel>(null)
  // The line being edited, and the order to step through: fixed when the
  // panel opens, so a line that stops matching the filter doesn't jump away.
  const [editing, setEditing] = useState<{ id: number; order: number[] } | null>(null)
  const [expectedInput, setExpectedInput] = useState('')
  const [expectedGuests, setExpectedGuests] = useState<number | undefined>(undefined)
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null)

  const reload = () => setReloadKey((k) => k + 1)

  const chooseYear = (y: number) => {
    setYear(y)
    setMode(defaultMode(y))
    setFilter('all')
    setEditing(null)
    setInfo('')
  }

  useEffect(() => {
    if (!isAdmin || year !== null) return
    api
      .crmSummary()
      .then((s) => {
        const first = s.years.length ? s.year : new Date().getFullYear()
        setYear(first)
        setMode(defaultMode(first))
      })
      .catch((err) => setError(message(err, 'Kunne ikke laste matplanen.')))
  }, [isAdmin, year])

  useEffect(() => {
    if (!isAdmin || year === null) return
    let cancelled = false
    Promise.all([api.planLines({ year }), api.crmForecast(year, expectedGuests), api.guestCounts(year), api.crmSummary(year), api.donors()])
      .then(([l, f, g, s, d]) => {
        if (cancelled) return
        setLines(l)
        setForecast(f.items)
        setGuests(g)
        setSummary(s)
        setDonors(d)
        setLoadedYear(year)
      })
      .catch((err) => !cancelled && setError(message(err, 'Kunne ikke laste matplanen.')))
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
  const linesPerItem = useMemo(() => {
    const m = new Map<number, number>()
    lines.forEach((l) => m.set(l.item, (m.get(l.item) ?? 0) + 1))
    return m
  }, [lines])
  const unplanned = forecast.filter((f) => !linesPerItem.has(f.item) && f.action !== 'drop')

  const sorted = useMemo(
    () => [...lines].sort((a, b) => categoryOf(a).localeCompare(categoryOf(b), 'no') || a.item_name.localeCompare(b.item_name, 'no')),
    [lines],
  )
  const applicable = (l: PlanLine) => canApply(l, suggestionByItem.get(l.item), linesPerItem.get(l.item) ?? 0)
  const matches = (l: PlanLine) => {
    const q = search.trim().toLowerCase()
    if (q && !`${l.item_name} ${l.donor_name ?? ''}`.toLowerCase().includes(q)) return false
    if (filter === 'unconfirmed') return l.status === 'planned' || l.status === 'asked'
    if (filter === 'differs') return applicable(l)
    if (filter === 'missing') return l.status !== 'delivered' && l.status !== 'cancelled'
    if (filter === 'noOutcome') return !l.outcome && l.status !== 'cancelled'
    if (filter === 'guessed') return l.outcome_source === 'imported'
    return true
  }
  const visible = sorted.filter(matches)
  const categories = [...new Set(visible.map(categoryOf))]
  // Suggestions are per item: show each once, on the item's first line.
  const firstOfItem = new Set<number>()
  const seen = new Set<number>()
  sorted.forEach((l) => {
    if (!seen.has(l.item)) firstOfItem.add(l.id)
    seen.add(l.item)
  })
  const toApply = visible.filter(applicable)
  const editingLine = editing && lines.find((l) => l.id === editing.id)

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
      setEditing(null)
      reload()
    } catch (err) {
      setError(message(err, 'Kunne ikke slette linjen.'))
    }
  }

  const applyAll = async () => {
    if (!confirm(`Sette «ønsket» til forslaget på ${toApply.length} linjer? Tallene som står der nå blir overskrevet.`)) return
    setError('')
    setInfo('')
    let done = 0
    try {
      // One at a time: gentle on the server, and a failure stops cleanly.
      for (const line of toApply) {
        setBulk({ done, total: toApply.length })
        const suggestion = suggestionByItem.get(line.item)
        if (suggestion) await api.updatePlanLine(line.id, { quantity_requested: String(suggestion.suggested_quantity) })
        done += 1
      }
      setInfo(`Brukte forslaget på ${done} linjer.`)
    } catch (err) {
      setError(`${message(err, 'Noe gikk galt.')} (${done} av ${toApply.length} ble oppdatert.)`)
    } finally {
      setBulk(null)
      reload()
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
          : `Opprettet ${r.created} linjer for ${year}${r.skipped_dropped ? ` (${r.skipped_dropped} droppet utelatt)` : ''}.`,
      )
      reload()
    } catch (err) {
      setError(message(err, 'Kunne ikke planlegge året.'))
    }
  }

  const step = (delta: 1 | -1) => {
    if (!editing) return
    const next = editing.order[editing.order.indexOf(editing.id) + delta]
    if (next !== undefined) setEditing({ ...editing, id: next })
  }

  const confirmedCount = (summary?.by_status.confirmed ?? 0) + (summary?.by_status.delivered ?? 0)
  const loading = loadedYear !== year

  const cells = (l: PlanLine) => {
    if (mode === 'plan') {
      const s = firstOfItem.has(l.id) ? suggestionByItem.get(l.item) : undefined
      return (
        <>
          <td className="px-3 py-2 text-right tabular-nums">{trim(l.quantity_requested)}</td>
          <td className="px-3 py-2">
            {s ? (
              <span className="flex items-center gap-2" title={s.reasons.join(' · ')}>
                <span className="tabular-nums">
                  {ACTION_ICON[s.action]} {s.action === 'drop' ? 'Dropp?' : `${trim(s.suggested_quantity)} ${s.unit}`}
                  {(linesPerItem.get(l.item) ?? 0) > 1 && <span className="ml-1 text-xs text-ink-400">samlet</span>}
                </span>
                {applicable(l) && (
                  <button
                    className="text-xs font-medium text-green-800 underline"
                    onClick={(e) => {
                      e.stopPropagation()
                      patchLine(l.id, { quantity_requested: String(s.suggested_quantity) })
                    }}
                  >
                    Bruk
                  </button>
                )}
              </span>
            ) : (
              <span className="text-ink-400">—</span>
            )}
          </td>
          <td className="px-3 py-2">
            <Badge tone={STATUS_TONE[l.status]}>{STATUS_LABEL[l.status]}</Badge>
          </td>
        </>
      )
    }
    if (mode === 'mottak') {
      return (
        <>
          <td className="px-3 py-2 text-right tabular-nums">{trim(l.quantity_confirmed ?? l.quantity_requested)}</td>
          <td className="px-3 py-2 text-right tabular-nums">{trim(l.quantity_received)}</td>
          <td className="px-3 py-2">
            {l.status === 'delivered' || l.status === 'cancelled' ? (
              <Badge tone={STATUS_TONE[l.status]}>{STATUS_LABEL[l.status]}</Badge>
            ) : (
              <Button
                variant="secondary"
                className="!px-3 !py-1 !text-xs"
                onClick={(e) => {
                  e.stopPropagation()
                  patchLine(l.id, { status: 'delivered' })
                }}
              >
                Mottatt ✓
              </Button>
            )}
          </td>
        </>
      )
    }
    return (
      <>
        <td className="px-3 py-2 text-right tabular-nums">{trim(l.quantity_confirmed ?? l.quantity_requested)}</td>
        <td className="px-3 py-2">
          <span className="flex items-center gap-2">
            <span className={l.outcome ? '' : 'text-ink-400'}>{l.outcome ? OUTCOME_LABEL[l.outcome] : '—'}</span>
            {l.outcome_source === 'imported' && (
              <button
                className="text-xs font-medium text-gold-600 underline"
                title="Gjettet fra gamle kommentarer"
                onClick={(e) => {
                  e.stopPropagation()
                  patchLine(l.id, { outcome: l.outcome })
                }}
              >
                Bekreft gjetningen
              </button>
            )}
          </span>
        </td>
        <td className="max-w-[16rem] truncate px-3 py-2 text-ink-600" title={l.next_year_note}>
          {l.next_year_note}
        </td>
      </>
    )
  }

  return (
    <div>
      <PageHeader
        title="Matplan"
        subtitle="Mat og drikke år for år. Kun admin."
        action={
          <div className="flex items-center gap-2">
            <div className="w-28">
              <Select aria-label="År" value={year ?? ''} onChange={(e) => chooseYear(Number(e.target.value))}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </div>
            <Menu
              label="Mer"
              items={[
                { label: `Planlegg ${year ?? ''} fra tidligere år`, onSelect: planYear },
                { label: 'Legg til linje', onSelect: () => setPanel('add') },
                { label: 'Gjester per dag', onSelect: () => setPanel('guests') },
                { label: 'Importer fra Excel', onSelect: () => setPanel('import') },
              ]}
            />
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Visning"
          value={mode}
          onChange={(m) => {
            setMode(m)
            setFilter('all')
          }}
          options={[
            { value: 'plan', label: 'Planlegging' },
            { value: 'mottak', label: 'Mottak' },
            { value: 'evaluering', label: 'Evaluering' },
          ]}
        />
        {summary && !loading && (
          <p className="text-sm text-ink-600">
            {summary.lines} linjer · {confirmedCount} bekreftet · {summary.by_status.delivered ?? 0} mottatt · anslått{' '}
            {kr(summary.estimated_cost)}
            {summary.unpriced_purchase_lines > 0 && ` (${summary.unpriced_purchase_lines} kjøp uten pris)`}
            {summary.guests ? ` · ${summary.guests} gjester` : ''}
          </p>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-64">
          <Input aria-label="Søk" placeholder="Søk matvare eller giver" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-56">
          <Select aria-label="Filter" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            {FILTERS[mode].map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </div>
        {mode === 'plan' && (
          <>
            <div className="w-44">
              <Input
                aria-label="Forventede gjester"
                inputMode="numeric"
                placeholder="Forventede gjester"
                value={expectedInput}
                onChange={(e) => setExpectedInput(e.target.value)}
                onBlur={() => setExpectedGuests(Number(expectedInput) > 0 ? Number(expectedInput) : undefined)}
              />
            </div>
            {toApply.length > 0 && (
              <Button variant="secondary" disabled={!!bulk} onClick={applyAll}>
                {bulk ? `Oppdaterer ${bulk.done + 1} av ${bulk.total} …` : `Bruk alle forslag (${toApply.length})`}
              </Button>
            )}
          </>
        )}
        {categories.length > 1 && (
          <button
            className="ml-auto text-sm text-ink-600 underline"
            onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(categories))}
          >
            {collapsed.size ? 'Vis alle kategorier' : 'Skjul alle kategorier'}
          </button>
        )}
      </div>

      <div className="mb-2">
        <ErrorText>{error}</ErrorText>
        {info && <p className="text-sm text-green-800">{info}</p>}
      </div>

      {mode === 'plan' && !loading && lines.length > 0 && unplanned.length > 0 && (
        <p className="mb-3 rounded-lg bg-gold-500/10 px-4 py-2 text-sm text-ink-900">
          {unplanned.length} {unplanned.length === 1 ? 'vare' : 'varer'} fra tidligere år er ikke planlagt for {year}.{' '}
          <button className="font-medium text-green-800 underline" onClick={planYear}>
            Legg dem til
          </button>
        </p>
      )}

      {loading ? (
        <p className="text-ink-600">Laster …</p>
      ) : lines.length === 0 ? (
        <Card>
          <p className="mb-3 text-ink-600">Ingen linjer for {year} ennå.</p>
          {summary && summary.years.length === 0 ? (
            <Button onClick={() => setPanel('import')}>Importer fra Excel</Button>
          ) : (
            <Button onClick={planYear}>Planlegg {year} fra tidligere år</Button>
          )}
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <p className="text-ink-600">Ingen linjer matcher.</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto !p-0">
          <table className="w-full text-sm text-ink-900">
            <thead>
              <tr className="border-b border-cream-200 text-xs uppercase tracking-wide text-ink-600">
                {COLUMNS[mode].map((c) => (
                  <th
                    key={c}
                    className={`px-3 py-3 font-semibold ${['Ønsket', 'Bekreftet', 'Mottatt', 'Mengde'].includes(c) ? 'text-right' : 'text-left'}`}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => {
                const rows = visible.filter((l) => categoryOf(l) === category)
                const closed = collapsed.has(category)
                return (
                  <Fragment key={category}>
                    <tr className="border-b border-cream-200 bg-cream-100">
                      <td colSpan={COLUMNS[mode].length} className="px-3 py-2">
                        <button
                          aria-expanded={!closed}
                          className="text-xs font-semibold uppercase tracking-wide text-ink-600"
                          onClick={() => {
                            const next = new Set(collapsed)
                            if (closed) next.delete(category)
                            else next.add(category)
                            setCollapsed(next)
                          }}
                        >
                          {closed ? '▸' : '▾'} {category} ({rows.length})
                        </button>
                      </td>
                    </tr>
                    {!closed &&
                      rows.map((l) => (
                        <tr
                          key={l.id}
                          className={`cursor-pointer border-b border-cream-200 last:border-0 hover:bg-cream-50 ${l.status === 'cancelled' ? 'opacity-50' : ''}`}
                          onClick={() => setEditing({ id: l.id, order: visible.map((v) => v.id) })}
                        >
                          <td className="px-3 py-2">
                            <button className="text-left font-medium">{l.item_name}</button>
                            {l.unit && <span className="ml-1 text-xs text-ink-400">({l.unit})</span>}
                          </td>
                          <td className="px-3 py-2 text-ink-600">
                            {l.donor_name ?? '—'}
                            {l.via_donor_name && <span className="text-xs text-ink-400"> via {l.via_donor_name}</span>}
                          </td>
                          {cells(l)}
                        </tr>
                      ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      {editing && editingLine && (
        <LineDrawer
          key={editingLine.id}
          line={editingLine}
          mode={mode}
          suggestion={suggestionByItem.get(editingLine.item)}
          linesForItem={linesPerItem.get(editingLine.item) ?? 1}
          donors={donors}
          position={{ index: editing.order.indexOf(editing.id), total: editing.order.length }}
          onStep={step}
          onPatch={patchLine}
          onDelete={deleteLine}
          onClose={() => setEditing(null)}
        />
      )}

      {panel && year !== null && (
        <Drawer
          title={panel === 'import' ? 'Importer fra Excel' : panel === 'guests' ? `Gjester ${year}` : `Ny linje ${year}`}
          onClose={() => setPanel(null)}
        >
          {panel === 'import' && <ImportPanel onImported={reload} />}
          {panel === 'guests' && <GuestsPanel year={year} guests={guests} onChanged={reload} />}
          {panel === 'add' && (
            <AddLineForm
              year={year}
              donors={donors}
              onAdded={() => {
                setPanel(null)
                reload()
              }}
            />
          )}
        </Drawer>
      )}
    </div>
  )
}
