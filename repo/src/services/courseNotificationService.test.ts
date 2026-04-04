// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db.ts'
import { seedIfEmpty } from '../db/seed.ts'
import { courseService, EnrollmentError } from './courseService.ts'
import { hashPassword } from './cryptoService.ts'
import { notificationService } from './notificationService.ts'

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

beforeEach(async () => {
  localStorage.clear()
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
  })
  await seedIfEmpty()
})

describe('course and notification flow', () => {
  it('enrolls member and sends COURSE_ENROLLED notification', async () => {
    const instructor = await getUser('instructor')
    const member = await getUser('member')

    const course = await courseService.createCourse(
      {
        title: 'Cold Chain Basics',
        description: 'Handling temperature-sensitive seafood',
        instructorId: instructor.id!,
        startDateTime: '2026-12-20T09:00',
        endDateTime: '2026-12-22T17:00',
        capacity: 2,
        prerequisiteCourseIds: [],
      },
      instructor,
    )
    await courseService.openCourse(course.id!, instructor, { expectedCourseVersion: 1 })

    const enrollment = await courseService.enroll(course.id!, member.id!, member, 'op-course-1', { expectedCourseVersion: 2 })
    expect(enrollment.status).toBe('Enrolled')

    const inbox = await db.notifications.where('recipientId').equals(member.id!).toArray()
    expect(inbox.some((item) => item.templateKey === 'COURSE_ENROLLED')).toBe(true)
  })

  it('waitlists member when course is full with correct position', async () => {
    const instructor = await getUser('instructor')
    const member = await getUser('member')
    const member2 = await ensureMember('member2')

    const course = await courseService.createCourse(
      {
        title: 'Boat Safety',
        description: 'Deck operations safety',
        instructorId: instructor.id!,
        startDateTime: '2026-11-10T09:00',
        endDateTime: '2026-11-11T17:00',
        capacity: 1,
        prerequisiteCourseIds: [],
      },
      instructor,
    )
    await courseService.openCourse(course.id!, instructor, { expectedCourseVersion: 1 })

    // capacity=1: first enroll fills course (version 2→3)
    await courseService.enroll(course.id!, member.id!, member, 'op-course-2', { expectedCourseVersion: 2 })
    // Course is now Full (version 3); second member gets waitlisted
    const waitlisted = await courseService.enroll(course.id!, member2.id!, member2, 'op-course-3', { expectedCourseVersion: 3 })
    expect(waitlisted.status).toBe('Waitlisted')
    expect(waitlisted.waitlistPosition).toBe(1)
  })

  it('drop before deadline promotes next waitlisted member', async () => {
    const instructor = await getUser('instructor')
    const member = await getUser('member')
    const member2 = await ensureMember('member3')

    const course = await courseService.createCourse(
      {
        title: 'Dock Crane Ops',
        description: 'Equipment handling',
        instructorId: instructor.id!,
        startDateTime: '2026-12-30T09:00',
        endDateTime: '2026-12-31T17:00',
        dropDeadline: '12/29/2026 23:59',
        capacity: 1,
        prerequisiteCourseIds: [],
      },
      instructor,
    )
    await courseService.openCourse(course.id!, instructor, { expectedCourseVersion: 1 })

    // capacity=1: first enroll fills course (version 2→3)
    const e1 = await courseService.enroll(course.id!, member.id!, member, 'op-course-4', { expectedCourseVersion: 2 })
    await courseService.enroll(course.id!, member2.id!, member2, 'op-course-5', { expectedCourseVersion: 3 })
    // Drop e1: need current course version and enrollment version
    const cBeforeDrop = await db.courses.get(course.id!)
    await courseService.drop(e1.id!, member, 'Cannot attend', { expectedEnrollmentVersion: e1.version, expectedCourseVersion: cBeforeDrop!.version })

    const promoted = await db.enrollments
      .where('courseId')
      .equals(course.id!)
      .and((item) => item.memberId === member2.id)
      .first()
    expect(promoted?.status).toBe('Enrolled')
  })

  it('rejects drop after deadline and returns error', async () => {
    const instructor = await getUser('instructor')
    const member = await getUser('member')

    const course = await courseService.createCourse(
      {
        title: 'Old Course',
        description: 'Already in progress',
        instructorId: instructor.id!,
        startDateTime: '2025-01-01T09:00',
        endDateTime: '2025-01-02T17:00',
        dropDeadline: '01/01/2025 00:01',
        capacity: 5,
        prerequisiteCourseIds: [],
      },
      instructor,
    )
    await courseService.openCourse(course.id!, instructor, { expectedCourseVersion: 1 })
    const enrollment = await courseService.enroll(course.id!, member.id!, member, 'op-course-6', { expectedCourseVersion: 2 })

    const cDrop = await db.courses.get(course.id!)
    await expect(courseService.drop(enrollment.id!, member, 'Too late drop', { expectedEnrollmentVersion: enrollment.version, expectedCourseVersion: cDrop!.version })).rejects.toBeInstanceOf(
      EnrollmentError,
    )
    await expect(courseService.drop(enrollment.id!, member, 'Too late drop', { expectedEnrollmentVersion: enrollment.version, expectedCourseVersion: cDrop!.version })).rejects.toMatchObject({
      code: 'ENROLL_DROP_DEADLINE_PASSED',
    })
  })

  it('fails enrollment when prerequisites missing and returns missing list', async () => {
    const instructor = await getUser('instructor')
    const member = await getUser('member')

    const prereq = await courseService.createCourse(
      {
        title: 'Intro Prep',
        description: 'Required foundation',
        instructorId: instructor.id!,
        startDateTime: '2026-09-01T09:00',
        endDateTime: '2026-09-02T17:00',
        capacity: 10,
        prerequisiteCourseIds: [],
      },
      instructor,
    )
    const advanced = await courseService.createCourse(
      {
        title: 'Advanced Handling',
        description: 'Requires intro',
        instructorId: instructor.id!,
        startDateTime: '2026-10-01T09:00',
        endDateTime: '2026-10-02T17:00',
        capacity: 10,
        prerequisiteCourseIds: [prereq.id!],
      },
      instructor,
    )
    await courseService.openCourse(advanced.id!, instructor, { expectedCourseVersion: 1 })

    await expect(courseService.enroll(advanced.id!, member.id!, member, 'op-course-7', { expectedCourseVersion: 2 })).rejects.toMatchObject({
      code: 'ENROLL_PREREQ_NOT_MET',
      missingCourses: [prereq.id!],
    })
  })

  it('returns first enrollment for duplicate operationId', async () => {
    const instructor = await getUser('instructor')
    const member = await getUser('member')
    const course = await courseService.createCourse(
      {
        title: 'Idempotency Course',
        description: 'Test operation idempotency',
        instructorId: instructor.id!,
        startDateTime: '2026-12-01T09:00',
        endDateTime: '2026-12-02T17:00',
        capacity: 5,
        prerequisiteCourseIds: [],
      },
      instructor,
    )
    await courseService.openCourse(course.id!, instructor, { expectedCourseVersion: 1 })

    const first = await courseService.enroll(course.id!, member.id!, member, 'same-op-id', { expectedCourseVersion: 2 })
    const c1 = await db.courses.get(course.id!)
    const second = await courseService.enroll(course.id!, member.id!, member, 'same-op-id', { expectedCourseVersion: c1!.version })
    expect(second.id).toBe(first.id)
  })

  it('rejects stale course versions during enrollment and stale enrollment versions during drop', async () => {
    const instructor = await getUser('instructor')
    const member = await getUser('member')
    const course = await courseService.createCourse(
      {
        title: 'Versioned Course',
        description: 'Optimistic locking coverage',
        instructorId: instructor.id!,
        startDateTime: '2026-12-10T09:00',
        endDateTime: '2026-12-11T17:00',
        capacity: 2,
        prerequisiteCourseIds: [],
      },
      instructor,
    )
    await courseService.openCourse(course.id!, instructor, { expectedCourseVersion: 1 })

    const opened = await db.courses.get(course.id!)
    await db.courses.update(course.id!, { version: (opened?.version ?? 0) + 1 })

    await expect(
      courseService.enroll(course.id!, member.id!, member, 'stale-course-version', {
        expectedCourseVersion: opened!.version,
      }),
    ).rejects.toMatchObject({ code: 'ENROLL_VERSION_CONFLICT' })

    const freshCourse = await db.courses.get(course.id!)
    const enrollment = await courseService.enroll(course.id!, member.id!, member, 'fresh-version', {
      expectedCourseVersion: freshCourse!.version,
    })

    await db.enrollments.update(enrollment.id!, { version: enrollment.version + 1 })
    const courseForDrop = await db.courses.get(course.id!)
    await expect(
      courseService.drop(enrollment.id!, member, 'Version drift check', {
        expectedEnrollmentVersion: enrollment.version,
        expectedCourseVersion: courseForDrop!.version,
      }),
    ).rejects.toMatchObject({ code: 'ENROLL_VERSION_CONFLICT' })
  })

  it('notification retries up to 3 and then stays failed', async () => {
    const member = await getUser('member')
    const id = await db.notifications.add({
      recipientId: member.id!,
      templateKey: 'COURSE_ENROLLED',
      templateData: {},
      status: 'Failed',
      isRead: false,
      retries: 2,
      createdAt: Date.now(),
    })

    await notificationService.retryFailed()
    const failed = await db.notifications.get(id)
    expect(failed?.status).toBe('Failed')
    expect(failed?.retries).toBe(3)
  })

  it('read and archive state persists after refresh query', async () => {
    const member = await getUser('member')
    const created = (await notificationService.send(member.id!, 'PICKUP_DUE', {
      orderId: '123',
      dueTime: '5 PM',
    })) as { id: number }

    await notificationService.markRead(created.id, member)
    await notificationService.archive(created.id, member)

    const stored = await db.notifications.get(created.id)
    expect(stored?.isRead).toBe(true)
    expect(stored?.status).toBe('Archived')
  })
})
