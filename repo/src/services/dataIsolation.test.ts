// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db.ts'
import { notificationService } from './notificationService.ts'
import { orderService } from './orderService.ts'
import { courseService } from './courseService.ts'
import { userService } from './userService.ts'
import { hashPassword } from './cryptoService.ts'
import type { User, UserRole } from '../types/index.ts'

async function createUser(username: string, role: UserRole): Promise<User> {
  const { hash, salt } = await hashPassword('TestPassword#1!')
  const id = await db.users.add({
    username,
    role,
    passwordHash: hash,
    salt,
    failedAttempts: 0,
  })
  return (await db.users.get(id))!
}

beforeEach(async () => {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })
})

describe('data isolation — notifications', () => {
  it('non-admin getInbox returns only own notifications', async () => {
    const alice = await createUser('alice', 'Member')
    const bob = await createUser('bob', 'Member')

    await notificationService.send(alice.id!, 'PICKUP_DUE', { orderId: '1', dueTime: '3 PM' })
    await notificationService.send(bob.id!, 'PICKUP_DUE', { orderId: '2', dueTime: '4 PM' })
    await notificationService.send(alice.id!, 'ORDER_CONFIRMED', { orderId: '3' })

    const aliceInbox = await notificationService.getInbox(alice)
    expect(aliceInbox.length).toBe(2)
    expect(aliceInbox.every((n) => n.recipientId === alice.id)).toBe(true)

    const bobInbox = await notificationService.getInbox(bob)
    expect(bobInbox.length).toBe(1)
    expect(bobInbox[0].recipientId).toBe(bob.id)
  })

  it('admin getInbox returns all notifications', async () => {
    const admin = await createUser('admin', 'Administrator')
    const member = await createUser('member', 'Member')

    await notificationService.send(member.id!, 'PICKUP_DUE', { orderId: '1', dueTime: '3 PM' })
    await notificationService.send(admin.id!, 'PICKUP_DUE', { orderId: '2', dueTime: '4 PM' })

    const inbox = await notificationService.getInbox(admin)
    expect(inbox.length).toBe(2)
  })
})

describe('data isolation — campaign orders', () => {
  async function createCampaign() {
    return db.campaigns.add({
      title: 'Test Campaign',
      description: 'test',
      fishEntryId: 1,
      pricePerUnit: 10,
      unit: 'lb',
      status: 'Open',
      cutoffAt: Date.now() + 60_000,
      minParticipants: 1,
      createdBy: 1,
      createdAt: Date.now(),
      version: 1,
    })
  }

  it('non-admin getCampaignOrders returns only own orders', async () => {
    const alice = await createUser('alice', 'Member')
    const bob = await createUser('bob', 'Member')
    const campaignId = await createCampaign()

    await orderService.joinCampaign(campaignId, alice.id!, alice, 1, crypto.randomUUID(), 1)
    await orderService.joinCampaign(campaignId, bob.id!, bob, 2, crypto.randomUUID(), 1)

    const aliceOrders = await orderService.getCampaignOrders(campaignId, alice)
    expect(aliceOrders.length).toBe(1)
    expect(aliceOrders[0].memberId).toBe(alice.id)

    const bobOrders = await orderService.getCampaignOrders(campaignId, bob)
    expect(bobOrders.length).toBe(1)
    expect(bobOrders[0].memberId).toBe(bob.id)
  })

  it('admin getCampaignOrders returns all orders', async () => {
    const admin = await createUser('admin', 'Administrator')
    const alice = await createUser('alice', 'Member')
    const bob = await createUser('bob', 'Member')
    const campaignId = await createCampaign()

    await orderService.joinCampaign(campaignId, alice.id!, alice, 1, crypto.randomUUID(), 1)
    await orderService.joinCampaign(campaignId, bob.id!, bob, 2, crypto.randomUUID(), 1)

    const adminOrders = await orderService.getCampaignOrders(campaignId, admin)
    expect(adminOrders.length).toBe(2)
  })
})

describe('data isolation — course enrollments', () => {
  async function createOpenCourse(instructorId: number) {
    const course = await courseService.createCourse(
      {
        title: 'Test Course',
        description: 'test',
        instructorId,
        startDateTime: '2026-12-01T09:00',
        endDateTime: '2026-12-01T17:00',
        capacity: 10,
        prerequisiteCourseIds: [],
      },
      { id: instructorId, role: 'Instructor', username: 'inst', passwordHash: '', salt: '', failedAttempts: 0 } as User,
    )
    await courseService.openCourse(course.id!, { id: instructorId, role: 'Instructor', username: 'inst', passwordHash: '', salt: '', failedAttempts: 0 } as User, {
      expectedCourseVersion: course.version,
    })
    return course
  }

  it('member getEnrollments returns only own enrollment', async () => {
    const instructor = await createUser('instructor', 'Instructor')
    const alice = await createUser('alice', 'Member')
    const bob = await createUser('bob', 'Member')
    const course = await createOpenCourse(instructor.id!)

    await courseService.enroll(course.id!, alice.id!, alice, 'op-a', { expectedCourseVersion: 2 })
    await courseService.enroll(course.id!, bob.id!, bob, 'op-b', { expectedCourseVersion: 2 })

    const aliceEnrollments = await courseService.getEnrollments(course.id!, alice)
    expect(aliceEnrollments.length).toBe(1)
    expect(aliceEnrollments[0].memberId).toBe(alice.id)

    const bobEnrollments = await courseService.getEnrollments(course.id!, bob)
    expect(bobEnrollments.length).toBe(1)
    expect(bobEnrollments[0].memberId).toBe(bob.id)
  })

  it('instructor getEnrollments returns all enrollments', async () => {
    const instructor = await createUser('instructor', 'Instructor')
    const alice = await createUser('alice', 'Member')
    const bob = await createUser('bob', 'Member')
    const course = await createOpenCourse(instructor.id!)

    await courseService.enroll(course.id!, alice.id!, alice, 'op-a', { expectedCourseVersion: 2 })
    await courseService.enroll(course.id!, bob.id!, bob, 'op-b', { expectedCourseVersion: 2 })

    const instructorEnrollments = await courseService.getEnrollments(course.id!, instructor)
    expect(instructorEnrollments.length).toBe(2)
  })

  it('admin getEnrollments returns all enrollments', async () => {
    const admin = await createUser('admin', 'Administrator')
    const instructor = await createUser('instructor', 'Instructor')
    const alice = await createUser('alice', 'Member')
    const course = await createOpenCourse(instructor.id!)

    await courseService.enroll(course.id!, alice.id!, alice, 'op-a', { expectedCourseVersion: 2 })

    const adminEnrollments = await courseService.getEnrollments(course.id!, admin)
    expect(adminEnrollments.length).toBe(1)
  })
})

describe('data isolation — getUsernames', () => {
  it('returns only requested user IDs', async () => {
    const alice = await createUser('alice', 'Member')
    const bob = await createUser('bob', 'Member')
    await createUser('charlie', 'Member')

    const map = await userService.getUsernames([alice.id!, bob.id!])
    expect(map.size).toBe(2)
    expect(map.get(alice.id!)).toBe('alice')
    expect(map.get(bob.id!)).toBe('bob')
  })

  it('returns empty map for empty input', async () => {
    await createUser('alice', 'Member')
    const map = await userService.getUsernames([])
    expect(map.size).toBe(0)
  })
})
