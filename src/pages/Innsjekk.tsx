import { useEffect, useRef, useState, type FormEvent } from 'react'
import QRCode from 'qrcode'
import { Link } from 'react-router-dom'
import { useEvents } from '../context/EventContext'
import { api, ApiError } from '../api/client'
import type { User } from '../types'
import { Button, Card, ErrorText, Input, Label, PageHeader } from '../components/ui'

const displayName = (user: User) => {
  const name = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim()
  return name || user.email
}

export default function Innsjekk() {
  const { selectedEvent } = useEvents()
  const [userCode, setUserCode] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [users, setUsers] = useState<User[]>([])
  const [search, setSearch] = useState('')
  const [checkingInId, setCheckingInId] = useState<number | null>(null)

  useEffect(() => {
    api.users().then(setUsers).catch(() => {})
  }, [])

  useEffect(() => {
    if (selectedEvent?.checkin_mode === 'event_qr' && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, selectedEvent.code, { width: 260, margin: 1 }).catch(() => {})
    }
  }, [selectedEvent])

  if (!selectedEvent) return <p className="text-ink-600">Ingen arrangement valgt.</p>

  const matches =
    search.trim().length < 2
      ? []
      : users.filter((u) => {
          const term = search.trim().toLowerCase()
          return u.email.toLowerCase().includes(term) || displayName(u).toLowerCase().includes(term)
        })

  const handleManualCheckin = async (user: User) => {
    setCheckingInId(user.id)
    setError('')
    setMessage('')
    try {
      const result = await api.checkinByUserId(selectedEvent.id, user.id)
      setMessage(`${result.user.email}: ${result.message}`)
      setSearch('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke sjekke inn.')
    } finally {
      setCheckingInId(null)
    }
  }

  const handleCodeCheckin = async (e: FormEvent) => {
    e.preventDefault()
    if (!userCode.trim()) return
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      const result = await api.checkinByCode(selectedEvent.id, userCode.trim())
      setMessage(`${result.user.email}: ${result.message}`)
      setUserCode('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke sjekke inn.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <PageHeader title="Innsjekk" subtitle={selectedEvent.title} />

      <ErrorText>{error}</ErrorText>
      {message && <p className="mb-4 text-sm text-green-800">{message}</p>}

      <p className="mb-6 text-sm text-ink-600">
        {selectedEvent.checkin_mode === 'personal_qr'
          ? 'Personlig QR — en ansvarlig skanner hver frivillig sin egen kode.'
          : 'Delt QR — de frivillige skanner én delt kode selv.'}{' '}
        <Link to="/arrangement" className="font-medium text-green-800 underline">
          Endre innsjekk-modus i Arrangement
        </Link>
      </p>

      <Card className="mb-6 max-w-md">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-600">
          Sjekk inn manuelt
        </h2>
        <Label>Søk på navn eller e-post</Label>
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Skriv minst 2 tegn …"
        />
        {matches.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {matches.map((u) => (
              <div key={u.id} className="flex items-center justify-between rounded-lg bg-cream-50 px-3 py-2">
                <span className="text-sm text-ink-900">
                  {displayName(u)}
                  {displayName(u) !== u.email && <span className="ml-2 text-xs text-ink-400">{u.email}</span>}
                </span>
                <Button
                  onClick={() => handleManualCheckin(u)}
                  disabled={checkingInId === u.id}
                  className="!px-3 !py-1.5 !text-xs"
                >
                  {checkingInId === u.id ? 'Sjekker inn …' : 'Sjekk inn'}
                </Button>
              </div>
            ))}
          </div>
        )}
        {search.trim().length >= 2 && matches.length === 0 && (
          <p className="mt-2 text-sm text-ink-400">Ingen treff.</p>
        )}
      </Card>

      {selectedEvent.checkin_mode === 'personal_qr' ? (
        <Card className="max-w-md">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-600">Skann personlig QR</h2>
          <form onSubmit={handleCodeCheckin} className="flex flex-col gap-3">
            <div>
              <Label>Kode (skann eller skriv inn)</Label>
              <Input
                value={userCode}
                onChange={(e) => setUserCode(e.target.value)}
                placeholder="f.eks. fra en håndholdt skanner"
              />
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Sjekker inn …' : 'Sjekk inn'}
            </Button>
          </form>
        </Card>
      ) : (
        <Card className="max-w-md text-center">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-600">
            Delt innsjekk-kode
          </h2>
          <p className="mb-4 text-sm text-ink-600">
            Vis denne på en skjerm ved inngangen — de frivillige skanner den selv i appen.
          </p>
          <canvas ref={canvasRef} className="mx-auto" />
        </Card>
      )}
    </div>
  )
}
