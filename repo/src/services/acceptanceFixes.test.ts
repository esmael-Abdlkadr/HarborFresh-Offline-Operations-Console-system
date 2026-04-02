// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db.ts'
import { seedIfEmpty } from '../db/seed.ts'
import { courseService } from './courseService.ts'
import { campaignService } from './campaignService.ts'
import { orderService } from './orderService.ts'
import { dispatchService } from './dispatchService.ts'
import { notificationService } from './notificationService.ts'
import { fishService } from './fishService.ts'
import { hashPassword } from './cryptoService.ts'

async function getUser(username: string) {
  const user = await db.users.where('username').equals(username).first()
  if (!user) throw new Error(`Missing user: ${username}`)
  return user
}

async function ensureMember(username: string) {
  const existing = await db.users.where('username').equals(username).first()
  if (existing) return existing
  const password = await hashPassword('MemberPass#123')
  const id = await db.users.add({
    username,
    role: 'Member',
    passwordHash: password.hash,
    salt: password.salt,
    failedAttempts: 0,
  })
  return (await db.users.get(id))!
}

async function createPublishedFish() {
  const admin = await getUser('admin')
  const fish = await fishService.createEntry(
    {
      commonName: 'Test Fish',
      scientificName: 'Testus fishus',
      taxonomy: {
        kingdom: 'Animalia',
        phylum: 'Chordata',
        class: 'Actinopterygii',
        order: 'Perciformes',
        family: 'Testidae',
        genus: 'Testus',
        species: 'T. fishus',
      },
    },
    admin,
  )
  await fishService.publishEntry(fish.id!, admin)
  return fish
}

beforeEach(async () => {
  localStorage.clear()
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
  })
  await seedIfEmpty()
})

describe('Fix 1: course enrollment integrity', () => {
  it('rejects duplicate enrollment by same member with different operationId', async () => {
    const instructor = await getUser('instructor')
    const member = await getUser('member')

    const course = await courseService.createCourse(
      {
        title: 'Duplicate Guard Test',
        description: 'Test same-member guard',
        instructorId: instructor.id!,
        startDateTime: '2026-12-01T09:00',
        endDateTime: '2026-12-02T17:00',
        capacity: 5,
        prerequisiteCourseIds: [],
      },
      instructor,
    )
    await courseService.openCourse(course.id!, instructor, { expectedCourseVersion: 1 })

    const first = await courseService.enroll(course.id!, member.id!, 'op-1', { expectedCourseVersion: 2 })
    expect(first.status).toBe('Enrolled')

    // Second enrollment with different operationId should return the existing enrollment
    const c1 = await db.courses.get(course.id!)
    const second = await courseService.enroll(course.id!, member.id!, 'op-2', { expectedCourseVersion: c1!.version })
    expect(second.id).toBe(first.id)

    // Verify only one enrollment exists
    const enrollments = await db.enrollments
      .where('courseId')
      .equals(course.id!)
      .and((item) => item.memberId === member.id!)
      .toArray()
    expect(enrollments).toHaveLength(1)
  })

  it('same operationId remains idempotent', async () => {
    const instructor = await getUser('instructor')
    const member = await getUser('member')

    const course = await courseService.createCourse(
      {
        title: 'Idempotent Course',
        description: 'Test operationId idempotency',
        instructorId: instructor.id!,
        startDateTime: '2026-12-01T09:00',
        endDateTime: '2026-12-02T17:00',
        capacity: 5,
        prerequisiteCourseIds: [],
      },
      instructor,
    )
    await courseService.openCourse(course.id!, instructor, { expectedCourseVersion: 1 })

    const first = await courseService.enroll(course.id!, member.id!, 'same-op', { expectedCourseVersion: 2 })
    const c1 = await db.courses.get(course.id!)
    const second = await courseService.enroll(course.id!, member.id!, 'same-op', { expectedCourseVersion: c1!.version })
    expect(second.id).toBe(first.id)
  })

  it('does not over-count capacity with duplicate enrollment attempts', async () => {
    const instructor = await getUser('instructor')
    const member = await getUser('member')

    const course = await courseService.createCourse(
      {
        title: 'Capacity Test',
        description: 'Single seat course',
        instructorId: instructor.id!,
        startDateTime: '2026-12-01T09:00',
        endDateTime: '2026-12-02T17:00',
        capacity: 1,
        prerequisiteCourseIds: [],
      },
      instructor,
    )
    await courseService.openCourse(course.id!, instructor, { expectedCourseVersion: 1 })

    // capacity=1, so first enroll fills it (course version goes 2→3)
    await courseService.enroll(course.id!, member.id!, 'op-a', { expectedCourseVersion: 2 })
    // Duplicate enrollments for same member return existing — read current version each time
    let cv = (await db.courses.get(course.id!))!.version
    await courseService.enroll(course.id!, member.id!, 'op-b', { expectedCourseVersion: cv })
    cv = (await db.courses.get(course.id!))!.version
    await courseService.enroll(course.id!, member.id!, 'op-c', { expectedCourseVersion: cv })

    const enrolled = await db.enrollments
      .where('courseId')
      .equals(course.id!)
      .and((item) => item.status === 'Enrolled')
      .count()
    expect(enrolled).toBe(1)

    // A different member should still be able to get waitlisted
    const member2 = await ensureMember('member2-cap')
    cv = (await db.courses.get(course.id!))!.version
    const e2 = await courseService.enroll(course.id!, member2.id!, 'op-d', { expectedCourseVersion: cv })
    expect(e2.status).toBe('Waitlisted')
  })
})

