// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db.ts'
import { seedTestUsers } from '../db/seed.ts'
import { courseService } from './courseService.ts'
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

describe('course deadline date parsing robustness', () => {
  async function createCourseWithDeadline(dropDeadline: string | undefined) {
    const instructor = await getUser('instructor')
    return courseService.createCourse(
      {
        title: 'Deadline Test',
        description: 'testing deadline parsing',
        instructorId: instructor.id!,
        startDateTime: '2026-12-15T09:00',
        endDateTime: '2026-12-15T17:00',
        dropDeadline,
        capacity: 10,
        prerequisiteCourseIds: [],
      },
      instructor,
    )
  }

  it('accepts valid MM/DD/YYYY HH:mm drop deadline', async () => {
    const course = await createCourseWithDeadline('12/14/2026 23:59')
    expect(course.dropDeadline).toBe('12/14/2026 23:59')
  })

  it('accepts undefined deadline and auto-generates one', async () => {
    const course = await createCourseWithDeadline(undefined)
    expect(course.dropDeadline).toBeTruthy()
    // Auto-generated should be the day before start
    expect(course.dropDeadline).toContain('23:59')
  })

  it('handles ISO datetime-local format in startDateTime for default deadline', async () => {
    const instructor = await getUser('instructor')
    const course = await courseService.createCourse(
      {
        title: 'ISO Start',
        description: 'test',
        instructorId: instructor.id!,
        startDateTime: '2026-06-20T14:00',
        endDateTime: '2026-06-20T18:00',
        capacity: 5,
        prerequisiteCourseIds: [],
      },
      instructor,
    )
    // Default drop deadline should be set (day before start)
    expect(course.dropDeadline).toBeTruthy()
  })

  it('stores and can verify a drop deadline with boundary date 01/01/YYYY', async () => {
    const course = await createCourseWithDeadline('01/01/2027 00:00')
    expect(course.dropDeadline).toBe('01/01/2027 00:00')
  })

  it('stores drop deadline with end-of-month boundary 02/28/YYYY', async () => {
    const course = await createCourseWithDeadline('02/28/2026 12:00')
    expect(course.dropDeadline).toBe('02/28/2026 12:00')
  })

  it('rejects course where start >= end', async () => {
    const instructor = await getUser('instructor')
    await expect(
      courseService.createCourse(
        {
          title: 'Bad Range',
          description: 'test',
          instructorId: instructor.id!,
          startDateTime: '2026-12-15T17:00',
          endDateTime: '2026-12-15T09:00',
          capacity: 10,
          prerequisiteCourseIds: [],
        },
        instructor,
      ),
    ).rejects.toThrow('Course start must be before end.')
  })

  it('rejects course where start equals end', async () => {
    const instructor = await getUser('instructor')
    await expect(
      courseService.createCourse(
        {
          title: 'Same Time',
          description: 'test',
          instructorId: instructor.id!,
          startDateTime: '2026-12-15T09:00',
          endDateTime: '2026-12-15T09:00',
          capacity: 10,
          prerequisiteCourseIds: [],
        },
        instructor,
      ),
    ).rejects.toThrow('Course start must be before end.')
  })
})

describe('course drop deadline — malformed and edge format boundary cases', () => {
  async function createAndVerifyDeadline(dropDeadline: string) {
    const instructor = await getUser('instructor')
    const course = await courseService.createCourse(
      {
        title: `Edge ${dropDeadline}`,
        description: 'edge case test',
        instructorId: instructor.id!,
        startDateTime: '2026-12-15T09:00',
        endDateTime: '2026-12-15T17:00',
        dropDeadline,
        capacity: 10,
        prerequisiteCourseIds: [],
      },
      instructor,
    )
    return course
  }

  it('stores deadline with midnight boundary 00:00', async () => {
    const course = await createAndVerifyDeadline('12/14/2026 00:00')
    expect(course.dropDeadline).toBe('12/14/2026 00:00')
  })

  it('stores deadline with max time 23:59', async () => {
    const course = await createAndVerifyDeadline('12/31/2026 23:59')
    expect(course.dropDeadline).toBe('12/31/2026 23:59')
  })

  it('stores deadline with single-digit month and day padding', async () => {
    const course = await createAndVerifyDeadline('01/05/2027 08:30')
    expect(course.dropDeadline).toBe('01/05/2027 08:30')
  })

  it('stores deadline for leap-year Feb 29', async () => {
    const course = await createAndVerifyDeadline('02/29/2028 12:00')
    expect(course.dropDeadline).toBe('02/29/2028 12:00')
  })

  it('deadline with only date part (no time) is passed through as-is', async () => {
    // The service stores whatever string is passed as dropDeadline
    // The parseUsDateTime function handles missing time gracefully
    const course = await createAndVerifyDeadline('12/14/2026')
    expect(course.dropDeadline).toBe('12/14/2026')
  })

  it('empty string deadline is stored as-is (not auto-generated)', async () => {
    const instructor = await getUser('instructor')
    const course = await courseService.createCourse(
      {
        title: 'Empty Deadline',
        description: 'test',
        instructorId: instructor.id!,
        startDateTime: '2026-12-15T09:00',
        endDateTime: '2026-12-15T17:00',
        dropDeadline: '',
        capacity: 10,
        prerequisiteCourseIds: [],
      },
      instructor,
    )
    // '' is not null/undefined, so ?? does not trigger the fallback
    expect(course.dropDeadline).toBe('')
  })

  it('auto-generated deadline for Jan 1 start wraps to Dec 31 of prior year', async () => {
    const instructor = await getUser('instructor')
    const course = await courseService.createCourse(
      {
        title: 'New Year Course',
        description: 'test',
        instructorId: instructor.id!,
        startDateTime: '2027-01-01T09:00',
        endDateTime: '2027-01-01T17:00',
        capacity: 10,
        prerequisiteCourseIds: [],
      },
      instructor,
    )
    // Default deadline is day before start: 12/31/2026
    expect(course.dropDeadline).toContain('12/31/2026')
    expect(course.dropDeadline).toContain('23:59')
  })
})
