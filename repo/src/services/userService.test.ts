// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db.ts'
import { userService, UserServiceError } from './userService.ts'
import { verifyPassword } from './cryptoService.ts'
import { hashPassword } from './cryptoService.ts'
import type { User } from '../types/index.ts'

async function makeUser(username: string, role: User['role']): Promise<User> {
  const { hash, salt } = await hashPassword('SeedPass1234!')
  const id = await db.users.add({ username, role, passwordHash: hash, salt, failedAttempts: 0 })
  return (await db.users.get(id))!
}

let adminUser: User
let memberUser: User

beforeEach(async () => {
  localStorage.clear()
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
  })
  adminUser = await makeUser('admin', 'Administrator')
  memberUser = await makeUser('member', 'Member')
})

describe('userService', () => {
  describe('createUser', () => {
    it('admin creates a user with hashed password', async () => {
      const user = await userService.createUser('testuser', 'SecurePass123!', 'Member', adminUser)
      expect(user.username).toBe('testuser')
      expect(user.role).toBe('Member')
      expect(user.passwordHash).not.toBe('SecurePass123!')
      const dbUser = await db.users.where('username').equals('testuser').first()
      expect(dbUser).toBeTruthy()
    })

    it('writes an audit log entry on creation', async () => {
      await userService.createUser('audituser', 'AuditPass123!!', 'Dispatcher', adminUser)
      const log = await db.auditLogs.where('action').equals('USER_CREATED').first()
      expect(log).toBeTruthy()
      expect(log?.actor).toBe('admin')
    })

    it('throws USER_EXISTS for duplicate username', async () => {
      await userService.createUser('dupeuser', 'FirstPass123!!', 'Member', adminUser)
      await expect(
        userService.createUser('dupeuser', 'SecondPass123!', 'Member', adminUser),
      ).rejects.toMatchObject({ code: 'USER_EXISTS' })
    })

    it('throws PASSWORD_TOO_SHORT for short passwords', async () => {
      await expect(
        userService.createUser('shortpw', 'short', 'Member', adminUser),
      ).rejects.toMatchObject({ code: 'PASSWORD_TOO_SHORT' })
    })

    it('throws USERNAME_REQUIRED for empty username', async () => {
      await expect(
        userService.createUser('  ', 'ValidPass123!!', 'Member', adminUser),
      ).rejects.toMatchObject({ code: 'USERNAME_REQUIRED' })
    })

    it('non-admin cannot create a user', async () => {
      await expect(
        userService.createUser('blocked', 'ValidPass123!!', 'Member', memberUser),
      ).rejects.toMatchObject({ code: 'RBAC_DENIED' })
    })

    it('non-admin createUser rejection does not write to DB', async () => {
      await expect(
        userService.createUser('ghost', 'ValidPass123!!', 'Member', memberUser),
      ).rejects.toBeDefined()
      const ghost = await db.users.where('username').equals('ghost').first()
      expect(ghost).toBeUndefined()
    })
  })

  describe('resetPassword', () => {
    it('admin resets another user password and clears lockout', async () => {
      await db.users.update(memberUser.id!, { lockedUntil: Date.now() + 60000, failedAttempts: 5 })

      await userService.resetPassword(memberUser.id!, 'NewSecurePass12!', adminUser)

      const updated = await db.users.get(memberUser.id!)
      expect(updated?.lockedUntil).toBeUndefined()
      expect(updated?.failedAttempts).toBe(0)
      expect(updated?.mustChangePassword).toBe(false)

      const valid = await verifyPassword('NewSecurePass12!', updated!.passwordHash, updated!.salt)
      expect(valid).toBe(true)
    })

    it('user can reset their own password', async () => {
      await userService.resetPassword(memberUser.id!, 'NewSelfPass123!', memberUser)
      const updated = await db.users.get(memberUser.id!)
      const valid = await verifyPassword('NewSelfPass123!', updated!.passwordHash, updated!.salt)
      expect(valid).toBe(true)
    })

    it('non-admin cannot reset another user password', async () => {
      await expect(
        userService.resetPassword(adminUser.id!, 'HackAdmin1234!', memberUser),
      ).rejects.toMatchObject({ code: 'RBAC_DENIED' })
    })

    it('throws PASSWORD_TOO_SHORT for short new password', async () => {
      await expect(
        userService.resetPassword(memberUser.id!, 'short', adminUser),
      ).rejects.toMatchObject({ code: 'PASSWORD_TOO_SHORT' })
    })

    it('writes an audit log on password reset', async () => {
      await userService.resetPassword(memberUser.id!, 'NewPassword123!', adminUser)
      const log = await db.auditLogs.where('action').equals('PASSWORD_RESET').first()
      expect(log).toBeTruthy()
    })
  })

  describe('unlockAccount', () => {
    it('admin clears lockedUntil and failedAttempts', async () => {
      await db.users.update(memberUser.id!, { lockedUntil: Date.now() + 999999, failedAttempts: 5 })

      await userService.unlockAccount(memberUser.id!, adminUser)

      const updated = await db.users.get(memberUser.id!)
      expect(updated?.lockedUntil).toBeUndefined()
      expect(updated?.failedAttempts).toBe(0)
    })

    it('non-admin cannot unlock an account', async () => {
      await expect(
        userService.unlockAccount(adminUser.id!, memberUser),
      ).rejects.toMatchObject({ code: 'RBAC_DENIED' })
    })

    it('throws USER_NOT_FOUND for unknown userId', async () => {
      await expect(
        userService.unlockAccount(99999, adminUser),
      ).rejects.toBeInstanceOf(UserServiceError)
    })

    it('writes an audit log on unlock', async () => {
      await userService.unlockAccount(memberUser.id!, adminUser)
      const log = await db.auditLogs.where('action').equals('ACCOUNT_UNLOCKED').first()
      expect(log).toBeTruthy()
    })
  })
})
