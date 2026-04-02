// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db.ts'
import { seedIfEmpty } from '../db/seed.ts'
import { courseService } from './courseService.ts'

async function getUser(username: string) {
  const user = await db.users.where('username').equals(username).first()
  if (!user) throw new Error(`Missing user: ${username}`)
  return user
}

beforeEach(async () => {
  localStorage.clear()
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
  })
  await seedIfEmpty()
})

describe('Course date-time windows', () => {
  it('creates a course with explicit start and end datetime', async () => {
    const instructor = await getUser('instructor')
    const course = await courseService.createCourse(
      {
        title: 'Knife Skills',
        description: 'Filleting fish safely',
        instructorId: instructor.id!,
        startDateTime: '2026-09-01T09:00',
        endDateTime: '2026-09-01T17:00',
        capacity: 5,
        prerequisiteCourseIds: [],
      },
      instructor,
    )
    expect(course.startDateTime).toBe('2026-09-01T09:00')
    expect(course.endDateTime).toBe('2026-09-01T17:00')
  })

  it('stores full ISO datetime strings (not date-only)', async () => {
    const instructor = await getUser('instructor')
    const course = await courseService.createCourse(
      {
        title: 'Ice Handling',
        description: 'Proper ice packing procedures',
        instructorId: instructor.id!,
        startDateTime: '2026-11-15T08:30',
        endDateTime: '2026-11-15T12:30',
        capacity: 10,
        prerequisiteCourseIds: [],
      },
      instructor,
    )
    const saved = await db.courses.get(course.id!)
    expect(saved?.startDateTime).toMatch(/T/)
    expect(saved?.endDateTime).toMatch(/T/)
    expect(saved?.startDateTime).toBe('2026-11-15T08:30')
    expect(saved?.endDateTime).toBe('2026-11-15T12:30')
  })

  it('rejects a course when start is not before end', async () => {
    const instructor = await getUser('instructor')
    await expect(
      courseService.createCourse(
        {
          title: 'Bad Schedule',
          description: 'Start after end',
          instructorId: instructor.id!,
          startDateTime: '2026-09-02T10:00',
          endDateTime: '2026-09-01T10:00',
          capacity: 5,
          prerequisiteCourseIds: [],
        },
        instructor,
      ),
    ).rejects.toThrow('start must be before end')
  })

  it('rejects when start equals end', async () => {
    const instructor = await getUser('instructor')
    await expect(
      courseService.createCourse(
        {
          title: 'Zero Duration',
          description: 'Same start and end',
          instructorId: instructor.id!,
          startDateTime: '2026-09-01T09:00',
          endDateTime: '2026-09-01T09:00',
          capacity: 5,
          prerequisiteCourseIds: [],
        },
        instructor,
      ),
    ).rejects.toThrow('start must be before end')
  })

  it('auto-generates dropDeadline one day before startDateTime', async () => {
    const instructor = await getUser('instructor')
    const course = await courseService.createCourse(
      {
        title: 'Trawl Net Basics',
        description: 'Net handling techniques',
        instructorId: instructor.id!,
        startDateTime: '2026-10-05T09:00',
        endDateTime: '2026-10-05T17:00',
        capacity: 8,
        prerequisiteCourseIds: [],
      },
      instructor,
    )
    // Drop deadline should be one day before start: 10/04/2026 23:59
    expect(course.dropDeadline).toMatch(/10\/04\/2026/)
  })
})
