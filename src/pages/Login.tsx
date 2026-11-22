import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api, ApiError } from '../api/client'
import { Button, ErrorText, Input, Label } from '../components/ui'
import {
  microsoftSignIn,
  renderGoogleButton,
  socialErrorMessage,
  SocialSignInError,
  type SocialProviders,
} from '../auth/social'

export default function Login() {
  const { user, loading, login, socialLogin } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [providers, setProviders] = useState<SocialProviders>({})
  const googleButton = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.socialProviders().then(setProviders)
  }, [])

  const handleSocial = useCallback(
    async (provider: 'google' | 'microsoft', getToken: () => Promise<string>) => {
      setError('')
      setSubmitting(true)
      try {
        await socialLogin(provider, await getToken())
      } catch (err) {
        if (err instanceof SocialSignInError) {
          if (err.code !== 'cancelled') setError('Kunne ikke åpne innloggingen. Tillat popup-vinduer og prøv igjen.')
        } else if (err instanceof ApiError) {
          const code = (err.body as { code?: string } | null)?.code
          setError(socialErrorMessage(code))
        } else {
          setError(socialErrorMessage(undefined))
        }
      } finally {
        setSubmitting(false)
      }
    },
    [socialLogin],
  )

  const googleClientId = providers.google?.client_id
  useEffect(() => {
    if (!googleClientId || !googleButton.current) return
    renderGoogleButton(googleButton.current, googleClientId, (idToken) => handleSocial('google', async () => idToken))
  }, [googleClientId, handleSocial])

  if (!loading && user) return <Navigate to="/" replace />

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
    } catch (err) {
      setError(err instanceof ApiError ? 'Feil e-post eller passord.' : 'Kunne ikke logge inn. Prøv igjen.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-green-900 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-md">
        <p className="font-display text-lg font-semibold text-green-900">Hennings</p>
        <p className="font-display text-xl font-semibold text-gold-600">Alternativ Jul</p>
        <p className="mt-1 mb-6 text-sm text-ink-600">Admin-innlogging</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label>E-post</Label>
            <Input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label>Passord</Label>
            <Input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={submitting} className="mt-2">
            {submitting ? 'Logger inn …' : 'Logg inn'}
          </Button>
        </form>

        {(providers.google || providers.microsoft) && (
          <div className="mt-6 border-t border-cream-200 pt-5">
            <p className="mb-3 text-center text-xs uppercase tracking-wide text-ink-400">Eller logg inn med</p>
            <div className="flex flex-col items-center gap-3">
              {providers.google && <div ref={googleButton} />}
              {providers.microsoft && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={submitting}
                  className="w-full max-w-[280px]"
                  onClick={() => handleSocial('microsoft', () => microsoftSignIn(providers.microsoft!.client_id))}
                >
                  Logg inn med Microsoft
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
