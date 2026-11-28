import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../api/client'
import type { SocialIdentity } from '../types'
import { Badge, Button, Card, ErrorText, PageHeader } from '../components/ui'
import {
  microsoftSignIn,
  renderGoogleButton,
  socialErrorMessage,
  SocialSignInError,
  type SocialProvider,
  type SocialProviders,
} from '../auth/social'

const LABEL: Record<SocialProvider, string> = { google: 'Google', microsoft: 'Microsoft' }

// Connect Google/Microsoft to the account you're signed in as, so you can
// use them to sign in next time. This is also the *only* way an account that
// has a password gets social sign-in -- signing in here with the password
// and at the provider proves both are yours (see backend social_views.py).
// Connecting never changes what you're allowed to do: admin/leader access
// comes from your membership, not from the provider.
export default function Innlogging() {
  const [providers, setProviders] = useState<SocialProviders>({})
  const [identities, setIdentities] = useState<SocialIdentity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const googleButton = useRef<HTMLDivElement>(null)

  const load = () => {
    setLoading(true)
    Promise.all([api.socialProviders(), api.socialIdentities()])
      .then(([p, i]) => {
        setProviders(p)
        setIdentities(i)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Kunne ikke laste innlogging.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const link = useCallback(async (provider: SocialProvider, getToken: () => Promise<string>) => {
    setError('')
    setBusy(true)
    try {
      setIdentities(await api.linkSocialIdentity(provider, await getToken()))
    } catch (err) {
      if (err instanceof SocialSignInError) {
        if (err.code !== 'cancelled') setError('Kunne ikke åpne innloggingen. Tillat popup-vinduer og prøv igjen.')
      } else if (err instanceof ApiError) {
        setError(socialErrorMessage((err.body as { code?: string } | null)?.code, true))
      } else {
        setError(socialErrorMessage(undefined, true))
      }
    } finally {
      setBusy(false)
    }
  }, [])

  const unlink = async (provider: SocialProvider) => {
    if (!confirm(`Fjerne ${LABEL[provider]}-innloggingen?`)) return
    setError('')
    try {
      await api.unlinkSocialIdentity(provider)
      setIdentities((prev) => prev.filter((i) => i.provider !== provider))
    } catch (err) {
      setError(
        err instanceof ApiError
          ? socialErrorMessage((err.body as { code?: string } | null)?.code, true)
          : 'Kunne ikke fjerne innloggingen.',
      )
    }
  }

  const linked = (provider: SocialProvider) => identities.find((i) => i.provider === provider)
  const googleClientId = providers.google?.client_id
  const googleLinked = !!linked('google')

  useEffect(() => {
    if (loading || !googleClientId || googleLinked || !googleButton.current) return
    renderGoogleButton(googleButton.current, googleClientId, (idToken) => link('google', async () => idToken), 'continue_with')
  }, [loading, googleClientId, googleLinked, link])

  const available = (['google', 'microsoft'] as const).filter((p) => providers[p])

  return (
    <div>
      <PageHeader
        title="Innlogging"
        subtitle="Koble til Google eller Microsoft."
      />
      <div className="mb-4">
        <ErrorText>{error}</ErrorText>
      </div>

      {loading ? (
        <p className="text-ink-600">Laster …</p>
      ) : available.length === 0 ? (
        <Card>
          <p className="text-ink-600">Innlogging med Google eller Microsoft er ikke satt opp ennå.</p>
        </Card>
      ) : (
        <div className="flex max-w-lg flex-col gap-3">
          {available.map((provider) => {
            const identity = linked(provider)
            return (
              <Card key={provider} className="!p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-ink-900">
                      {LABEL[provider]} {identity && <Badge tone="success">Koblet til</Badge>}
                    </p>
                    {identity?.email && <p className="text-sm text-ink-600">{identity.email}</p>}
                  </div>
                  {identity ? (
                    <Button variant="danger" onClick={() => unlink(provider)}>
                      Fjern
                    </Button>
                  ) : provider === 'microsoft' ? (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => link('microsoft', () => microsoftSignIn(providers.microsoft!.client_id))}
                    >
                      Koble til
                    </Button>
                  ) : (
                    <div ref={googleButton} />
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
