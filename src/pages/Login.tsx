import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../api/client'
import { Button, ErrorText, Input, Label } from '../components/ui'

export default function Login() {
  const { user, loading, login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
      </div>
    </div>
  )
}
