// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db/db.ts'
import { notificationService } from '../../services/notificationService.ts'
import type { User } from '../../types/index.ts'

async function clearDb() {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })
}

async function makeUser(overrides: Partial<User> = {}): Promise<User & { id: number }> {
  const user: User = {
    username: `user_${Math.random().toString(36).slice(2, 6)}`,
    passwordHash: 'fakehash',
    salt: 'fakesalt',
    role: 'Member',
    failedAttempts: 0,
    ...overrides,
  }
  const id = await db.users.add(user)
  return { ...user, id }
}

describe('notificationService', () => {
  beforeEach(async () => {
    await clearDb()
  })
  afterEach(async () => {
    await clearDb()
  })

  it('send creates notification with correct fields', async () => {
    const notification = await notificationService.send(10, 'ORDER_CONFIRMED', { orderId: '42' })
    expect(notification).toBeTruthy()
    const n = notification as { id: number; recipientId: number; templateKey: string; status: string }
    expect(n.recipientId).toBe(10)
    expect(n.templateKey).toBe('ORDER_CONFIRMED')
    // After send, deliver is called so status should be Delivered
    const stored = await db.notifications.get(n.id)
    expect(stored?.status).toBe('Delivered')
  })

  it('send delivers notification (sets status to Delivered)', async () => {
    const result = await notificationService.send(5, 'ORDER_CONFIRMED', { orderId: '99' })
    const n = result as { id: number }
    const stored = await db.notifications.get(n.id)
    expect(stored?.status).toBe('Delivered')
    expect(stored?.renderedSubject).toBeTruthy()
    expect(stored?.renderedBody).toContain('99')
  })

  it('getInbox returns notifications for recipient', async () => {
    await notificationService.send(7, 'ORDER_CONFIRMED', { orderId: '1' })
    await notificationService.send(7, 'ORDER_CONFIRMED', { orderId: '2' })
    await notificationService.send(8, 'ORDER_CONFIRMED', { orderId: '3' }) // different recipient

    const inbox = await notificationService.getInbox({ id: 7, role: 'Member' })
    expect(inbox.length).toBe(2)
    expect(inbox.every((n) => n.recipientId === 7)).toBe(true)
  })

  it('getInbox admin sees all notifications', async () => {
    await notificationService.send(7, 'ORDER_CONFIRMED', { orderId: '1' })
    await notificationService.send(8, 'ORDER_CONFIRMED', { orderId: '2' })
    await notificationService.send(9, 'ORDER_CONFIRMED', { orderId: '3' })

    const inbox = await notificationService.getInbox({ id: 1, role: 'Administrator' })
    expect(inbox.length).toBe(3)
  })

  it('markRead sets isRead=true', async () => {
    const result = await notificationService.send(12, 'ORDER_CONFIRMED', { orderId: '5' })
    const n = result as { id: number }

    let stored = await db.notifications.get(n.id)
    expect(stored?.isRead).toBe(false)

    await notificationService.markRead(n.id, { id: 12, role: 'Member' })
    stored = await db.notifications.get(n.id)
    expect(stored?.isRead).toBe(true)
  })

  it('sendToRoles sends to all users with given roles', async () => {
    const admin = await makeUser({ role: 'Administrator' })
    const dispatcher = await makeUser({ role: 'Dispatcher' })
    await makeUser({ role: 'Member' }) // should not receive

    await notificationService.sendToRoles('ORDER_CONFIRMED', ['Administrator', 'Dispatcher'], { orderId: '10' })

    const adminNotes = await db.notifications.where('recipientId').equals(admin.id).toArray()
    const dispatchNotes = await db.notifications.where('recipientId').equals(dispatcher.id).toArray()
    expect(adminNotes.length).toBeGreaterThanOrEqual(1)
    expect(dispatchNotes.length).toBeGreaterThanOrEqual(1)
  })

  it('deliver fails for non-owner non-admin (throws)', async () => {
    const result = await notificationService.send(20, 'ORDER_CONFIRMED', { orderId: '7' })
    const n = result as { id: number }

    // A different user (id: 99) who is not admin and not the recipient should fail
    await expect(
      notificationService.deliver(n.id, { id: 99, role: 'Member' }),
    ).rejects.toThrow(/not authorized/i)
  })
})
