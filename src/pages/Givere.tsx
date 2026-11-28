import { useEffect, useMemo, useState } from 'react'
import { useEvents } from '../context/EventContext'
import { api, ApiError } from '../api/client'
import type { Donor, DonorContact, DonorRelationship } from '../types'
import { Badge, Button, Card, Drawer, ErrorText, Input, Label, PageHeader, Select } from '../components/ui'
import { useUnsavedChanges } from '../components/unsaved'
import { hasAdminAccess } from '../utils/roles'

const REL_LABEL: Record<DonorRelationship, string> = {
  sponsor: 'Sponsor',
  supplier: 'Leverandør',
  both: 'Sponsor og leverandør',
  unknown: 'Ukjent',
}
const REL_TONE: Record<DonorRelationship, 'success' | 'neutral' | 'warning'> = {
  sponsor: 'success',
  supplier: 'warning',
  both: 'success',
  unknown: 'neutral',
}

const formatDate = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('no-NO', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback)

// One contact at a donor, editable in place. Business contact details are
// personal data: this whole page is admin-only and the API enforces it.
function ContactRow({ contact, onChanged }: { contact: DonorContact; onChanged: () => void }) {
  const [draft, setDraft] = useState(contact)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Trimmed, because the server trims what it saves.
  const dirty = (['name', 'role', 'email', 'phone', 'notes'] as const).some((k) => draft[k].trim() !== contact[k].trim())
  useUnsavedChanges(dirty)

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await api.updateDonorContact(contact.id, {
        name: draft.name,
        role: draft.role,
        email: draft.email,
        phone: draft.phone,
        notes: draft.notes,
      })
      onChanged()
    } catch (err) {
      setError(message(err, 'Kunne ikke lagre kontakten.'))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!confirm(`Fjerne ${contact.name || contact.email}?`)) return
    try {
      await api.deleteDonorContact(contact.id)
      onChanged()
    } catch (err) {
      setError(message(err, 'Kunne ikke fjerne kontakten.'))
    }
  }

  return (
    <div className="rounded-lg bg-cream-100 p-3">
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Navn" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <Input placeholder="Rolle" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
        <Input placeholder="E-post" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
        <Input placeholder="Telefon" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
      </div>
      {draft.notes && <p className="mt-1 text-xs text-ink-600">{draft.notes}</p>}
      <div className="mt-2 flex items-center gap-2">
        <Button variant="secondary" disabled={!dirty || busy} onClick={save}>
          Lagre
        </Button>
        <Button variant="danger" onClick={remove}>
          Fjern
        </Button>
        <ErrorText>{error}</ErrorText>
      </div>
    </div>
  )
}

