import { useEffect, useMemo, useState } from 'react'
import { useEvents } from '../context/EventContext'
import { api, ApiError } from '../api/client'
import type { Shift, User } from '../types'
import { Badge, Button, Card, ErrorText, Input, Label, PageHeader, Select } from '../components/ui'
import { hasAdminAccess } from '../utils/roles'

const displayName = (user: User) => {
  const name = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim()
  return name || user.email
}

export default function Frivillige() {
  const { selectedEvent } = useEvents()
  const [users, setUsers] = useState<User[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [skillFilter, setSkillFilter] = useState('')
  const [vaktFilter, setVaktFilter] = useState('')

  useEffect(() => {
    if (!selectedEvent) return
    setLoading(true)
    setError('')
    Promise.all([api.users(), api.shifts(selectedEvent.id)])
      .then(([u, s]) => {
        setUsers(u)
        setShifts(s)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Kunne ikke laste frivillige.'))
      .finally(() => setLoading(false))
  }, [selectedEvent])

  const signupsByUser = useMemo(() => {
    const map = new Map<number, Shift[]>()
    shifts.forEach((shift) => {
      shift.participants.forEach((p) => {
        const list = map.get(p.id) ?? []
        list.push(shift)
        map.set(p.id, list)
      })
    })
    return map
  }, [shifts])

  const allSkills = useMemo(() => {
    const names = new Set<string>()
    users.forEach((u) => u.skills.forEach((s) => names.add(s.name)))
    return Array.from(names).sort()
  }, [users])

  const volunteers = useMemo(
    () => users.filter((u) => signupsByUser.has(u.id) || u.skills.length > 0),
    [users, signupsByUser]
  )

  const filtered = volunteers.filter((u) => {
    const term = search.trim().toLowerCase()
    if (term && !u.email.toLowerCase().includes(term) && !displayName(u).toLowerCase().includes(term)) return false
    if (skillFilter && !u.skills.some((s) => s.name === skillFilter)) return false
    if (vaktFilter && !(signupsByUser.get(u.id) ?? []).some((s) => String(s.id) === vaktFilter)) return false
    return true
  })

  if (!selectedEvent) return <p className="text-ink-600">Ingen arrangement valgt.</p>

  const role = selectedEvent.viewer_role
  const canView = hasAdminAccess(role) || role === 'checkin_staff' || role === 'shift_leader'
  const canSeeNotes = hasAdminAccess(role)
  const canDelete = hasAdminAccess(role)

  const handleDelete = async (user: User) => {
    const name = displayName(user)
    if (
      !confirm(
        `Er du sikker på at du vil slette ${name}? Dette fjerner brukeren og all påmeldings- og innsjekk-historikk permanent. Dette kan ikke angres.`
      )
    ) {
      return
    }
    try {
      await api.deleteUser(user.id)
      setUsers((prev) => prev.filter((u) => u.id !== user.id))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke slette brukeren.')
    }
  }

  if (!canView) {
    return (
      <Card>
        <p className="text-ink-600">Du har ikke tilgang til frivillig-listen.</p>
      </Card>
    )
  }

  return (
    <div>
      <PageHeader
        title="Frivillige"
        subtitle={`${volunteers.length} som har meldt interesse eller meldt seg på en vakt i ${selectedEvent.title}`}
      />

      <ErrorText>{error}</ErrorText>

      <Card className="mb-6">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Søk på navn/e-post</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Navn eller navn@epost.no" />
          </div>
          <div>
            <Label>Oppgave</Label>
            <Select value={skillFilter} onChange={(e) => setSkillFilter(e.target.value)}>
              <option value="">Alle oppgaver</option>
              {allSkills.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Vakt</Label>
            <Select value={vaktFilter} onChange={(e) => setVaktFilter(e.target.value)}>
              <option value="">Alle vakter</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {loading ? (
        <p className="text-ink-600">Laster …</p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((u) => (
            <VolunteerCard
              key={u.id}
              user={u}
              shifts={signupsByUser.get(u.id) ?? []}
              canSeeNotes={canSeeNotes}
              canDelete={canDelete}
              onDelete={handleDelete}
            />
          ))}
          {filtered.length === 0 && <p className="text-ink-600">Ingen frivillige matcher filteret.</p>}
        </div>
      )}
    </div>
  )
}

function VolunteerCard({
  user,
  shifts,
  canSeeNotes,
  canDelete,
  onDelete,
}: {
  user: User
  shifts: Shift[]
  canSeeNotes: boolean
  canDelete: boolean
  onDelete: (user: User) => void
}) {
  const [notesOpen, setNotesOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [notesLoaded, setNotesLoaded] = useState(false)
  const [notesLoading, setNotesLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const openNotes = () => {
    setNotesOpen(true)
    if (notesLoaded) return
    setNotesLoading(true)
    api
      .userNotes(user.id)
      .then((data) => {
        setNotes(data.admin_notes)
        setNotesLoaded(true)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Kunne ikke laste notater.'))
      .finally(() => setNotesLoading(false))
  }

  const saveNotes = async () => {
    setSaving(true)
    setError('')
    try {
      await api.updateUserNotes(user.id, notes)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke lagre notater.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="!p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="font-medium text-ink-900">{displayName(user)}</p>
          {displayName(user) !== user.email && <p className="text-xs text-ink-400">{user.email}</p>}
          {user.skills.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {user.skills.map((s) => (
                <Badge key={s.id} tone="warning">
                  {s.name}
                </Badge>
              ))}
            </div>
          )}
          <div className="mt-2">
            {shifts.length === 0 ? (
              <p className="text-sm text-ink-400">Ikke meldt på noen vakt ennå.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {shifts.map((s) => (
                  <Badge key={s.id} tone="neutral">
                    {s.title} ({s.date})
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          {canSeeNotes && (
            <Button variant="secondary" onClick={() => (notesOpen ? setNotesOpen(false) : openNotes())} className="!px-3 !py-1.5 !text-xs">
              {notesOpen ? 'Skjul notater' : 'Notater'}
            </Button>
          )}
          {canDelete && (
            <Button variant="danger" onClick={() => onDelete(user)} className="!px-3 !py-1.5 !text-xs">
              Slett
            </Button>
          )}
        </div>
      </div>

      {notesOpen && (
        <div className="mt-3 border-t border-cream-200 pt-3">
          <Label>Admin-notater (kun synlig for admin/eier)</Label>
          <ErrorText>{error}</ErrorText>
          {notesLoading ? (
            <p className="text-sm text-ink-400">Laster …</p>
          ) : (
            <>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="F.eks. oppmøte og oppførsel fra tidligere år …"
                className="w-full rounded-lg border border-cream-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-gold-500 focus:outline-none"
              />
              <Button onClick={saveNotes} disabled={saving} className="mt-2 !px-3 !py-1.5 !text-xs">
                {saving ? 'Lagrer …' : 'Lagre notater'}
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  )
}
