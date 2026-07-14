import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError, tokenStore } from '../api/client'
import type { InvitePreview, MembershipRole } from '../types'
import { Button, ErrorText, Input, Label } from '../components/ui'

const roleLabel: Record<MembershipRole, string> = {
  owner: 'Eier',
  admin: 'Admin',
  checkin_staff: 'Innsjekk-ansvarlig',
}

export default function AcceptInvite() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const navigate = useNavigate()

  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (!token) {
      setLoadError('Mangler invitasjonskode i lenken.')
      setLoading(false)
      return
    }
    api
      .inviteByToken(token)
      .then(setPreview)
      .catch(() => setLoadError('Denne invitasjonen finnes ikke eller er ikke lenger gyldig.'))
      .finally(() => setLoading(false))
  }, [token])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitError('')
    if (password !== confirmPassword) {
      setSubmitError('Passordene er ikke like.')
      return
    }
    setSubmitting(true)
    try {
      const result = await api.acceptInvite(token, password)
      tokenStore.set(result.access, result.refresh)
      navigate('/')
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Kunne ikke fullføre registreringen.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-green-900 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-md">
        <p className="font-display text-lg font-semibold text-green-900">Hennings</p>
        <p className="font-display text-xl font-semibold text-gold-600">Alternativ Jul</p>
        <p className="mt-1 mb-6 text-sm text-ink-600">Sett opp kontoen din</p>

        {loading ? (
          <p className="text-sm text-ink-600">Laster …</p>
        ) : loadError || !preview ? (
          <ErrorText>{loadError || 'Ukjent feil.'}</ErrorText>
        ) : !preview.is_usable ? (
          <ErrorText>Denne invitasjonen er brukt eller har gått ut. Be om en ny.</ErrorText>
        ) : (
          <>
            <p className="mb-4 text-sm text-ink-700">
              Du er invitert som <strong>{roleLabel[preview.role]}</strong> for {preview.event_title} med{' '}
              {preview.email}.
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <Label>Passord</Label>
                <Input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div>
                <Label>Gjenta passord</Label>
                <Input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <ErrorText>{submitError}</ErrorText>
              <Button type="submit" disabled={submitting} className="mt-2">
                {submitting ? 'Fullfører …' : 'Fullfør registrering'}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
