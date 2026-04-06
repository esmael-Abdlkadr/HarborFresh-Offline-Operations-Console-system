// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db.ts'
import { seedTestUsers } from '../db/seed.ts'
import { dispatchService, DispatchError } from './dispatchService.ts'
import { FinanceError, financeService } from './financeService.ts'
import type { User } from '../types/index.ts'

async function getUser(username: string): Promise<User> {
  const user = await db.users.where('username').equals(username).first()
  if (!user) throw new Error(`Missing user: ${username}`)
  return user
}

beforeEach(async () => {
  localStorage.clear()
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
  })
  await seedTestUsers()
})

describe('dispatch read API RBAC enforcement', () => {
  const deniedRoles = ['member', 'finance', 'editor', 'reviewer', 'instructor'] as const
  const allowedRoles = ['dispatcher', 'admin'] as const

  describe.each(deniedRoles)('role=%s is rejected', (username) => {
    it('listBatchesForDate rejects', async () => {
      const user = await getUser(username)
      await expect(dispatchService.listBatchesForDate('2026-01-01', user)).rejects.toBeInstanceOf(DispatchError)
    })

    it('listTasks rejects', async () => {
      const user = await getUser(username)
      await expect(dispatchService.listTasks(user)).rejects.toBeInstanceOf(DispatchError)
    })

    it('listDispatchActors rejects', async () => {
      const user = await getUser(username)
      await expect(dispatchService.listDispatchActors(user)).rejects.toBeInstanceOf(DispatchError)
    })

    it('listRecentLogs rejects', async () => {
      const user = await getUser(username)
      await expect(dispatchService.listRecentLogs(10, user)).rejects.toBeInstanceOf(DispatchError)
    })
  })

  describe.each(allowedRoles)('role=%s is allowed', (username) => {
    it('listBatchesForDate succeeds', async () => {
      const user = await getUser(username)
      await expect(dispatchService.listBatchesForDate('2026-01-01', user)).resolves.toBeInstanceOf(Array)
    })

    it('listTasks succeeds', async () => {
      const user = await getUser(username)
      await expect(dispatchService.listTasks(user)).resolves.toBeInstanceOf(Array)
    })

    it('listDispatchActors succeeds', async () => {
      const user = await getUser(username)
      await expect(dispatchService.listDispatchActors(user)).resolves.toBeInstanceOf(Array)
    })

    it('listRecentLogs succeeds', async () => {
      const user = await getUser(username)
      await expect(dispatchService.listRecentLogs(10, user)).resolves.toBeInstanceOf(Array)
    })
  })
})

describe('finance read API RBAC enforcement', () => {
  const deniedRoles = ['member', 'dispatcher', 'editor', 'reviewer', 'instructor'] as const
  const allowedRoles = ['finance', 'admin'] as const

  describe.each(deniedRoles)('role=%s is rejected', (username) => {
    it('listLedgerEntries rejects', async () => {
      const user = await getUser(username)
      await expect(financeService.listLedgerEntries(user)).rejects.toBeInstanceOf(FinanceError)
    })

    it('listAttachments rejects', async () => {
      const user = await getUser(username)
      await expect(financeService.listAttachments(user)).rejects.toBeInstanceOf(FinanceError)
    })
  })

  describe.each(allowedRoles)('role=%s is allowed', (username) => {
    it('listLedgerEntries succeeds', async () => {
      const user = await getUser(username)
      await expect(financeService.listLedgerEntries(user)).resolves.toBeInstanceOf(Array)
    })

    it('listAttachments succeeds', async () => {
      const user = await getUser(username)
      await expect(financeService.listAttachments(user)).resolves.toBeInstanceOf(Array)
    })
  })
})
