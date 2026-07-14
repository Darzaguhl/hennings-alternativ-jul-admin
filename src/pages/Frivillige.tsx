import { useEffect, useMemo, useState } from 'react'
import { useEvents } from '../context/EventContext'
import { api, ApiError } from '../api/client'
import type { Shift, User } from '../types'
import { Badge, Card, ErrorText, Input, Label, PageHeader, Select } from '../components/ui'
import { hasSuperadminAccess } from '../utils/roles'

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
    if (search.trim() && !u.email.toLowerCase().includes(search.trim().toLowerCase())) return false
    if (skillFilter && !u.skills.some((s) => s.name === skillFilter)) return false
    if (vaktFilter && !(signupsByUser.get(u.id) ?? []).some((s) => String(s.id) === vaktFilter)) return false
    return true
  })

  if (!selectedEvent) return <p className="text-ink-600">Ingen arrangement valgt.</p>

  const role = selectedEvent.viewer_role
  const canView = hasSuperadminAccess(role) || role === 'checkin_staff' || role === 'shift_leader'
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
            <Label>Søk på e-post</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="navn@epost.no" />
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
          {filtered.map((u) => {
            const userShifts = signupsByUser.get(u.id) ?? []
            return (
              <Card key={u.id} className="!p-4">
                <p className="font-medium text-ink-900">{u.email}</p>
                {u.skills.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {u.skills.map((s) => (
                      <Badge key={s.id} tone="warning">
                        {s.name}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="mt-2">
                  {userShifts.length === 0 ? (
                    <p className="text-sm text-ink-400">Ikke meldt på noen vakt ennå.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {userShifts.map((s) => (
                        <Badge key={s.id} tone="neutral">
                          {s.title} ({s.date})
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
          {filtered.length === 0 && <p className="text-ink-600">Ingen frivillige matcher filteret.</p>}
        </div>
      )}
    </div>
  )
}
