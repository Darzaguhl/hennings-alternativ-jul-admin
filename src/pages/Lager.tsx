import { useEffect, useState } from 'react'
import { Bar } from 'react-chartjs-2'
import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from 'chart.js'
import { useEvents } from '../context/EventContext'
import { api, ApiError } from '../api/client'
import type { InventoryCategory, InventoryDirection, InventoryItem, InventorySummaryRow } from '../types'
import { Badge, Button, Card, ErrorText, Input, Label, PageHeader, Select } from '../components/ui'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('no-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function Lager() {
  const { selectedEvent } = useEvents()

  const [categories, setCategories] = useState<InventoryCategory[]>([])
  const [items, setItems] = useState<InventoryItem[]>([])
  const [summary, setSummary] = useState<InventorySummaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [formCategory, setFormCategory] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formQuantity, setFormQuantity] = useState('1')
  const [formDirection, setFormDirection] = useState<InventoryDirection>('in')
  const [formNote, setFormNote] = useState('')
  const [formPhoto, setFormPhoto] = useState<File | null>(null)
  const [formSaving, setFormSaving] = useState(false)

  const [newCategoryName, setNewCategoryName] = useState('')
  const [categorySaving, setCategorySaving] = useState(false)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editQuantity, setEditQuantity] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const load = () => {
    if (!selectedEvent) return
    setLoading(true)
    setError('')
    Promise.all([
      api.inventoryCategories(),
      api.inventoryItems({ event: selectedEvent.id }),
      api.inventorySummary(selectedEvent.id),
    ])
      .then(([c, i, s]) => {
        setCategories(c)
        setItems(i)
        setSummary(s)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Kunne ikke laste lager.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [selectedEvent])

  if (!selectedEvent) return <p className="text-ink-600">Ingen arrangement valgt.</p>

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return
    setCategorySaving(true)
    setError('')
    try {
      await api.createInventoryCategory({ name: newCategoryName.trim() })
      setNewCategoryName('')
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke opprette kategorien.')
    } finally {
      setCategorySaving(false)
    }
  }

  const handleDeleteCategory = async (category: InventoryCategory) => {
    if (!confirm(`Slette kategorien «${category.name}»?`)) return
    try {
      await api.deleteInventoryCategory(category.id)
      setCategories((prev) => prev.filter((c) => c.id !== category.id))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke slette kategorien.')
    }
  }

  const resetForm = () => {
    setFormCategory('')
    setFormDescription('')
    setFormQuantity('1')
    setFormDirection('in')
    setFormNote('')
    setFormPhoto(null)
  }

  const handleCreateItem = async () => {
    if (!formCategory || !formQuantity) return
    setFormSaving(true)
    setError('')
    try {
      await api.createInventoryItem({
        event: selectedEvent.id,
        category: Number(formCategory),
        quantity: Number(formQuantity),
        description: formDescription.trim() || undefined,
        direction: formDirection,
        note: formNote.trim() || undefined,
        photo: formPhoto ?? undefined,
      })
      resetForm()
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke registrere.')
    } finally {
      setFormSaving(false)
    }
  }

  const startEdit = (item: InventoryItem) => {
    setEditingId(item.id)
    setEditQuantity(item.quantity.toString())
    setEditDescription(item.description)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditQuantity('')
    setEditDescription('')
  }

  const handleSaveEdit = async (item: InventoryItem) => {
    setEditSaving(true)
    setError('')
    try {
      await api.updateInventoryItem(item.id, { quantity: Number(editQuantity), description: editDescription })
      cancelEdit()
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke oppdatere.')
    } finally {
      setEditSaving(false)
    }
  }

  const handleDeleteItem = async (item: InventoryItem) => {
    if (!confirm(`Slette denne loggen (${item.category_name}, ${item.quantity} stk)?`)) return
    try {
      await api.deleteInventoryItem(item.id)
      // Reload rather than filtering client-side -- deleting an entry
      // changes the category summary totals too, not just the log list.
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke slette.')
    }
  }

  return (
    <div>
      <PageHeader title="Lager" subtitle={selectedEvent.title} />

      <ErrorText>{error}</ErrorText>

      {loading ? (
        <p className="text-ink-600">Laster …</p>
      ) : (
        <>
          <Card className="mb-6">
            <h2 className="mb-4 text-lg font-semibold text-green-900">Oversikt per kategori</h2>
            {summary.length === 0 ? (
              <p className="text-sm text-ink-600">Ingen gjenstander registrert ennå.</p>
            ) : (
              <>
                <div className="mb-6" style={{ height: Math.min(Math.max(summary.length * 36 + 40, 160), 480) }}>
                  <Bar
                    data={{
                      labels: summary.map((r) => r.category_name),
                      datasets: [
                        {
                          label: 'Mottatt',
                          data: summary.map((r) => r.in_total),
                          backgroundColor: '#1b4332',
                          maxBarThickness: 28,
                        },
                        {
                          label: 'Gitt bort',
                          data: summary.map((r) => r.out_total),
                          backgroundColor: '#c99a3d',
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
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {summary.map((row) => (
                    <div key={row.category} className="rounded-lg bg-cream-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">
                        {row.category_name}
                      </p>
                      <p className="mt-1 text-2xl font-semibold text-green-800">{row.net}</p>
                      <p className="text-xs text-ink-400">
                        {row.in_total} inn · {row.out_total} ut
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          <Card className="mb-6">
            <h2 className="mb-1 text-lg font-semibold text-green-900">Registrer manuelt</h2>
            <p className="mb-4 text-sm text-ink-600">
              For korrigeringer og etterregistrering av mottak, og for å registrere det som gis bort — mobilappen
              støtter foreløpig kun registrering av mottak.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <Label>Kategori</Label>
                <Select value={formCategory} onChange={(e) => setFormCategory(e.target.value)}>
                  <option value="">Velg kategori</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Antall</Label>
                <Input
                  type="number"
                  min={1}
                  value={formQuantity}
                  onChange={(e) => setFormQuantity(e.target.value)}
                />
              </div>
              <div>
                <Label>Retning</Label>
                <Select
                  value={formDirection}
                  onChange={(e) => setFormDirection(e.target.value as InventoryDirection)}
                >
                  <option value="in">Inn (mottatt)</option>
                  <option value="out">Ut (gitt bort)</option>
                </Select>
              </div>
              <div>
                <Label>Bilde (valgfritt)</Label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFormPhoto(e.target.files?.[0] ?? null)}
                  className="w-full text-sm text-ink-600"
                />
              </div>
              <div className="col-span-2">
                <Label>Beskrivelse</Label>
                <Input
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="F.eks. Blå vinterjakke str M"
                />
              </div>
              <div className="col-span-2">
                <Label>Notat</Label>
                <Input
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  placeholder="F.eks. gitt bort i rally kl 21"
                />
              </div>
            </div>
            <Button onClick={handleCreateItem} disabled={formSaving || !formCategory} className="mt-3">
              {formSaving ? 'Registrerer …' : 'Registrer'}
            </Button>
          </Card>

          <Card className="mb-6">
            <h2 className="mb-4 text-lg font-semibold text-green-900">Logg</h2>
            {items.length === 0 ? (
              <p className="text-sm text-ink-600">Ingen registreringer ennå.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-4 rounded-lg bg-cream-50 px-4 py-3"
                  >
                    {item.photo && (
                      <img src={item.photo} alt="" className="h-12 w-12 flex-shrink-0 rounded-md object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink-900">{item.category_name}</span>
                        <Badge tone={item.direction === 'in' ? 'success' : 'warning'}>
                          {item.direction === 'in' ? 'Inn' : 'Ut'}
                        </Badge>
                      </div>
                      {editingId === item.id ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            value={editQuantity}
                            onChange={(e) => setEditQuantity(e.target.value)}
                            className="w-20 rounded-md border border-cream-200 px-2 py-1 text-sm"
                            autoFocus
                          />
                          <input
                            type="text"
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            placeholder="Beskrivelse"
                            className="flex-1 rounded-md border border-cream-200 px-2 py-1 text-sm"
                          />
                        </div>
                      ) : (
                        <p className="mt-0.5 text-sm text-ink-600">
                          {item.quantity} stk
                          {item.description && ` · ${item.description}`}
                          {item.logged_by_email && ` · ${item.logged_by_email}`} · {formatDateTime(item.created_at)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-shrink-0 gap-2">
                      {editingId === item.id ? (
                        <>
                          <Button variant="secondary" onClick={cancelEdit} className="!px-3 !py-1.5 !text-xs">
                            Avbryt
                          </Button>
                          <Button
                            onClick={() => handleSaveEdit(item)}
                            disabled={editSaving}
                            className="!px-3 !py-1.5 !text-xs"
                          >
                            {editSaving ? 'Lagrer …' : 'Lagre'}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="secondary"
                            onClick={() => startEdit(item)}
                            className="!px-3 !py-1.5 !text-xs"
                          >
                            Rediger
                          </Button>
                          <Button
                            variant="danger"
                            onClick={() => handleDeleteItem(item)}
                            className="!px-3 !py-1.5 !text-xs"
                          >
                            Slett
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="mb-1 text-lg font-semibold text-green-900">Kategorier</h2>
            <p className="mb-4 text-sm text-ink-600">
              Katalogen over gjenstandskategorier man kan velge mellom ved registrering.
            </p>
            <div className="mb-4 flex gap-2">
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="F.eks. Vinterjakker"
              />
              <Button onClick={handleCreateCategory} disabled={categorySaving || !newCategoryName.trim()}>
                {categorySaving ? 'Legger til …' : 'Legg til'}
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              {categories.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg bg-cream-50 px-4 py-2">
                  <span className="text-sm font-medium text-ink-900">{c.name}</span>
                  <Button
                    variant="danger"
                    onClick={() => handleDeleteCategory(c)}
                    className="!px-3 !py-1.5 !text-xs"
                  >
                    Slett
                  </Button>
                </div>
              ))}
              {categories.length === 0 && <p className="text-sm text-ink-600">Ingen kategorier lagt til ennå.</p>}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