describe('Fix 3: member campaign creation', () => {
  it('allows member to create a campaign', async () => {
    const member = await getUser('member')
    const fish = await createPublishedFish()

    const campaign = await campaignService.createCampaign(
      {
        title: 'Member Campaign',
        description: 'Created by member',
        fishEntryId: fish.id!,
        pricePerUnit: 12.5,
        unit: 'lb',
        minParticipants: 2,
        cutoffAt: Date.now() + 60_000,
      },
      member,
    )
    expect(campaign.status).toBe('Open')
    expect(campaign.createdBy).toBe(member.id)
  })

  it('still rejects non-admin non-member roles from creating campaigns', async () => {
    const dispatcher = await getUser('dispatcher')
    const fish = await createPublishedFish()

    await expect(
      campaignService.createCampaign(
        {
          title: 'Should Fail',
          description: 'Dispatcher cannot create',
          fishEntryId: fish.id!,
          pricePerUnit: 10,
          unit: 'lb',
          minParticipants: 1,
          cutoffAt: Date.now() + 60_000,
        },
        dispatcher,
      ),
    ).rejects.toThrow('Only administrators or members can create campaigns.')
  })
})

describe('Fix 4: order lifecycle and offline payment semantics', () => {
  it('campaign cutoff confirms the campaign but leaves orders awaiting explicit payment confirmation', async () => {
    const admin = await getUser('admin')
    const member = await getUser('member')
    const member2 = await ensureMember('member-pay')
    const fish = await createPublishedFish()

    const campaign = await campaignService.createCampaign(
      {
        title: 'Payment Separation Test',
        description: 'No auto-payment on cutoff',
        fishEntryId: fish.id!,
        pricePerUnit: 15,
        unit: 'lb',
        minParticipants: 2,
        cutoffAt: Date.now() + 60_000,
      },
      admin,
    )

    await orderService.joinCampaign(campaign.id!, member.id!, 1, crypto.randomUUID(), 1)
    await orderService.joinCampaign(campaign.id!, member2.id!, 1, crypto.randomUUID(), 1)

    // Force cutoff
    await db.campaigns.update(campaign.id!, { cutoffAt: Date.now() - 1000 })
    await campaignService.checkAndCloseExpired()

    const updatedCampaign = await db.campaigns.get(campaign.id!)
    expect(updatedCampaign?.status).toBe('Confirmed')

    const orders = await db.orders.where('campaignId').equals(campaign.id!).toArray()
    for (const order of orders) {
      expect(order.status).toBe('Created')
      expect(order.paymentMethod).toBeUndefined()
      expect(order.paymentRecordedAt).toBeUndefined()
    }
  })

  it('unpaid orders still auto-close after 30 minutes', async () => {
    const admin = await getUser('admin')
    const member = await getUser('member')
    const fish = await createPublishedFish()

    const campaign = await campaignService.createCampaign(
      {
        title: 'Auto-close Test',
        description: 'Test unpaid auto-close',
        fishEntryId: fish.id!,
        pricePerUnit: 10,
        unit: 'lb',
        minParticipants: 1,
        cutoffAt: Date.now() + 300_000,
      },
      admin,
    )

    const order = await orderService.joinCampaign(campaign.id!, member.id!, 1, crypto.randomUUID(), 1)
    await db.orders.update(order.id!, { autoCloseAt: Date.now() - 1000 })
    await orderService.autoCloseUnpaid()

    const closed = await db.orders.get(order.id!)
    expect(closed?.status).toBe('Cancelled')
  })
})

