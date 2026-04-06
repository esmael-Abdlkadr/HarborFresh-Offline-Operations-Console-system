// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db.ts'
import { dispatchService } from './dispatchService.ts'
import { userService } from './userService.ts'
import type { User } from '../types/index.ts'

async function resetDb() {
  await db.delete()
  await db.open()
}

describe('page data boundary and minimization', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('dispatch actor projection never includes credential fields', async () => {
    await db.users.bulkAdd([
      {
        username: 'dispatch1',
        role: 'Dispatcher',
        passwordHash: 'hash-a',
        salt: 'salt-a',
        failedAttempts: 0,
      },
      {
        username: 'admin1',
        role: 'Administrator',
        passwordHash: 'hash-b',
        salt: 'salt-b',
        failedAttempts: 0,
      },
      {
        username: 'member1',
        role: 'Member',
        passwordHash: 'hash-c',
        salt: 'salt-c',
        failedAttempts: 0,
      },
    ])

    const dispatchActor = (await db.users.where('role').equals('Dispatcher').first())!
    const actors = await dispatchService.listDispatchActors(dispatchActor)
    expect(actors.length).toBe(2)
    expect(actors.every((a) => a.role === 'Dispatcher' || a.role === 'Administrator')).toBe(true)
    expect(actors.every((a) => Object.prototype.hasOwnProperty.call(a, 'passwordHash'))).toBe(false)
    expect(actors.every((a) => Object.prototype.hasOwnProperty.call(a, 'salt'))).toBe(false)
  })

  it('admin user list returns safe projection only', async () => {
    const adminId = await db.users.add({
      username: 'root',
      role: 'Administrator',
      passwordHash: 'hash-root',
      salt: 'salt-root',
      failedAttempts: 0,
    })
    await db.users.add({
      username: 'operator',
      role: 'Dispatcher',
      passwordHash: 'hash-op',
      salt: 'salt-op',
      failedAttempts: 2,
    })

    const admin = (await db.users.get(adminId)) as User
    const users = await userService.listUsers(admin)
    expect(users.length).toBe(2)
    expect(users.every((u) => Object.prototype.hasOwnProperty.call(u, 'passwordHash'))).toBe(false)
    expect(users.every((u) => Object.prototype.hasOwnProperty.call(u, 'salt'))).toBe(false)
  })
})
