import { db } from '../db/db.ts'
import type { Notification, NotificationTemplate, UserRole } from '../types/index.ts'

const TEMPLATES: Record<NotificationTemplate, { subject: string; body: string }> = {
  FISH_REVIEW_REQUESTED: { subject: 'Fish review requested', body: 'A fish entry is ready for review.' },
  FISH_APPROVED: { subject: 'Fish approved', body: 'Your fish entry {{fishName}} was approved.' },
  FISH_REJECTED: { subject: 'Fish rejected', body: 'Your fish entry {{fishName}} was rejected: {{reason}}.' },
  ORDER_AUTO_CLOSED: {
    subject: 'Order closed',
    body: 'Order #{{orderId}} was auto-closed due to no payment within 30 minutes.',
  },
  ORDER_CONFIRMED: { subject: 'Order confirmed', body: 'Order #{{orderId}} has been confirmed.' },
  CAMPAIGN_CANCELLED: { subject: 'Campaign cancelled', body: 'Campaign {{campaignTitle}} was cancelled.' },
  PICKUP_DUE: { subject: 'Pickup reminder', body: 'Your order #{{orderId}} is ready by {{dueTime}}.' },
  HOLD_AVAILABLE: { subject: 'Hold available', body: 'A hold for {{itemName}} is available.' },
  ORDER_OVERDUE: { subject: 'Order overdue', body: 'Order #{{orderId}} is overdue.' },
  FEE_CHANGED: { subject: 'Fee update', body: 'Fee for {{courseTitle}} changed to {{newFee}}.' },
  COURSE_ENROLLED: {
    subject: 'Enrollment confirmed',
    body: 'You have been enrolled in {{courseTitle}}.',
  },
  COURSE_WAITLISTED: {
    subject: 'Added to waitlist',
    body: 'You are on the waitlist (position {{position}}) for {{courseTitle}}.',
  },
  COURSE_DROPPED: {
    subject: 'Enrollment dropped',
    body: 'Your enrollment in {{courseTitle}} has been dropped.',
  },
  COURSE_WAITLIST_PROMOTED: {
    subject: "You're in!",
    body: 'Your waitlist position for {{courseTitle}} was promoted to Enrolled.',
  },
}

function render(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = data[key]
    if (value === undefined) {
      throw new Error(`Missing template value: ${key}`)
    }
    return value
  })
}

async function createNotification(
  recipientId: number,
  templateKey: NotificationTemplate,
  templateData: Record<string, string>,
): Promise<Notification> {
  const now = Date.now()
  const notification: Notification = {
    recipientId,
    templateKey,
    templateData,
    status: 'Pending',
    isRead: false,
    retries: 0,
    createdAt: now,
  }
  const id = await db.notifications.add(notification)
  return { ...notification, id }
}

export const notificationService = {
  async send(
    arg1: number | NotificationTemplate,
    arg2: NotificationTemplate | number[],
    arg3: Record<string, string> = {},
  ): Promise<Notification | void> {
    if (typeof arg1 === 'number') {
      const notification = await createNotification(arg1, arg2 as NotificationTemplate, arg3)
      if (notification.id) {
        await this.deliver(notification.id)
      }
      return notification
    }

    const templateKey = arg1
    const recipientIds = arg2 as number[]
    await Promise.all(recipientIds.map((recipientId) => this.send(recipientId, templateKey, arg3)))
  },

  async sendToRoles(templateKey: NotificationTemplate, roles: UserRole[], templateData: Record<string, string> = {}) {
    const users = await db.users.where('role').anyOf(roles).toArray()
    await Promise.all(
      users
        .filter((user) => user.id)
        .map((user) => this.send(user.id!, templateKey, templateData)),
    )
  },

  async deliver(notificationId: number, actor?: { id?: number; role: UserRole }): Promise<void> {
    const notification = await db.notifications.get(notificationId)
    if (!notification) {
      return
    }

    if (actor && actor.role !== 'Administrator' && (!actor.id || notification.recipientId !== actor.id)) {
      throw new Error('Not authorized to retry this notification.')
    }

    try {
      const template = TEMPLATES[notification.templateKey]
      const renderedSubject = render(template.subject, notification.templateData)
      const renderedBody = render(template.body, notification.templateData)
      await db.notifications.update(notificationId, {
        renderedSubject,
        renderedBody,
        status: 'Delivered',
        lastAttemptAt: Date.now(),
        nextRetryAt: undefined,
      })
    } catch {
      const retries = notification.retries + 1
      const now = Date.now()
      if (retries < 3) {
        // Persist retry eligibility in IndexedDB — survives refresh/restart.
        // Backoff: 30s, 60s, 120s.
        const backoffMs = 30_000 * Math.pow(2, retries - 1)
        await db.notifications.update(notificationId, {
          retries,
          lastAttemptAt: now,
          status: 'Pending',
          nextRetryAt: now + backoffMs,
        })
      } else {
        await db.notifications.update(notificationId, {
          retries,
          lastAttemptAt: now,
          status: 'Failed',
          nextRetryAt: undefined,
        })
      }
    }
  },

  /** Process all Pending notifications whose nextRetryAt is due (or unset). Safe to call on startup. */
  async processRetryQueue(): Promise<void> {
    const now = Date.now()
    const pending = await db.notifications.where('status').equals('Pending').toArray()
    for (const item of pending) {
      if (item.id && (!item.nextRetryAt || item.nextRetryAt <= now)) {
        await this.deliver(item.id)
      }
    }
  },

  /**
   * Re-queue any Failed notifications that still have retries remaining, then
   * process the full pending queue. Handles both new-style Pending records and
   * any legacy Failed records that were not yet exhausted (e.g. from pre-v6 data).
   */
  async retryFailed(): Promise<void> {
    const retriable = await db.notifications
      .where('status').equals('Failed')
      .and((item) => item.retries < 3)
      .toArray()
    for (const item of retriable) {
      if (item.id) {
        await db.notifications.update(item.id, { status: 'Pending', nextRetryAt: undefined })
      }
    }
    await this.processRetryQueue()
  },

  async markRead(notificationId: number, actor: { id?: number; role: UserRole }): Promise<void> {
    const notification = await db.notifications.get(notificationId)
    if (!notification) return
    if (actor.role !== 'Administrator' && (!actor.id || notification.recipientId !== actor.id)) {
      throw new Error('Not authorized to update this notification.')
    }
    await db.notifications.update(notificationId, { isRead: true })
  },

  async archive(notificationId: number, actor: { id?: number; role: UserRole }): Promise<void> {
    const notification = await db.notifications.get(notificationId)
    if (!notification) return
    if (actor.role !== 'Administrator' && (!actor.id || notification.recipientId !== actor.id)) {
      throw new Error('Not authorized to update this notification.')
    }
    await db.notifications.update(notificationId, { status: 'Archived' })
  },
}

export { TEMPLATES }
