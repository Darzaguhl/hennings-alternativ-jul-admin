// "Sign in with Google / Microsoft" for the browser. Both end the same way:
// an OpenID Connect ID token that the backend verifies (api/social.py) and
// swaps for our own session. Nothing here is trusted -- the token is only
// ever passed on.
//
// No SDK dependency: Google's script renders its own official button, and
// Microsoft uses the standard authorization-code + PKCE flow in a popup.

export type SocialProvider = 'google' | 'microsoft'

export interface SocialProviders {
  google?: { client_id: string }
  microsoft?: { client_id: string }
}

export class SocialSignInError extends Error {
  code: 'cancelled' | 'popup_blocked' | 'failed'
  constructor(code: 'cancelled' | 'popup_blocked' | 'failed', message: string) {
    super(message)
    this.code = code
  }
}

// ---- Google (Google Identity Services) ------------------------------------

interface GoogleIdentity {
  accounts: {
    id: {
      initialize: (config: { client_id: string; callback: (r: { credential: string }) => void }) => void
      renderButton: (el: HTMLElement, options: Record<string, string | number>) => void
    }
  }
}

let googleScript: Promise<GoogleIdentity> | null = null

const loadGoogleIdentity = (): Promise<GoogleIdentity> => {
  if (!googleScript) {
    googleScript = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.onload = () => {
        const google = (window as unknown as { google?: GoogleIdentity }).google
        if (google) resolve(google)
        else reject(new Error('Google sign-in failed to load'))
      }
      script.onerror = () => {
        googleScript = null // allow a retry
        reject(new Error('Google sign-in failed to load'))
      }
      document.head.appendChild(script)
    })
  }
  return googleScript
}

// Draws Google's own sign-in button into `el`; `onToken` gets the ID token
// when the person completes it. Returns false if Google's script can't load
// (blocked, offline) so the caller can simply leave the button out.
export const renderGoogleButton = async (
  el: HTMLElement,
  clientId: string,
  onToken: (idToken: string) => void,
  text: 'signin_with' | 'continue_with' = 'signin_with',
): Promise<boolean> => {
  try {
    const google = await loadGoogleIdentity()
    google.accounts.id.initialize({ client_id: clientId, callback: (r) => onToken(r.credential) })
    // Google wants a pixel width (200-400); fit the space we have so it
    // never overflows a narrow card.
    const width = Math.max(200, Math.min(280, el.parentElement?.clientWidth ?? 280))
    google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text, shape: 'rectangular', locale: 'nb', width })
    return true
  } catch {
    return false
  }
}

// ---- Microsoft (authorization code + PKCE, in a popup) ----------------------

const MS_AUTHORIZE = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
const MS_TOKEN = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
const MS_SCOPE = 'openid profile email'
const MS_CALLBACK_PATH = '/microsoft-callback.html'

const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const randomString = (length: number) => base64Url(crypto.getRandomValues(new Uint8Array(length)))

const sha256Base64Url = async (value: string) =>
  base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))

const jwtPayload = (token: string): Record<string, unknown> => {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(part))
  } catch {
    return {}
  }
}

// Opens Microsoft's sign-in in a popup and resolves with the ID token.
// Must be called straight from a click, or the browser blocks the popup.
export const microsoftSignIn = async (clientId: string): Promise<string> => {
  const verifier = randomString(32)
  const state = randomString(16)
  const nonce = randomString(16)
  const redirectUri = window.location.origin + MS_CALLBACK_PATH

  const url =
    MS_AUTHORIZE +
    '?' +
    new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: MS_SCOPE,
      state,
      nonce,
      code_challenge: await sha256Base64Url(verifier),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    })

  const popup = window.open(url, 'microsoft-signin', 'width=500,height=680')
  if (!popup) throw new SocialSignInError('popup_blocked', 'The sign-in window was blocked.')

  const response = await new Promise<URLSearchParams>((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      window.removeEventListener('message', onMessage)
      clearInterval(timer)
      fn()
    }
    const onMessage = (e: MessageEvent) => {
      // Only our own callback page, in the window we opened.
      if (e.origin !== window.location.origin || e.source !== popup) return
      if (!e.data || e.data.type !== 'microsoft-auth') return
      finish(() => resolve(new URLSearchParams(String(e.data.query))))
    }
    window.addEventListener('message', onMessage)
    // Closed without finishing. Give a just-posted message a moment to land.
    const timer = setInterval(() => {
      if (popup.closed) setTimeout(() => finish(() => reject(new SocialSignInError('cancelled', 'Sign-in cancelled.'))), 400)
    }, 500)
  })

  if (response.get('state') !== state) throw new SocialSignInError('failed', 'Sign-in response did not match.')
  const code = response.get('code')
  if (!code) {
    const error = response.get('error')
    throw new SocialSignInError(error === 'access_denied' ? 'cancelled' : 'failed', response.get('error_description') ?? 'Sign-in failed.')
  }

  const res = await fetch(MS_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      scope: MS_SCOPE,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.id_token) throw new SocialSignInError('failed', 'Could not complete the sign-in.')
  if (jwtPayload(body.id_token).nonce !== nonce) throw new SocialSignInError('failed', 'Sign-in response did not match.')
  return body.id_token as string
}

// Norwegian messages for the backend's error codes (api/social_views.py).
export const socialErrorMessage = (code: string | undefined, forLinking = false): string => {
  switch (code) {
    case 'no_account':
      return 'Fant ingen konto for denne e-postadressen. Be en admin om en invitasjon først.'
    case 'password_account':
      return 'Denne kontoen har passord. Logg inn med e-post og passord, og koble til Google/Microsoft under «Innlogging».'
    case 'email_unverified':
      return 'Leverandøren har ikke bekreftet e-postadressen din, så vi kan ikke logge deg inn med den. Prøv en annen konto.'
    case 'provider_not_configured':
      return 'Denne innloggingsmåten er ikke satt opp ennå.'
    case 'inactive':
      return 'Kontoen er deaktivert.'
    case 'already_linked':
      return 'Den kontoen er allerede koblet til en annen bruker.'
    case 'provider_already_linked':
      return 'Du har allerede koblet til en konto fra denne leverandøren.'
    case 'last_login_method':
      return 'Dette er din eneste innloggingsmåte. Sett et passord først.'
    default:
      return forLinking ? 'Kunne ikke koble til kontoen. Prøv igjen.' : 'Kunne ikke logge inn. Prøv igjen.'
  }
}
