import { useEffect, useState } from 'react'
import { api, ApiError } from '../api/client'
import type { Skill } from '../types'
import { Button, Card, ErrorText, Input, Label, PageHeader } from '../components/ui'

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
      <PageHeader title="Oppgaver" subtitle="Katalogen over oppgaver en vakt kan tilby" />

      <ErrorText>{error}</ErrorText>

      <Card className="mb-6">
        <p className="text-sm text-ink-600">
          Dette er kun navnekatalogen. Hvilke vakter en oppgave faktisk tilbys på — og hvor mange plasser den har —
          settes per vakt under Vakter.
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
            </Card>
          ))}
          {skills.length === 0 && <p className="text-ink-600">Ingen oppgaver er lagt til ennå.</p>}
        </div>
      )}
    </div>
  )
}
