import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db.ts'
import { useAuth } from '../hooks/useAuth.ts'
import { userService, UserServiceError } from '../services/userService.ts'
import { authService } from '../services/authService.ts'
import type { UserRole } from '../types/index.ts'

const roles: UserRole[] = [
  'Administrator',
  'ContentEditor',
  'ContentReviewer',
  'Member',
  'Dispatcher',
  'FinanceClerk',
  'Instructor',
]

export default function AdminPage() {
  const users = useLiveQuery(() => db.users.orderBy('username').toArray(), []) ?? []
  const { currentUser, encryptionKey, hasRole } = useAuth()

  const [username, setUsername] = useState('')
  const [role, setRole] = useState<UserRole>('Member')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Sensitive notes state
  const [notesText, setNotesText] = useState('')
  const [notesError, setNotesError] = useState<string | null>(null)
  const [notesBusy, setNotesBusy] = useState(false)

  async function onCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await userService.createUser(username.trim(), password, role, currentUser!)
      setUsername('')
      setRole('Member')
      setPassword('')
    } catch (createError) {
      if (createError instanceof UserServiceError) {
        setError(createError.message)
      } else {
        setError(createError instanceof Error ? createError.message : 'Failed to create user.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function resetPassword(userId: number) {
    const newPassword = window.prompt('Enter new password (minimum 12 chars):', '')
    if (!newPassword) return
    setError(null)
    try {
      await userService.resetPassword(userId, newPassword, currentUser!)
    } catch (resetError) {
      if (resetError instanceof UserServiceError) {
        setError(resetError.message)
      } else {
        setError(resetError instanceof Error ? resetError.message : 'Password reset failed.')
      }
    }
  }

  async function unlockAccount(userId: number) {
    setError(null)
    try {
      await userService.unlockAccount(userId, currentUser!)
    } catch (unlockError) {
      setError(unlockError instanceof Error ? unlockError.message : 'Unlock failed.')
    }
  }

  async function loadNotes() {
    if (!currentUser?.id || !encryptionKey) return
    setNotesError(null)
    setNotesBusy(true)
    try {
      const notes = await authService.readSensitiveNotes(currentUser.id, encryptionKey)
      setNotesText(notes ?? '')
    } catch (loadError) {
      setNotesError(loadError instanceof Error ? loadError.message : 'Failed to load notes.')
    } finally {
      setNotesBusy(false)
    }
  }

  async function saveNotes() {
    if (!currentUser?.id || !encryptionKey) return
    setNotesError(null)
    setNotesBusy(true)
    try {
      await authService.updateSensitiveNotes(currentUser.id, notesText, encryptionKey)
    } catch (saveError) {
      setNotesError(saveError instanceof Error ? saveError.message : 'Failed to save notes.')
    } finally {
      setNotesBusy(false)
    }
  }

  return (
    <main className="page">
      <section className="card">
        <h2>Administration</h2>
        <p style={{ color: 'var(--muted)' }}>Manage users, lockouts, and credentials.</p>
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Create User</h3>
        <form className="form" onSubmit={onCreateUser}>
          <label>
            Username
            <input value={username} onChange={(event) => setUsername(event.target.value)} required />
          </label>

          <label>
            Role
            <select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
              {roles.map((entryRole) => (
                <option key={entryRole} value={entryRole}>
                  {entryRole}
                </option>
              ))}
            </select>
          </label>

          <label>
            Initial Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {error && <p className="error">{error}</p>}

          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Creating...' : 'Create User'}
          </button>
        </form>
      </section>

      <section className="card" style={{ marginTop: '1rem', overflowX: 'auto' }}>
        <h3 style={{ marginTop: 0 }}>User List</h3>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.45rem' }}>Username</th>
              <th style={{ textAlign: 'left', padding: '0.45rem' }}>Role</th>
              <th style={{ textAlign: 'left', padding: '0.45rem' }}>Status</th>
              <th style={{ textAlign: 'left', padding: '0.45rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: '0.75rem', color: 'var(--muted)', textAlign: 'center' }}>
                  No users found.
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const locked = Boolean(user.lockedUntil && user.lockedUntil > Date.now())
                return (
                  <tr key={user.id}>
                    <td style={{ padding: '0.45rem' }}>{user.username}</td>
                    <td style={{ padding: '0.45rem' }}>{user.role}</td>
                    <td style={{ padding: '0.45rem' }}>{locked ? 'Locked' : 'Active'}</td>
                    <td style={{ padding: '0.45rem', display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn secondary"
                        onClick={() => {
                          if (user.id) void resetPassword(user.id)
                        }}
                      >
                        Reset Password
                      </button>
                      <button
                        className="btn secondary"
                        onClick={() => {
                          if (user.id) void unlockAccount(user.id)
                        }}
                      >
                        Unlock Account
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </section>

      {hasRole('Administrator') && (
        <section className="card" style={{ marginTop: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>My Sensitive Notes</h3>
          {!encryptionKey ? (
            <p style={{ color: 'var(--muted)' }}>Re-login required to access encrypted notes.</p>
          ) : (
            <div className="form" style={{ maxWidth: '100%' }}>
              <label>
                Notes
                <textarea
                  rows={5}
                  value={notesText}
                  onChange={(e) => setNotesText(e.target.value)}
                  placeholder="Enter your sensitive notes here..."
                />
              </label>
              {notesError && <p className="error">{notesError}</p>}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn secondary" onClick={() => void loadNotes()} disabled={notesBusy}>
                  {notesBusy ? 'Loading...' : 'Load Notes'}
                </button>
                <button className="btn" onClick={() => void saveNotes()} disabled={notesBusy}>
                  {notesBusy ? 'Saving...' : 'Save Notes'}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  )
}
