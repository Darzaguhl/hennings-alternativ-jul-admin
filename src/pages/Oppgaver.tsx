import { useEffect, useState } from 'react'
import { api, ApiError } from '../api/client'
import type { Skill } from '../types'
import { Button, Card, ErrorText, Input, Label, PageHeader } from '../components/ui'

type PhaseField = 'allowed_in_setup' | 'allowed_in_guest' | 'allowed_in_teardown'

const phaseFields: { field: PhaseField; label: string }[] = [
  { field: 'allowed_in_setup', label: 'Forberedelse' },
  { field: 'allowed_in_guest', label: 'Gjester til stede' },
  { field: 'allowed_in_teardown', label: 'Rydding' },
]

export default function Oppgaver() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const load = () => {
    setLoading(true)
    setError('')
    api
      .skills()
      .then(setSkills)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Kunne ikke laste oppgaver.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    setError('')
    try {
      await api.createSkill({ name: newName.trim() })
      setNewName('')
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke opprette oppgaven.')
    } finally {
      setCreating(false)
    }
  }

  const togglePhase = async (skill: Skill, field: PhaseField) => {
    const next = { ...skill, [field]: !skill[field] }
    setSkills((prev) => prev.map((s) => (s.id === skill.id ? next : s)))
    try {
      await api.updateSkill(skill.id, { [field]: next[field] })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke lagre endringen.')
      load()
    }
  }

  const handleDelete = async (skill: Skill) => {
    if (!confirm(`Slette oppgaven «${skill.name}»?`)) return
    try {
      await api.deleteSkill(skill.id)
      setSkills((prev) => prev.filter((s) => s.id !== skill.id))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke slette oppgaven.')
    }
  }

  return (
    <div>
      <PageHeader title="Oppgaver" subtitle="Hvilke vakt-faser hver oppgave gjelder for" />

      <ErrorText>{error}</ErrorText>

      <Card className="mb-6">
        <p className="text-sm text-ink-600">
          Kryss av hvilke faser en oppgave er aktuell for — f.eks. er «Vertskap» normalt kun aktuelt på vakter merket
          «Gjester til stede», mens «Hva som helst på forberedelsesvakt» kun gjelder «Forberedelse». En volontør kan
          kun melde seg på en vakt dersom minst én av oppgavene de har krysset av for, gjelder for vaktens fase (satt
          under Vakter). Ingen faser krysset av betyr uten restriksjon.
        </p>
      </Card>

      <Card className="mb-6">
        <Label>Ny oppgave</Label>
        <div className="flex gap-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="F.eks. Buffet" />
          <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
            {creating ? 'Legger til …' : 'Legg til'}
          </Button>
        </div>
      </Card>

      {loading ? (
        <p className="text-ink-600">Laster …</p>
      ) : (
        <div className="flex flex-col gap-2">
          {skills.map((skill) => (
            <Card key={skill.id} className="!p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="font-medium text-ink-900">{skill.name}</span>
                <Button variant="danger" onClick={() => handleDelete(skill)} className="!px-3 !py-1.5 !text-xs">
                  Slett
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-4">
                {phaseFields.map(({ field, label }) => (
                  <label key={field} className="flex items-center gap-2 text-sm text-ink-700">
                    <input
                      type="checkbox"
                      checked={skill[field]}
                      onChange={() => togglePhase(skill, field)}
                      className="h-4 w-4 rounded border-cream-200"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </Card>
          ))}
          {skills.length === 0 && <p className="text-ink-600">Ingen oppgaver er lagt til ennå.</p>}
        </div>
      )}
    </div>
  )
}
