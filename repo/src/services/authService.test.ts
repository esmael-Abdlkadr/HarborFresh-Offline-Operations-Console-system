// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db.ts'
import { seedTestUsers } from '../db/seed.ts'
import { AuthError, authService } from './authService.ts'
import { hashPassword } from './cryptoService.ts'

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()

  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
  })

  await seedTestUsers()
})

describe('authService', () => {
  it('locks account after five failed attempts', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(authService.login('member', 'wrong-password')).rejects.toMatchObject({
        code: 'AUTH_WRONG_PASSWORD',
      })
    }

    await expect(authService.login('member', 'wrong-password')).rejects.toMatchObject({
      code: 'AUTH_LOCKED',
    })
  })

  it('restores valid sessions and expires old sessions', async () => {
    const loginResult = await authService.login('admin', 'HarborAdmin#1!')
    expect(loginResult.user.username).toBe('admin')

    const restored = await authService.restoreSession()
    expect(restored?.username).toBe('admin')

    const rawSession = localStorage.getItem('hf_session')
    expect(rawSession).toBeTruthy()
    const parsedSession = JSON.parse(rawSession ?? '{}') as { sessionId: number }

    await db.sessions.update(parsedSession.sessionId, {
      lastActiveAt: Date.now() - 9 * 60 * 60 * 1000,
    })

    await expect(authService.restoreSession()).rejects.toMatchObject({
      code: 'AUTH_SESSION_EXPIRED',
    })
  })

  it('supports newly created user login and unlock flow', async () => {
    const passwordData = await hashPassword('NewMemberPass#12')
    const userId = await db.users.add({
      username: 'newmember',
      role: 'Member',
      passwordHash: passwordData.hash,
      salt: passwordData.salt,
      failedAttempts: 0,
    })

    const loginResult = await authService.login('newmember', 'NewMemberPass#12')
    expect(loginResult.user.id).toBe(userId)

    await db.users.update(userId, {
      lockedUntil: Date.now() + 14 * 60 * 1000,
      failedAttempts: 0,
    })

    await expect(authService.login('newmember', 'NewMemberPass#12')).rejects.toBeInstanceOf(AuthError)

    await db.users.update(userId, { lockedUntil: undefined, failedAttempts: 0 })
    await expect(authService.login('newmember', 'NewMemberPass#12')).resolves.toBeTruthy()
  })

  it('sensitive notes encrypt at rest and decrypt on access', async () => {
    const loginResult = await authService.login('admin', 'HarborAdmin#1!')
    const { user, encryptionKey } = loginResult
    const userId = user.id!

    await authService.updateSensitiveNotes(userId, 'Top secret harbor note', encryptionKey)

    // Verify ciphertext is stored (not plaintext)
    const raw = await db.users.get(userId)
    expect(raw?.sensitiveNotes).toBeTruthy()
    expect(raw?.sensitiveNotes).not.toBe('Top secret harbor note')

    // Decrypt and verify
    const decrypted = await authService.readSensitiveNotes(userId, encryptionKey)
    expect(decrypted).toBe('Top secret harbor note')
  })

  it('returns null for user with no sensitive notes', async () => {
    const loginResult = await authService.login('member', 'HarborMember1!')
    const { user, encryptionKey } = loginResult
    const result = await authService.readSensitiveNotes(user.id!, encryptionKey)
    expect(result).toBeNull()
  })

  it('overwrites previous sensitive notes on update', async () => {
    const { user, encryptionKey } = await authService.login('admin', 'HarborAdmin#1!')
    await authService.updateSensitiveNotes(user.id!, 'First note', encryptionKey)
    await authService.updateSensitiveNotes(user.id!, 'Second note', encryptionKey)

    const decrypted = await authService.readSensitiveNotes(user.id!, encryptionKey)
    expect(decrypted).toBe('Second note')
  })

  it('rejects session restore when localStorage userId is tampered to a different user', async () => {
    // Log in as member, then tamper localStorage to point to admin's id
    await authService.login('member', 'HarborMember1!')
    const admin = await db.users.where('username').equals('admin').first()
    expect(admin?.id).toBeTruthy()

    const raw = localStorage.getItem('hf_session')!
    const parsed = JSON.parse(raw) as { sessionId: number; userId: number; role: string }
    parsed.userId = admin!.id!
    localStorage.setItem('hf_session', JSON.stringify(parsed))

    // restoreSession must reject the tampered pair and return null
    const result = await authService.restoreSession()
    expect(result).toBeNull()
    // Session must be invalidated in both localStorage and IndexedDB
    expect(localStorage.getItem('hf_session')).toBeNull()
    const session = await db.sessions.get(parsed.sessionId)
    expect(session).toBeUndefined()
  })

  it('logout clears hf_bootstrap_pw from sessionStorage', () => {
    sessionStorage.setItem('hf_bootstrap_pw', 'Harbor-test1234')
    authService.logout()
    expect(sessionStorage.getItem('hf_bootstrap_pw')).toBeNull()
  })
})
