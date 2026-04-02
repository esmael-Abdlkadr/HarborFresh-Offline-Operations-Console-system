// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db.ts'
import { notificationService } from './notificationService.ts'

beforeEach(async () => {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })
})

async function addNotification(overrides: Partial<Parameters<typeof db.notifications.add>[0]> = {}) {
  return db.notifications.add({
    recipientId: 1,
    templateKey: 'PICKUP_DUE',
    templateData: { orderId: '42', dueTime: '3 PM' },
    status: 'Pending',
    isRead: false,
    retries: 0,
    createdAt: Date.now(),
    ...overrides,
  })
}

describe('notificationService – durable retry queue', () => {
  describe('processRetryQueue', () => {
    it('delivers a Pending notification with no nextRetryAt', async () => {
      const id = await addNotification()
      await notificationService.processRetryQueue()
      const n = await db.notifications.get(id)
      expect(n?.status).toBe('Delivered')
    })

    it('delivers a Pending notification whose nextRetryAt is in the past', async () => {
      const id = await addNotification({ nextRetryAt: Date.now() - 1000 })
      await notificationService.processRetryQueue()
      const n = await db.notifications.get(id)
      expect(n?.status).toBe('Delivered')
    })

    it('skips a Pending notification whose nextRetryAt is in the future', async () => {
      const id = await addNotification({ nextRetryAt: Date.now() + 60_000 })
      await notificationService.processRetryQueue()
      const n = await db.notifications.get(id)
      expect(n?.status).toBe('Pending')
    })

    it('processes multiple due Pending notifications', async () => {
      const id1 = await addNotification({ templateData: { orderId: '1', dueTime: '9 AM' } })
      const id2 = await addNotification({ templateData: { orderId: '2', dueTime: '10 AM' } })
      await notificationService.processRetryQueue()
      const [n1, n2] = await Promise.all([db.notifications.get(id1), db.notifications.get(id2)])
      expect(n1?.status).toBe('Delivered')
      expect(n2?.status).toBe('Delivered')
    })
  })

  describe('deliver – failure handling and nextRetryAt persistence', () => {
    it('writes nextRetryAt to IndexedDB on first failure (backoff 30 s)', async () => {
      // Missing template data will cause render() to throw
      const before = Date.now()
      const id = await addNotification({ templateData: {} })
      await notificationService.deliver(id)
      const n = await db.notifications.get(id)
      expect(n?.status).toBe('Pending')
      expect(n?.retries).toBe(1)
      expect(n?.nextRetryAt).toBeGreaterThanOrEqual(before + 30_000)
      expect(n?.nextRetryAt).toBeLessThanOrEqual(before + 35_000) // small buffer
    })

    it('writes nextRetryAt with exponential backoff on second failure (60 s)', async () => {
      const before = Date.now()
      const id = await addNotification({ templateData: {}, retries: 1 })
      await notificationService.deliver(id)
      const n = await db.notifications.get(id)
      expect(n?.retries).toBe(2)
      expect(n?.nextRetryAt).toBeGreaterThanOrEqual(before + 60_000)
    })

    it('marks as Failed after 3rd failure without setting nextRetryAt', async () => {
      const id = await addNotification({ templateData: {}, retries: 2 })
      await notificationService.deliver(id)
      const n = await db.notifications.get(id)
      expect(n?.status).toBe('Failed')
      expect(n?.retries).toBe(3)
      expect(n?.nextRetryAt).toBeUndefined()
    })

    it('does not use window.setTimeout (state is preserved across simulated restart)', async () => {
      // Deliver fails → nextRetryAt is persisted. Simulate restart by calling
      // processRetryQueue with a mock Date.now past the window.
      const id = await addNotification({ templateData: {} })
      await notificationService.deliver(id) // fails → nextRetryAt ~ now+30s, retries=1

      const n = await db.notifications.get(id)
      expect(n?.nextRetryAt).toBeDefined()

      // Fix the template data so next delivery succeeds, and fast-forward the nextRetryAt
      await db.notifications.update(id, {
        templateData: { orderId: '99', dueTime: '5 PM' },
        nextRetryAt: Date.now() - 1,
      })

      // processRetryQueue should pick it up (simulating what App.tsx does on reload)
      await notificationService.processRetryQueue()
      const delivered = await db.notifications.get(id)
      expect(delivered?.status).toBe('Delivered')
    })
  })

  describe('retryFailed', () => {
    it('re-queues Failed notifications with retries < 3 and delivers them', async () => {
      const id = await addNotification({
        templateData: { orderId: '77', dueTime: '2 PM' },
        status: 'Failed',
        retries: 1,
      })
      await notificationService.retryFailed()
      const n = await db.notifications.get(id)
      expect(n?.status).toBe('Delivered')
    })

    it('does not re-queue Failed notifications with retries >= 3', async () => {
      const id = await addNotification({ templateData: {}, status: 'Failed', retries: 3 })
      await notificationService.retryFailed()
      const n = await db.notifications.get(id)
      expect(n?.status).toBe('Failed')
    })

    it('exhausts retries when a re-queued notification keeps failing', async () => {
      // retries=2, bad templateData → one more attempt → retries=3, Failed
      const id = await addNotification({ templateData: {}, status: 'Failed', retries: 2 })
      await notificationService.retryFailed()
      const n = await db.notifications.get(id)
      expect(n?.status).toBe('Failed')
      expect(n?.retries).toBe(3)
    })
  })
})

