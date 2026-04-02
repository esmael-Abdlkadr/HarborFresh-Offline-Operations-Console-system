import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button.tsx'
import { useAuth } from '../hooks/useAuth.ts'
import { AuthError } from '../services/authService.ts'

interface ReturnToState {
  returnTo?: string
}

export default function LoginPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const result = await login(username, password)
      if (result?.mustChangePassword) {
        navigate('/bootstrap-setup', { replace: true })
        return
      }
      const state = location.state as ReturnToState | null
      navigate(state?.returnTo ?? '/dashboard', { replace: true })
    } catch (submitError) {
      if (submitError instanceof AuthError) {
        if (submitError.code === 'AUTH_LOCKED') {
          const remainingMs = submitError.remainingMs ?? 0
          const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60_000))
          setError(`Account locked. Try again in ${remainingMinutes} minutes.`)
        } else {
          setError('Invalid username or password')
        }
      } else {
        setError('Login failed.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="page" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <section className="card" style={{ width: '100%', maxWidth: 420 }}>
        <h1 style={{ marginTop: 0 }}>HarborFresh Login</h1>
        <p style={{ color: 'var(--muted)' }}>Offline console authentication</p>

        <form className="form" onSubmit={onSubmit} autoComplete="off">
          <label>
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </label>

          {error && <p className="error">{error}</p>}

          <Button type="submit" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
      </section>
    </main>
  )
}
