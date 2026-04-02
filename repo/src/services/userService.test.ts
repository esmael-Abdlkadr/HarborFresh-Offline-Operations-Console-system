// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db.ts'
import { userService, UserServiceError } from './userService.ts'
import { verifyPassword } from './cryptoService.ts'

beforeEach(async () => {
  localStorage.clear()
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
  })
})

describe('userService', () => {
  describe('createUser', () => {
    it('creates a user with hashed password', async () => {
      const user = await userService.createUser('testuser', 'SecurePass123!', 'Member', 'admin')
      expect(user.username).toBe('testuser')
      expect(user.role).toBe('Member')
      expect(user.passwordHash).not.toBe('SecurePass123!')
      const dbUser = await db.users.where('username').equals('testuser').first()
      expect(dbUser).toBeTruthy()
    })

    it('writes an audit log entry on creation', async () => {
      await userService.createUser('audituser', 'AuditPass123!!', 'Dispatcher', 'admin')
      const log = await db.auditLogs.where('action').equals('USER_CREATED').first()
      expect(log).toBeTruthy()
      expect(log?.actor).toBe('admin')
    })

    it('throws USER_EXISTS for duplicate username', async () => {
      await userService.createUser('dupeuser', 'FirstPass123!!', 'Member', 'admin')
      await expect(
        userService.createUser('dupeuser', 'SecondPass123!', 'Member', 'admin'),
      ).rejects.toMatchObject({ code: 'USER_EXISTS' })
    })

    it('throws PASSWORD_TOO_SHORT for short passwords', async () => {
      await expect(
        userService.createUser('shortpw', 'short', 'Member', 'admin'),
      ).rejects.toMatchObject({ code: 'PASSWORD_TOO_SHORT' })
    })

    it('throws USERNAME_REQUIRED for empty username', async () => {
      await expect(
        userService.createUser('  ', 'ValidPass123!!', 'Member', 'admin'),
      ).rejects.toMatchObject({ code: 'USERNAME_REQUIRED' })
    })
  })

  describe('resetPassword', () => {
    it('updates password hash and clears lockout', async () => {
      const user = await userService.createUser('resetuser', 'OldPass1234!!', 'Member', 'admin')
      await db.users.update(user.id!, { lockedUntil: Date.now() + 60000, failedAttempts: 5 })

      await userService.resetPassword(user.id!, 'NewSecurePass12!', 'admin')

      const updated = await db.users.get(user.id!)
      expect(updated?.lockedUntil).toBeUndefined()
      expect(updated?.failedAttempts).toBe(0)
      expect(updated?.mustChangePassword).toBe(false)

      const valid = await verifyPassword('NewSecurePass12!', updated!.passwordHash, updated!.salt)
      expect(valid).toBe(true)
    })

    it('throws PASSWORD_TOO_SHORT for short new password', async () => {
      const user = await userService.createUser('resetshort', 'OldPass1234!!', 'Member', 'admin')
      await expect(
        userService.resetPassword(user.id!, 'short', 'admin'),
      ).rejects.toMatchObject({ code: 'PASSWORD_TOO_SHORT' })
    })

    it('writes an audit log on password reset', async () => {
      const user = await userService.createUser('resetlog', 'OldPass1234!!', 'Member', 'admin')
      await userService.resetPassword(user.id!, 'NewPassword123!', 'admin')
      const log = await db.auditLogs.where('action').equals('PASSWORD_RESET').first()
      expect(log).toBeTruthy()
    })
  })

  describe('unlockAccount', () => {
    it('clears lockedUntil and failedAttempts', async () => {
      const user = await userService.createUser('lockuser', 'LockPass1234!', 'Member', 'admin')
      await db.users.update(user.id!, { lockedUntil: Date.now() + 999999, failedAttempts: 5 })

      await userService.unlockAccount(user.id!, 'admin')

      const updated = await db.users.get(user.id!)
      expect(updated?.lockedUntil).toBeUndefined()
      expect(updated?.failedAttempts).toBe(0)
    })

    it('throws USER_NOT_FOUND for unknown userId', async () => {
      await expect(
        userService.unlockAccount(99999, 'admin'),
      ).rejects.toBeInstanceOf(UserServiceError)
    })

    it('writes an audit log on unlock', async () => {
      const user = await userService.createUser('unlocklog', 'UnlockPass123!', 'Member', 'admin')
      await userService.unlockAccount(user.id!, 'admin')
      const log = await db.auditLogs.where('action').equals('ACCOUNT_UNLOCKED').first()
      expect(log).toBeTruthy()
    })
  })
})