describe('notificationService – recipient ownership', () => {
  const member = { id: 1, role: 'Member' as const }
  const other = { id: 2, role: 'Member' as const }
  const admin = { id: 99, role: 'Administrator' as const }

  beforeEach(async () => {
    await db.transaction('rw', db.tables, async () => {
      await Promise.all(db.tables.map((t) => t.clear()))
    })
  })

  async function addForMember() {
    return db.notifications.add({
      recipientId: member.id,
      templateKey: 'PICKUP_DUE',
      templateData: { orderId: '1', dueTime: '5 PM' },
      status: 'Delivered',
      isRead: false,
      retries: 0,
      createdAt: Date.now(),
    })
  }

  it('markRead succeeds when actor is the recipient', async () => {
    const id = await addForMember()
    await expect(notificationService.markRead(id, member)).resolves.toBeUndefined()
    const n = await db.notifications.get(id)
    expect(n?.isRead).toBe(true)
  })

  it('markRead throws when actor is not the recipient and not admin', async () => {
    const id = await addForMember()
    await expect(notificationService.markRead(id, other)).rejects.toThrow('Not authorized')
    const n = await db.notifications.get(id)
    expect(n?.isRead).toBe(false)
  })

  it('markRead succeeds for an admin acting on another user notification', async () => {
    const id = await addForMember()
    await expect(notificationService.markRead(id, admin)).resolves.toBeUndefined()
    const n = await db.notifications.get(id)
    expect(n?.isRead).toBe(true)
  })

  it('archive throws when actor is not the recipient and not admin', async () => {
    const id = await addForMember()
    await expect(notificationService.archive(id, other)).rejects.toThrow('Not authorized')
    const n = await db.notifications.get(id)
    expect(n?.status).toBe('Delivered')
  })

  it('archive succeeds when actor is the recipient', async () => {
    const id = await addForMember()
    await expect(notificationService.archive(id, member)).resolves.toBeUndefined()
    const n = await db.notifications.get(id)
    expect(n?.status).toBe('Archived')
  })

  it('deliver with actor throws when actor is not the recipient and not admin', async () => {
    const id = await addForMember()
    await expect(notificationService.deliver(id, other)).rejects.toThrow('Not authorized')
  })

  it('deliver without actor bypasses ownership check (system call)', async () => {
    const id = await addForMember()
    // system-internal call: no actor, must not throw
    await expect(notificationService.deliver(id)).resolves.toBeUndefined()
  })
})
