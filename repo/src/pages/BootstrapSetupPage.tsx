import { useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth.ts'
import { userService, UserServiceError } from '../services/userService.ts'
import { getBootstrapPassword } from '../db/seed.ts'

export default function BootstrapSetupPage() {
  const { currentUser } = useAuth()
  const bootstrapPw = getBootstrapPassword()

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!currentUser?.id) {
      setError('You must be logged in to set up your password.')
      return
    }

    if (newPassword.length < 12) {
      setError('Password must be at least 12 characters.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setBusy(true)
    try {
      await userService.resetPassword(currentUser.id, newPassword, currentUser)
      sessionStorage.removeItem('hf_bootstrap_pw')
      // Full reload so AuthProvider re-runs restoreSession() and picks up
      // mustChangePassword: false from IndexedDB. A SPA navigate() would keep
      // the stale in-memory currentUser (mustChangePassword: true) and cause
      // ProtectedRoute to redirect back here indefinitely.
      window.location.replace('/dashboard')
    } catch (submitError) {
      if (submitError instanceof UserServiceError) {
        setError(submitError.message)
      } else {
        setError('Failed to set password.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <section className="card" style={{ width: '100%', maxWidth: 480 }}>
        <h1 style={{ marginTop: 0 }}>Set Your Admin Password</h1>
        <p style={{ color: 'var(--muted)' }}>
          Welcome to HarborFresh. Before you begin, please set a secure password for your administrator account.
        </p>

        {bootstrapPw && (
          <div className="card" style={{ background: 'var(--surface-soft)', marginBottom: '1rem' }}>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>
              <strong>One-time bootstrap password:</strong>
            </p>
            <code style={{ fontSize: '1rem', wordBreak: 'break-all' }}>{bootstrapPw}</code>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
              This password is only visible during this session. Store it securely if needed.
            </p>
          </div>
        )}

        <form className="form" onSubmit={onSubmit} autoComplete="off">
          <label>
            New Password (min 12 characters)
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={12}
            />
          </label>

          <label>
            Confirm Password
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>

          {error && <p className="error">{error}</p>}

          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Saving...' : 'Set Password & Continue'}
          </button>
        </form>
      </section>
    </main>
  )
}
