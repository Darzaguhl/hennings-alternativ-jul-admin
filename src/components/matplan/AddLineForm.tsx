import { useState } from 'react'
import { api } from '../../api/client'
import type { Donor } from '../../types'
import { Button, ErrorText, Input, Label, Select } from '../ui'
import { message } from './shared'
import { useUnsavedChanges } from '../unsaved'

export default function AddLineForm({ year, donors, onAdded }: { year: number; donors: Donor[]; onAdded: () => void }) {
  const [draft, setDraft] = useState({ name: '', category: '', unit: '', quantity: '', donor: '' })
  const [error, setError] = useState('')
  useUnsavedChanges(Object.values(draft).some((v) => v.trim() !== ''))

  const add = async () => {
    setError('')
    try {
      await api.createPlanLine({
        year,
        new_item_name: draft.name.trim(),
        new_item_category: draft.category.trim(),
        unit: draft.unit.trim(),
        quantity_requested: draft.quantity ? draft.quantity.replace(',', '.') : null,
        donor: draft.donor ? Number(draft.donor) : null,
      })
      onAdded()
    } catch (err) {
      setError(message(err, 'Kunne ikke legge til linjen.'))
    }
  }

  const text = (key: 'name' | 'category' | 'unit' | 'quantity', label: string, placeholder = '') => (
    <div>
      <Label>{label}</Label>
      <Input aria-label={label} placeholder={placeholder} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      {text('name', 'Matvare', 'f.eks. Bacon')}
      {text('category', 'Kategori', 'Varmmat')}
      <div className="grid grid-cols-2 gap-3">
        {text('quantity', 'Mengde')}
        {text('unit', 'Enhet', 'kg')}
      </div>
      <div>
        <Label>Giver</Label>
        <Select aria-label="Giver" value={draft.donor} onChange={(e) => setDraft({ ...draft, donor: e.target.value })}>
          <option value="">Ingen ennå</option>
          {donors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Button disabled={!draft.name.trim()} onClick={add}>
          Legg til
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  )
}
