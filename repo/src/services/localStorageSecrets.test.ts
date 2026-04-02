// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db.ts'
import { seedIfEmpty } from '../db/seed.ts'
import { authService } from './authService.ts'

beforeEach(async () => {
  localStorage.clear()
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
  })
  await seedIfEmpty()
})

const SENSITIVE_PATTERNS = [
  /password/i,
  /HarborAdmin/i,
  /HarborFin/i,
  /pbkdf2/i,
  /aes-gcm/i,
  /encryptionKey/i,
  /passwordHash/i,
  /derivedKey/i,
]

function allLocalStorageValues(): string {
  return Object.keys(localStorage)
    .map((k) => `${k}=${localStorage.getItem(k) ?? ''}`)
    .join('\n')
}

describe('localStorage secrets audit', () => {
  it('stores no password or key material after login', async () => {
    await authService.login('admin', 'HarborAdmin#1!')
    const dump = allLocalStorageValues()
    for (const pattern of SENSITIVE_PATTERNS) {
      expect(dump).not.toMatch(pattern)
    }
  })

  it('only stores session metadata keys (no secrets) after login', async () => {
    await authService.login('member', 'HarborMember1!')
    const keys = Object.keys(localStorage)
    // All stored keys must be recognizable session metadata identifiers
    const allowedPrefixes = ['sessionId', 'userId', 'userRole', 'hf_']
    for (const key of keys) {
      const isAllowed = allowedPrefixes.some((prefix) => key === prefix || key.startsWith(prefix))
      expect(isAllowed, `Unexpected localStorage key: ${key}`).toBe(true)
    }
  })

  it('clears all localStorage on logout', async () => {
    await authService.login('admin', 'HarborAdmin#1!')
    expect(Object.keys(localStorage).length).toBeGreaterThan(0)
    authService.logout()
    expect(Object.keys(localStorage).length).toBe(0)
  })

  it('stores no sensitive data after finance user login', async () => {
    await authService.login('finance', 'HarborFin#1!!')
    const dump = allLocalStorageValues()
    for (const pattern of SENSITIVE_PATTERNS) {
      expect(dump).not.toMatch(pattern)
    }
  })
})
