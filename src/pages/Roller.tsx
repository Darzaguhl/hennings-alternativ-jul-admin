import { useEffect, useState } from 'react'
import { useEvents } from '../context/EventContext'
import { api, ApiError } from '../api/client'
import type { Membership, MembershipRole, User } from '../types'
import { Badge, Button, Card, ErrorText, Label, PageHeader, Select } from '../components/ui'

const roleLabel: Record<MembershipRole, string> = {
  superadmin: 'Superadmin',
  checkin_staff: 'Innsjekk-ansvarlig',
}

export default function Roller() {
  const { selectedEvent } = useEvents()
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newUserId, setNewUserId] = useState('')
  const [newRole, setNewRole] = useState<MembershipRole>('checkin_staff')
  const [saving, setSaving] = useState(false)

  const load = () => {
    if (!selectedEvent) return
    setLoading(true)
    Promise.all([api.memberships(selectedEvent.id), api.users()])
      .then(([m, u]) => {
        setMemberships(m)
        setUsers(u)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Kunne ikke laste roller.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [selectedEvent])

  if (!selectedEvent) return <p className="text-ink-600">Ingen arrangement valgt.</p>

  if (selectedEvent.viewer_role !== 'superadmin') {
    return (
      <Card>
        <p className="text-ink-600">Bare superadmin kan administrere roller.</p>
      </Card>
    )
  }

  const availableUsers = users.filter((u) => !memberships.some((m) => m.user.id === u.id))

  const handleAdd = async () => {
    if (!newUserId) return
    setSaving(true)
    setError('')
    try {
      await api.addMembership(selectedEvent.id, Number(newUserId), newRole)
      setNewUserId('')
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke legge til rolle.')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (membership: Membership) => {
    if (!confirm(`Fjerne ${roleLabel[membership.role]} for ${membership.user.email}?`)) return
    try {
      await api.removeMembership(selectedEvent.id, membership.id)
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke fjerne rolle.')
    }
  }

  return (
    <div>
      <PageHeader title="Roller" subtitle={`Superadmin og innsjekk-ansvarlige for ${selectedEvent.title}`} />

      <ErrorText>{error}</ErrorText>

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-600">Legg til rolle</h2>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label>Bruker</Label>
            <Select value={newUserId} onChange={(e) => setNewUserId(e.target.value)}>
              <option value="">Velg bruker …</option>
              {availableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-56">
            <Label>Rolle</Label>
            <Select value={newRole} onChange={(e) => setNewRole(e.target.value as MembershipRole)}>
              <option value="checkin_staff">Innsjekk-ansvarlig</option>
              <option value="superadmin">Superadmin</option>
            </Select>
          </div>
          <Button onClick={handleAdd} disabled={saving || !newUserId}>
            Legg til
          </Button>
        </div>
        <p className="mt-2 text-xs text-ink-400">
          Ledere for enkeltvakter administreres på vakten selv, under Vakter.
        </p>
      </Card>

      {loading ? (
        <p className="text-ink-600">Laster …</p>
      ) : (
        <div className="flex flex-col gap-2">
          {memberships.map((m) => (
            <Card key={m.id} className="!p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-ink-900">{m.user.email}</span>
                  <Badge tone={m.role === 'superadmin' ? 'success' : 'neutral'}>{roleLabel[m.role]}</Badge>
                </div>
                <Button variant="danger" onClick={() => handleRemove(m)}>
                  Fjern
                </Button>
              </div>
            </Card>
          ))}
          {memberships.length === 0 && <p className="text-ink-600">Ingen roller er satt opp ennå.</p>}
        </div>
      )}
    </div>
  )
}
