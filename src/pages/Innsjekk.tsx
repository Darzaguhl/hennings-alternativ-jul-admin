import { useEffect, useRef, useState, type FormEvent } from 'react'
import QRCode from 'qrcode'
import { useEvents } from '../context/EventContext'
import { api, ApiError } from '../api/client'
import { Button, Card, ErrorText, Input, Label, PageHeader } from '../components/ui'

export default function Innsjekk() {
  const { selectedEvent, refresh } = useEvents()
  const [userCode, setUserCode] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const isSuperadmin = selectedEvent?.viewer_role === 'superadmin'

  useEffect(() => {
    if (selectedEvent?.checkin_mode === 'event_qr' && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, selectedEvent.code, { width: 260, margin: 1 }).catch(() => {})
    }
  }, [selectedEvent])

  if (!selectedEvent) return <p className="text-ink-600">Ingen arrangement valgt.</p>

  const handleCheckin = async (e: FormEvent) => {
    e.preventDefault()
    if (!userCode.trim()) return
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      const result = await api.checkin(selectedEvent.id, userCode.trim())
      setMessage(`${result.user.email}: ${result.message}`)
      setUserCode('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke sjekke inn.')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleMode = async () => {
    const nextMode = selectedEvent.checkin_mode === 'personal_qr' ? 'event_qr' : 'personal_qr'
    try {
      await api.updateEvent(selectedEvent.id, { checkin_mode: nextMode })
      refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kunne ikke endre innsjekk-modus.')
    }
  }

  return (
    <div>
      <PageHeader title="Innsjekk" subtitle={selectedEvent.title} />

      <ErrorText>{error}</ErrorText>

      {isSuperadmin && (
        <Card className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-600">Innsjekk-modus</h2>
          <p className="mb-3 text-sm text-ink-600">
            {selectedEvent.checkin_mode === 'personal_qr'
              ? 'Personlig QR — en ansvarlig skanner hver frivillig sin egen kode.'
              : 'Delt QR — de frivillige skanner én delt kode selv.'}
          </p>
          <Button variant="secondary" onClick={toggleMode}>
            Bytt til {selectedEvent.checkin_mode === 'personal_qr' ? 'delt kode' : 'personlig QR'}
          </Button>
        </Card>
      )}

      {selectedEvent.checkin_mode === 'personal_qr' ? (
        <Card className="max-w-md">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-600">Sjekk inn frivillig</h2>
          <form onSubmit={handleCheckin} className="flex flex-col gap-3">
            <div>
              <Label>Kode (skann eller skriv inn)</Label>
              <Input
                autoFocus
                value={userCode}
                onChange={(e) => setUserCode(e.target.value)}
                placeholder="f.eks. fra en håndholdt skanner"
              />
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Sjekker inn …' : 'Sjekk inn'}
            </Button>
            {message && <p className="text-sm text-green-800">{message}</p>}
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
