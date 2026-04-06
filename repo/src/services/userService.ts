import { db } from '../db/db.ts'
import type { User, UserRole } from '../types/index.ts'
import { hashPassword } from './cryptoService.ts'

export interface UserAdminView {
  id: number
  username: string
  role: UserRole
  failedAttempts: number
  lockedUntil?: number
}

export class UserServiceError extends Error {
  code: 'USER_EXISTS' | 'PASSWORD_TOO_SHORT' | 'USER_NOT_FOUND' | 'USERNAME_REQUIRED' | 'RBAC_DENIED'
  constructor(code: UserServiceError['code'], message: string) {
    super(message)
    this.code = code
  }
}

async function writeAuditLog(actor: string, action: string, entityId: string) {
  await db.auditLogs.add({
    actor,
    action,
    entityType: 'User',
    entityId,
    timestamp: Date.now(),
  })
}

export const userService = {
  async listUsers(actor: User): Promise<UserAdminView[]> {
    if (actor.role !== 'Administrator') {
      throw new UserServiceError('RBAC_DENIED', 'Only Administrators can list users.')
    }
    const users = await db.users.orderBy('username').toArray()
    return users
      .filter((u) => u.id !== undefined)
      .map((u) => ({
        id: u.id as number,
        username: u.username,
        role: u.role,
        failedAttempts: u.failedAttempts,
        lockedUntil: u.lockedUntil,
      }))
  },

  async createUser(username: string, password: string, role: UserRole, actor: User): Promise<User> {
    if (actor.role !== 'Administrator') {
      throw new UserServiceError('RBAC_DENIED', 'Only Administrators can create users.')
    }
    const trimmedUsername = username.trim()
    if (!trimmedUsername) throw new UserServiceError('USERNAME_REQUIRED', 'Username is required.')
    if (password.length < 12) throw new UserServiceError('PASSWORD_TOO_SHORT', 'Password must be at least 12 characters.')

    const existing = await db.users.where('username').equals(trimmedUsername).first()
    if (existing) throw new UserServiceError('USER_EXISTS', 'Username already exists.')

    const { hash, salt } = await hashPassword(password)
    const userId = await db.users.add({
      username: trimmedUsername,
      role,
      passwordHash: hash,
      salt,
      failedAttempts: 0,
    })
    await writeAuditLog(actor.username, 'USER_CREATED', String(userId))
    const created = await db.users.get(userId)
    return created!
  },

  async resetPassword(userId: number, newPassword: string, actor: User): Promise<void> {
    if (actor.role !== 'Administrator' && actor.id !== userId) {
      throw new UserServiceError('RBAC_DENIED', 'Only Administrators can reset other users\' passwords.')
    }
    if (newPassword.length < 12) throw new UserServiceError('PASSWORD_TOO_SHORT', 'Password must be at least 12 characters.')
    const { hash, salt } = await hashPassword(newPassword)
    await db.users.update(userId, {
      passwordHash: hash,
      salt,
      failedAttempts: 0,
      lockedUntil: undefined,
      mustChangePassword: false,
    })
    await writeAuditLog(actor.username, 'PASSWORD_RESET', String(userId))
  },

  async unlockAccount(userId: number, actor: User): Promise<void> {
    if (actor.role !== 'Administrator') {
      throw new UserServiceError('RBAC_DENIED', 'Only Administrators can unlock accounts.')
    }
    const user = await db.users.get(userId)
    if (!user) throw new UserServiceError('USER_NOT_FOUND', 'User not found.')
    await db.users.update(userId, { failedAttempts: 0, lockedUntil: undefined })
    await writeAuditLog(actor.username, 'ACCOUNT_UNLOCKED', String(userId))
  },

  async getInstructorList(): Promise<Array<{ id: number; username: string }>> {
    const users = await db.users.where('role').anyOf(['Instructor', 'Administrator']).toArray()
    return users
      .filter((u) => u.id !== undefined)
      .map((u) => ({ id: u.id!, username: u.username }))
  },

  async getUsernames(userIds: number[]): Promise<Map<number, string>> {
    if (userIds.length === 0) return new Map()
    const unique = [...new Set(userIds)]
    const users = await db.users.where('id').anyOf(unique).toArray()
    const map = new Map<number, string>()
    for (const u of users) {
      if (u.id) map.set(u.id, u.username)
    }
    return map
  },
}