function DonorEditor({ donor, others, onChanged }: { donor: Donor; others: Donor[]; onChanged: () => void }) {
  const [form, setForm] = useState({
    name: donor.name,
    relationship: donor.relationship,
    owner_name: donor.owner_name,
    notes: donor.notes,
    last_contacted_on: donor.last_contacted_on ?? '',
    next_contact_on: donor.next_contact_on ?? '',
    is_active: donor.is_active,
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [mergeInto, setMergeInto] = useState('')
  const [newContact, setNewContact] = useState({ name: '', email: '', phone: '' })
  useUnsavedChanges(
    (['name', 'owner_name', 'notes'] as const).some((k) => form[k].trim() !== donor[k].trim()) ||
      form.relationship !== donor.relationship ||
      form.is_active !== donor.is_active ||
      form.last_contacted_on !== (donor.last_contacted_on ?? '') ||
      form.next_contact_on !== (donor.next_contact_on ?? '') ||
      Object.values(newContact).some((v) => v.trim() !== ''),
  )

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await api.updateDonor(donor.id, {
        ...form,
        last_contacted_on: form.last_contacted_on || null,
        next_contact_on: form.next_contact_on || null,
      })
      onChanged()
    } catch (err) {
      setError(message(err, 'Kunne ikke lagre giveren.'))
    } finally {
      setBusy(false)
    }
  }

  const addContact = async () => {
    setError('')
    try {
      await api.createDonorContact({ donor: donor.id, ...newContact, is_primary: donor.contacts.length === 0 })
      setNewContact({ name: '', email: '', phone: '' })
      onChanged()
    } catch (err) {
      setError(message(err, 'Kunne ikke legge til kontakten.'))
    }
  }

  const merge = async () => {
    const target = others.find((d) => String(d.id) === mergeInto)
    if (!target) return
    if (!confirm(`Slå «${donor.name}» sammen med «${target.name}»? Kontakter og linjer flyttes, og «${donor.name}» slettes.`)) return
    setError('')
    try {
      await api.mergeDonor(donor.id, target.id)
      onChanged()
    } catch (err) {
      setError(message(err, 'Kunne ikke slå sammen.'))
    }
  }

  const remove = async () => {
    if (!confirm(`Slette «${donor.name}» og alle kontaktene? Matlinjene beholdes, men uten giver.`)) return
    try {
      await api.deleteDonor(donor.id)
      onChanged()
    } catch (err) {
      setError(message(err, 'Kunne ikke slette giveren.'))
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Navn</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <Label>Forhold</Label>
          <Select value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value as DonorRelationship })}>
            {(Object.keys(REL_LABEL) as DonorRelationship[]).map((k) => (
              <option key={k} value={k}>
                {REL_LABEL[k]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Ansvarlig hos oss</Label>
          <Input value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} />
        </div>
        <div>
          <Label>Sist kontaktet</Label>
          <Input type="date" value={form.last_contacted_on} onChange={(e) => setForm({ ...form, last_contacted_on: e.target.value })} />
        </div>
        <div>
          <Label>Kontakt igjen</Label>
          <Input type="date" value={form.next_contact_on} onChange={(e) => setForm({ ...form, next_contact_on: e.target.value })} />
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm text-ink-900">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
          Aktiv giver
        </label>
      </div>
      <div>
        <Label>Notater</Label>
        <textarea
          className="w-full rounded-lg border border-cream-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-gold-500 focus:outline-none"
          rows={3}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>
      <div>
        <Button disabled={busy} onClick={save}>
          Lagre giver
        </Button>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-600">Kontakter</h3>
        <div className="flex flex-col gap-2">
          {donor.contacts.map((c) => (
            <ContactRow key={`${c.id}-${c.name}-${c.email}`} contact={c} onChanged={onChanged} />
          ))}
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Nytt navn" value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} />
            <Input placeholder="E-post" type="email" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} />
            <Input placeholder="Telefon" value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} />
            <Button variant="secondary" disabled={!newContact.name && !newContact.email} onClick={addContact}>
              Legg til kontakt
            </Button>
          </div>
        </div>
      </div>

      {donor.years.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-600">Leveranser per år</h3>
          <div className="flex flex-col gap-1 text-sm">
            {donor.years.map((y) => (
              <p key={y.year} className="text-ink-900">
                <span className="font-medium">{y.year}</span> · {y.lines} linjer · {y.confirmed} bekreftet · {y.delivered} mottatt
                {y.missing.length > 0 && <span className="text-red-600"> · ikke mottatt: {y.missing.join(', ')}</span>}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 border-t border-cream-200 pt-4">
        <div className="w-64">
          <Label>Slå sammen med</Label>
          <Select value={mergeInto} onChange={(e) => setMergeInto(e.target.value)}>
            <option value="">Velg giver …</option>
            {others.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="secondary" disabled={!mergeInto} onClick={merge}>
          Slå sammen
        </Button>
        <Button variant="danger" onClick={remove}>
          Slett giver
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  )
}

function NewDonorForm({ onCreated }: { onCreated: (id: number) => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useUnsavedChanges(name.trim() !== '')

  const create = async () => {
    setBusy(true)
    setError('')
    try {
      onCreated((await api.createDonor({ name: name.trim() })).id)
    } catch (err) {
      // Shown here, inside the panel -- not behind it.
      setError(message(err, 'Kunne ikke opprette giveren.'))
      setBusy(false)
    }
  }

  return (
    <div>
      <Label>Navn</Label>
      <Input aria-label="Navn" value={name} onChange={(e) => setName(e.target.value)} placeholder="Firma eller person" />
      <Button className="mt-3" disabled={busy || !name.trim()} onClick={create}>
        Opprett
      </Button>
      <div className="mt-2">
        <ErrorText>{error}</ErrorText>
      </div>
    </div>
  )
}

// The register of everyone food and drink comes from -- sponsors, suppliers
// and the people who arrange things for us -- with their contacts and a plain
// record of whether they delivered what they promised. Admin-only.
export default function Givere() {
  const { selectedEvent } = useEvents()
  const isAdmin = hasAdminAccess(selectedEvent?.viewer_role)

  const [donors, setDonors] = useState<Donor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [relationship, setRelationship] = useState('')
  const [onlyAttention, setOnlyAttention] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)

  const load = () => {
    if (!isAdmin) return
    setError('')
    api
      .donors()
      .then(setDonors)
      .catch((err) => setError(message(err, 'Kunne ikke laste givere.')))
      .finally(() => setLoading(false))
  }

  useEffect(load, [isAdmin])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return donors.filter((d) => {
      if (relationship && d.relationship !== relationship) return false
      if (onlyAttention && d.needs_attention.length === 0) return false
      if (!q) return true
      return (
        d.name.toLowerCase().includes(q) ||
        d.owner_name.toLowerCase().includes(q) ||
        d.contacts.some((c) => `${c.name} ${c.email}`.toLowerCase().includes(q))
      )
    })
  }, [donors, search, relationship, onlyAttention])

  const openDonor = donors.find((d) => d.id === openId)

  if (!selectedEvent) return <p className="text-ink-600">Ingen arrangement valgt.</p>
  if (!isAdmin) return <p className="text-ink-600">Kun admin har tilgang til givere.</p>

  const donorCreated = (id: number) => {
    setAdding(false)
    setOpenId(id)
    load()
  }

  return (
    <div>
      <PageHeader
        title="Givere"
        subtitle="Sponsorer og leverandører. Kun admin."
        action={<Button onClick={() => setAdding(true)}>Ny giver</Button>}
      />
      <div className="mb-4">
        <ErrorText>{error}</ErrorText>
      </div>

      {adding && (
        <Drawer title="Ny giver" onClose={() => setAdding(false)}>
          <NewDonorForm onCreated={donorCreated} />
        </Drawer>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-[14rem] flex-1">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Søk navn, kontakt eller e-post" />
        </div>
        <div className="w-52">
          <Select value={relationship} onChange={(e) => setRelationship(e.target.value)}>
            <option value="">Alle forhold</option>
            {(Object.keys(REL_LABEL) as DonorRelationship[]).map((k) => (
              <option key={k} value={k}>
                {REL_LABEL[k]}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-900">
          <input type="checkbox" checked={onlyAttention} onChange={(e) => setOnlyAttention(e.target.checked)} />
          Må følges opp
        </label>
      </div>

      {loading ? (
        <p className="text-ink-600">Laster …</p>
      ) : visible.length === 0 ? (
        <Card>
          <p className="text-ink-600">
            {donors.length === 0
              ? 'Ingen givere ennå. Importer arbeidsboken under Matplan, eller opprett en giver.'
              : 'Ingen givere matcher filteret.'}
          </p>
        </Card>
      ) : (
        <Card className="overflow-x-auto !p-0">
          <table className="w-full text-sm text-ink-900">
            <thead>
              <tr className="border-b border-cream-200 text-left text-xs uppercase tracking-wide text-ink-600">
                <th className="px-3 py-3 font-semibold">Giver</th>
                <th className="px-3 py-3 font-semibold">Ansvarlig</th>
                <th className="px-3 py-3 font-semibold">Kontakt</th>
                <th className="px-3 py-3 font-semibold">Leveranser</th>
                <th className="px-3 py-3 font-semibold">Oppfølging</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((d) => {
                // Last completed year says how they did; the coming one how
                // far the asking has got.
                const thisYear = new Date().getFullYear()
                const past = d.years.find((y) => y.year < thisYear)
                const coming = d.years.find((y) => y.year >= thisYear)
                const primary = d.contacts.find((c) => c.is_primary) ?? d.contacts[0]
                return (
                  <tr
                    key={d.id}
                    className={`cursor-pointer border-b border-cream-200 align-top last:border-0 hover:bg-cream-50 ${d.is_active ? '' : 'opacity-50'}`}
                    onClick={() => setOpenId(d.id)}
                  >
                    <td className="px-3 py-2">
                      <button className="mr-2 text-left font-medium">{d.name}</button>
                      <Badge tone={REL_TONE[d.relationship]}>{REL_LABEL[d.relationship]}</Badge>
                    </td>
                    <td className="px-3 py-2 text-ink-600">{d.owner_name || '—'}</td>
                    <td className="px-3 py-2 text-ink-600" title={primary?.email}>
                      {primary ? primary.name || primary.email : '—'}
                      {d.contacts.length > 1 && <span className="text-xs text-ink-400"> +{d.contacts.length - 1}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-ink-600">
                      {past && (
                        <p>
                          {past.year}: {past.delivered}/{past.confirmed || past.lines} mottatt
                        </p>
                      )}
                      {coming && (
                        <p>
                          {coming.year}: {coming.confirmed}/{coming.lines} bekreftet
                        </p>
                      )}
                      {!past && !coming && '—'}
                    </td>
                    <td className="px-3 py-2">
                      {d.needs_attention.map((reason) => (
                        <p key={reason} className="text-red-600">
                          {reason}
                        </p>
                      ))}
                      {d.next_contact_on && <p className="text-ink-600">Kontakt {formatDate(d.next_contact_on)}</p>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      {openDonor && (
        <Drawer title={openDonor.name} onClose={() => setOpenId(null)}>
          <DonorEditor key={openDonor.id} donor={openDonor} others={donors.filter((o) => o.id !== openDonor.id)} onChanged={load} />
        </Drawer>
      )}
    </div>
  )
}
