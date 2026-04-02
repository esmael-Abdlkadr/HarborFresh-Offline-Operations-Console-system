import { db } from '../db/db.ts'
import type { User, UserRole } from '../types/index.ts'
import {
  decryptField,
  deriveEncryptionKey,
  encryptField,
  verifyPassword,
} from './cryptoService.ts'

const SESSION_KEY = 'hf_session'
const MAX_FAILED_ATTEMPTS = 5
const LOCK_DURATION_MS = 15 * 60 * 1000
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000

export type AuthErrorCode =
  | 'AUTH_USER_NOT_FOUND'
  | 'AUTH_WRONG_PASSWORD'
  | 'AUTH_LOCKED'
  | 'AUTH_SESSION_EXPIRED'

export class AuthError extends Error {
  code: AuthErrorCode
  remainingMs?: number

  constructor(code: AuthErrorCode, message: string, remainingMs?: number) {
    super(message)
    this.code = code
    this.remainingMs = remainingMs
  }
}

interface StoredSession {
  sessionId: number
  userId: number
  role: UserRole
}

interface LoginResult {
  user: User
  encryptionKey: CryptoKey
}

function saveStoredSession(session: StoredSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

function readStoredSession(): StoredSession | null {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as StoredSession
    if (!parsed.sessionId || !parsed.userId || !parsed.role) {
      localStorage.removeItem(SESSION_KEY)
      return null
    }
    return parsed
  } catch {
    localStorage.removeItem(SESSION_KEY)
    return null
  }
}

async function incrementFailures(user: User) {
  if (!user.id) {
    return
  }

  const nextAttempts = user.failedAttempts + 1
  if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
    await db.users.update(user.id, {
      failedAttempts: 0,
      lockedUntil: Date.now() + LOCK_DURATION_MS,
    })
    return
  }

  await db.users.update(user.id, { failedAttempts: nextAttempts })
}

export const authService = {
  async login(username: string, password: string): Promise<LoginResult> {
    const user = await db.users.where('username').equals(username.trim()).first()
    if (!user || !user.id) {
      throw new AuthError('AUTH_USER_NOT_FOUND', 'Invalid username or password.')
    }

    const now = Date.now()
    if (user.lockedUntil && user.lockedUntil > now) {
      throw new AuthError('AUTH_LOCKED', 'Account is locked.', user.lockedUntil - now)
    }

    const validPassword = await verifyPassword(password, user.passwordHash, user.salt)
    if (!validPassword) {
      await incrementFailures(user)
      throw new AuthError('AUTH_WRONG_PASSWORD', 'Invalid username or password.')
    }

    await db.users.update(user.id, {
      failedAttempts: 0,
      lockedUntil: undefined,
    })

    const nowMs = Date.now()
    const sessionId = await db.sessions.add({
      userId: user.id,
      createdAt: nowMs,
      lastActiveAt: nowMs,
    })

    saveStoredSession({ sessionId, userId: user.id, role: user.role })

    const refreshedUser = await db.users.get(user.id)
    if (!refreshedUser) {
      throw new AuthError('AUTH_USER_NOT_FOUND', 'Invalid username or password.')
    }

    const encryptionKey = await deriveEncryptionKey(password, refreshedUser.salt)
    return {
      user: refreshedUser,
      encryptionKey,
    }
  },

  logout() {
    localStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem('hf_bootstrap_pw')
  },

  async restoreSession(): Promise<User | null> {
    const saved = readStoredSession()
    if (!saved) {
      return null
    }

    const session = await db.sessions.get(saved.sessionId)
    if (!session) {
      localStorage.removeItem(SESSION_KEY)
      return null
    }

    // Tamper detection: the session row in IndexedDB is authoritative.
    // If the userId stored in localStorage was modified to a different value,
    // reject the restore and invalidate the session.
    if (session.userId !== saved.userId) {
      await db.sessions.delete(saved.sessionId)
      localStorage.removeItem(SESSION_KEY)
      return null
    }

    const now = Date.now()
    if (now - session.lastActiveAt > SESSION_MAX_AGE_MS) {
      await db.sessions.delete(saved.sessionId)
      localStorage.removeItem(SESSION_KEY)
      throw new AuthError('AUTH_SESSION_EXPIRED', 'Session expired.')
    }

    await db.sessions.update(saved.sessionId, {
      lastActiveAt: now,
    })

    // Use session.userId from IndexedDB (authoritative), not saved.userId from localStorage.
    const user = await db.users.get(session.userId)
    if (!user) {
      localStorage.removeItem(SESSION_KEY)
      return null
    }

    return user
  },

  async updateSensitiveNotes(userId: number, notes: string, key: CryptoKey): Promise<void> {
    const encryptedNotes = await encryptField(notes, key)
    await db.users.update(userId, { sensitiveNotes: encryptedNotes })
  },

  async readSensitiveNotes(userId: number, key: CryptoKey): Promise<string | null> {
    const user = await db.users.get(userId)
    if (!user || !user.sensitiveNotes) {
      return null
    }
    return decryptField(user.sensitiveNotes, key)
  },
}