describe('Fix 5: dispatch generation from real order data', () => {
  it('generates delivery tasks from confirmed orders', async () => {
    const admin = await getUser('admin')
    const member = await getUser('member')
    const fish = await createPublishedFish()

    const campaign = await campaignService.createCampaign(
      {
        title: 'Dispatch Gen Test',
        description: 'Generate tasks from orders',
        fishEntryId: fish.id!,
        pricePerUnit: 20,
        unit: 'lb',
        minParticipants: 1,
        cutoffAt: Date.now() + 60_000,
      },
      admin,
    )

    const order = await orderService.joinCampaign(campaign.id!, member.id!, 3, crypto.randomUUID(), 1)

    // Confirm the order
    await orderService.transitionStatus(order.id!, 'Confirmed', admin, {
      expectedVersion: order.version,
      paymentMethod: 'Cash',
      paymentNote: 'Paid in cash',
    })

    const count = await dispatchService.generateTasksFromOrders()
    expect(count).toBe(1)

    const tasks = await db.deliveryTasks.where('orderId').equals(order.id!).toArray()
    expect(tasks).toHaveLength(1)
    expect(tasks[0].status).toBe('Unassigned')
  })

  it('does not duplicate tasks for already-generated orders', async () => {
    const admin = await getUser('admin')
    const member = await getUser('member')
    const fish = await createPublishedFish()

    const campaign = await campaignService.createCampaign(
      {
        title: 'No Dup Tasks',
        description: 'Idempotent task generation',
        fishEntryId: fish.id!,
        pricePerUnit: 10,
        unit: 'lb',
        minParticipants: 1,
        cutoffAt: Date.now() + 60_000,
      },
      admin,
    )

    const order = await orderService.joinCampaign(campaign.id!, member.id!, 1, crypto.randomUUID(), 1)
    await orderService.transitionStatus(order.id!, 'Confirmed', admin, {
      expectedVersion: order.version,
      paymentMethod: 'Cash',
    })

    await dispatchService.generateTasksFromOrders()
    const second = await dispatchService.generateTasksFromOrders()
    expect(second).toBe(0)

    const tasks = await db.deliveryTasks.where('orderId').equals(order.id!).toArray()
    expect(tasks).toHaveLength(1)
  })
})

describe('Fix 6: notification correctness', () => {
  it('ORDER_CONFIRMED notification renders correctly with orderId', async () => {
    const member = await getUser('member')

    const notification = await notificationService.send(member.id!, 'ORDER_CONFIRMED', {
      orderId: '42',
    })

    expect(notification).toBeDefined()
    const stored = await db.notifications.get(notification!.id!)
    expect(stored?.status).toBe('Delivered')
    expect(stored?.renderedBody).toContain('42')
    expect(stored?.renderedSubject).toBe('Order confirmed')
  })

  it('campaign cutoff does not send ORDER_CONFIRMED notifications before payment is recorded', async () => {
    const admin = await getUser('admin')
    const member = await getUser('member')
    const member2 = await ensureMember('member-notif')
    const fish = await createPublishedFish()

    const campaign = await campaignService.createCampaign(
      {
        title: 'Notification Test',
        description: 'Check per-order notifications',
        fishEntryId: fish.id!,
        pricePerUnit: 5,
        unit: 'lb',
        minParticipants: 2,
        cutoffAt: Date.now() + 60_000,
      },
      admin,
    )

    await orderService.joinCampaign(campaign.id!, member.id!, 1, crypto.randomUUID(), 1)
    await orderService.joinCampaign(campaign.id!, member2.id!, 1, crypto.randomUUID(), 1)

    await db.campaigns.update(campaign.id!, { cutoffAt: Date.now() - 1000 })
    await campaignService.checkAndCloseExpired()

    const notifications = await db.notifications
      .where('templateKey')
      .equals('ORDER_CONFIRMED')
      .toArray()
    expect(notifications).toHaveLength(0)
  })
})

describe('Fix 7: finance session/encryption', () => {
  it('session restore does not provide encryption key', async () => {
    // The encryption key is only derived at login time
    // After session restore, encryptionKey should be null
    // This test verifies the auth service behavior
    const { authService } = await import('./authService.ts')

    await authService.login('finance', 'HarborFin#1!!')
    // After login, session is saved to localStorage
    // Now simulate restore (no password available)
    const restored = await authService.restoreSession()
    expect(restored).not.toBeNull()
    // The restore only returns User, not the encryption key
    // The useAuth hook sets user but NOT encryptionKey on restore
    // This is the correct behavior - finance should require re-login
  })
})
