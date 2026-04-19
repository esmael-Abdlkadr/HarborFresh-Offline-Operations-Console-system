// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db/db.ts'
import { courseService } from '../../services/courseService.ts'
import type { Course, User } from '../../types/index.ts'

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

async function makeCourse(overrides: Partial<Course> = {}): Promise<Course & { id: number }> {
  const course: Course = {
    title: 'Test Course',
    description: 'A test course',
    instructorId: 1,
    startDateTime: '2027-01-15T09:00',
    endDateTime: '2027-01-15T17:00',
    dropDeadline: '01/14/2027 23:59',
    capacity: 20,
    prerequisiteCourseIds: [],
    status: 'Open',
    version: 1,
    ...overrides,
  }
  const id = await db.courses.add(course)
  return { ...course, id }
}

describe('courseService', () => {
  beforeEach(async () => {
    await clearDb()
  })
  afterEach(async () => {
    await clearDb()
  })

  it('listCourses returns all courses for authenticated user', async () => {
    const instructor = await makeUser({ role: 'Instructor' })
    await db.courses.bulkAdd([
      { title: 'Course A', description: '', instructorId: instructor.id, startDateTime: '2027-01-15T09:00', endDateTime: '2027-01-15T17:00', dropDeadline: '01/14/2027 23:59', capacity: 10, prerequisiteCourseIds: [], status: 'Open', version: 1 },
      { title: 'Course B', description: '', instructorId: instructor.id, startDateTime: '2027-02-10T09:00', endDateTime: '2027-02-10T17:00', dropDeadline: '02/09/2027 23:59', capacity: 15, prerequisiteCourseIds: [], status: 'Draft', version: 1 },
    ])

    const courses = await courseService.listCourses(instructor)
    expect(courses.length).toBe(2)
  })

  it('getCourse returns course by id', async () => {
    const instructor = await makeUser({ role: 'Instructor' })
    const course = await makeCourse({ title: 'Specific Course' })

    const result = await courseService.getCourse(course.id, instructor)
    expect(result).toBeTruthy()
    expect(result?.title).toBe('Specific Course')
  })

  it('createCourse creates course for Instructor', async () => {
    const instructor = await makeUser({ role: 'Instructor' })

    const course = await courseService.createCourse(
      {
        title: 'Fish Taxonomy 101',
        description: 'Learn taxonomy',
        instructorId: instructor.id,
        startDateTime: '2027-03-01T09:00',
        endDateTime: '2027-03-01T17:00',
        capacity: 25,
        prerequisiteCourseIds: [],
      },
      instructor,
    )

    expect(course.id).toBeTruthy()
    expect(course.title).toBe('Fish Taxonomy 101')
    expect(course.status).toBe('Draft')
    expect(course.version).toBe(1)
  })

  it('createCourse throws for non-instructor non-admin role', async () => {
    const member = await makeUser({ role: 'Member' })

    await expect(
      courseService.createCourse(
        { title: 'Unauthorized', description: '', instructorId: 1, startDateTime: '2027-03-01T09:00', endDateTime: '2027-03-01T17:00', capacity: 10, prerequisiteCourseIds: [] },
        member,
      ),
    ).rejects.toThrow(/only instructors or administrators/i)
  })

  it('enroll adds enrollment for member', async () => {
    const member = await makeUser({ role: 'Member' })
    const course = await makeCourse({ status: 'Open', capacity: 10 })

    const enrollment = await courseService.enroll(course.id, member.id, member, crypto.randomUUID(), { expectedCourseVersion: course.version })

    expect(enrollment.id).toBeTruthy()
    expect(enrollment.memberId).toBe(member.id)
    expect(enrollment.status).toBe('Enrolled')
  })

  it('enroll places on waitlist when course full', async () => {
    const instructor = await makeUser({ role: 'Instructor' })
    const member1 = await makeUser({ role: 'Member' })
    const member2 = await makeUser({ role: 'Member' })

    // Create a course with capacity 1
    const course = await makeCourse({ status: 'Open', capacity: 1, instructorId: instructor.id })

    // First enrollment fills the course
    await courseService.enroll(course.id, member1.id, member1, crypto.randomUUID(), { expectedCourseVersion: 1 })

    // Second enrollment should go to waitlist (course is now Full at version 2)
    const updatedCourse = await db.courses.get(course.id)
    const enrollment2 = await courseService.enroll(course.id, member2.id, member2, crypto.randomUUID(), { expectedCourseVersion: updatedCourse!.version })

    expect(enrollment2.status).toBe('Waitlisted')
    expect(enrollment2.waitlistPosition).toBe(1)
  })

  it('dropEnrollment changes status to Dropped', async () => {
    const member = await makeUser({ role: 'Member' })
    // Use a future drop deadline
    const course = await makeCourse({ status: 'Open', capacity: 10, dropDeadline: '01/14/2099 23:59' })

    const enrollment = await courseService.enroll(course.id, member.id, member, crypto.randomUUID(), { expectedCourseVersion: course.version })
    expect(enrollment.status).toBe('Enrolled')

    // Get updated course version after enrollment
    const updatedCourse = await db.courses.get(course.id)

    await courseService.drop(enrollment.id!, member, 'Testing drop', {
      expectedEnrollmentVersion: enrollment.version,
      expectedCourseVersion: updatedCourse!.version,
    })

    const updated = await db.enrollments.get(enrollment.id!)
    expect(updated?.status).toBe('Dropped')
  })
})
