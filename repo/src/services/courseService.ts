import { db } from '../db/db.ts'
import { notificationService } from './notificationService.ts'
import type { Course, Enrollment, EnrollmentChange, User } from '../types/index.ts'

export class EnrollmentError extends Error {
  code:
    | 'ENROLL_PREREQ_NOT_MET'
    | 'ENROLL_DROP_DEADLINE_PASSED'
    | 'ENROLL_NOT_FOUND'
    | 'ENROLL_INVALID_STATE'
    | 'ENROLL_VERSION_CONFLICT'

  missingCourses?: number[]

  constructor(code: EnrollmentError['code'], message: string, missingCourses?: number[]) {
    super(message)
    this.code = code
    this.missingCourses = missingCourses
  }
}

interface CreateCourseInput {
  title: string
  description: string
  instructorId: number
  startDateTime: string
  endDateTime: string
  dropDeadline?: string
  capacity: number
  prerequisiteCourseIds: number[]
}

interface EnrollOptions {
  expectedCourseVersion: number
}

interface EnrollmentMutationOptions {
  expectedEnrollmentVersion: number
  expectedCourseVersion: number
}

type EnrollmentNotificationArgs = {
  memberId: number
  template: 'COURSE_ENROLLED' | 'COURSE_WAITLISTED'
  data: Record<string, string>
}

type WaitlistPromotionNotification = {
  promotedMemberId: number
  courseTitle: string
}


function parseUsDateTime(dateTime: string): Date {
  const [datePart, timePart] = dateTime.split(' ')
  const [mm, dd, yyyy] = datePart.split('/').map(Number)
  const [hh, min] = (timePart ?? '00:00').split(':').map(Number)
  return new Date(yyyy, (mm || 1) - 1, dd || 1, hh || 0, min || 0, 0, 0)
}

function defaultDropDeadline(startDateTime: string): string {
  const start = new Date(startDateTime)
  start.setDate(start.getDate() - 1)
  return `${String(start.getMonth() + 1).padStart(2, '0')}/${String(start.getDate()).padStart(2, '0')}/${start.getFullYear()} 23:59`
}

function addChange(
  current: Enrollment,
  fromStatus: string,
  toStatus: Enrollment['status'],
  actor: number,
  reason?: string,
): EnrollmentChange[] {
  const change: EnrollmentChange = {
    fromStatus,
    toStatus,
    actor,
    timestamp: Date.now(),
    reason,
  }
  return [...current.changeHistory, change]
}

async function createAudit(actor: string, action: string, entityType: string, entityId: number) {
  await db.auditLogs.add({
    actor,
    action,
    entityType,
    entityId: String(entityId),
    timestamp: Date.now(),
  })
}

function assertVersion(current: number, expected: number) {
  if (current !== expected) {
    throw new EnrollmentError('ENROLL_VERSION_CONFLICT', 'Record version conflict.')
  }
}

function assertAuthenticated(actor: { role: User['role'] }) {
  if (!actor?.role) {
    throw new Error('RBAC_AUTH_REQUIRED')
  }
}

async function promoteWaitlistInternal(course: Course): Promise<WaitlistPromotionNotification | null> {
  if (!course.id) {
    return null
  }

  const waitlisted = await db.enrollments
    .where('courseId')
    .equals(course.id)
    .and((item) => item.status === 'Waitlisted')
    .sortBy('waitlistPosition')

  const next = waitlisted[0]
  if (!next || !next.id) {
    if (course.status === 'Full') {
      await db.courses.put({
        ...course,
        status: 'Open',
        version: course.version + 1,
      })
    }
    return null
  }

  await db.enrollments.put({
    ...next,
    status: 'Enrolled',
    waitlistPosition: undefined,
    enrolledAt: Date.now(),
    version: next.version + 1,
    changeHistory: addChange(next, 'Waitlisted', 'Enrolled', 0, 'Auto-promoted from waitlist'),
  })

  for (const item of waitlisted.slice(1)) {
    if (!item.id || !item.waitlistPosition) continue
    await db.enrollments.put({
      ...item,
      waitlistPosition: item.waitlistPosition - 1,
      version: item.version + 1,
    })
  }

  if (course.status === 'Full') {
    await db.courses.put({
      ...course,
      status: 'Open',
      version: course.version + 1,
    })
  }

  return { promotedMemberId: next.memberId, courseTitle: course.title }
}

export const courseService = {
  async listCourses(actor: { role: User['role'] }): Promise<Course[]> {
    assertAuthenticated(actor)
    return db.courses.toArray()
  },

  async getCourse(id: number, actor: { role: User['role'] }): Promise<Course | undefined> {
    assertAuthenticated(actor)
    return db.courses.get(id)
  },

  async createCourse(data: CreateCourseInput, actor: User): Promise<Course> {
    if (!(actor.role === 'Instructor' || actor.role === 'Administrator')) {
      throw new Error('Only instructors or administrators can create courses.')
    }

    if (data.startDateTime && data.endDateTime && data.startDateTime >= data.endDateTime) {
      throw new Error('Course start must be before end.')
    }

    const course: Course = {
      title: data.title.trim(),
      description: data.description.trim(),
      instructorId: data.instructorId,
      startDateTime: data.startDateTime,
      endDateTime: data.endDateTime,
      dropDeadline: data.dropDeadline ?? defaultDropDeadline(data.startDateTime),
      capacity: data.capacity,
      prerequisiteCourseIds: data.prerequisiteCourseIds,
      status: 'Draft',
      version: 1,
    }

    const id = await db.courses.add(course)
    await createAudit(actor.username, 'COURSE_CREATED', 'Course', id)
    return { ...course, id }
  },

  async openCourse(courseId: number, actor: User, options: EnrollOptions): Promise<void> {
    if (actor.role !== 'Administrator' && actor.role !== 'Instructor') {
      throw new Error('Only Administrator or Instructor can open a course.')
    }
    await db.transaction('rw', db.courses, db.auditLogs, async () => {
      const course = await db.courses.get(courseId)
      if (!course) {
        throw new Error('Course not found.')
      }
      if (course.capacity < 1) {
        throw new Error('Course capacity must be at least 1.')
      }
      assertVersion(course.version, options.expectedCourseVersion)

      await db.courses.put({
        ...course,
        status: 'Open',
        version: course.version + 1,
      })
      await createAudit(actor.username, 'COURSE_OPENED', 'Course', courseId)
    })
  },

  async enroll(
    courseId: number,
    memberId: number,
    actor: User,
    operationId: string,
    options: EnrollOptions,
  ): Promise<Enrollment> {
    if (actor.role !== 'Administrator' && actor.id !== memberId) {
      throw new Error('You can only enroll yourself unless you are an Administrator.')
    }

    // Fast idempotency check outside the transaction first
    const existing = await db.enrollments.where('operationId').equals(operationId).first()
    if (existing) {
      return existing
    }

    // Same-member-per-course guard outside transaction (cheap early exit)
    const existingForMember = await db.enrollments
      .where('courseId')
      .equals(courseId)
      .and((item) => item.memberId === memberId && item.status !== 'Dropped')
      .first()
    if (existingForMember) {
      return existingForMember
    }

    const result = await db.transaction(
      'rw',
      db.enrollments,
      db.courses,
      db.auditLogs,
      async (): Promise<{ enrollment: Enrollment; notificationArgs: EnrollmentNotificationArgs | null }> => {
        let notificationArgs: EnrollmentNotificationArgs | null = null

        // Re-check inside transaction to close the race window
        const txExisting = await db.enrollments.where('operationId').equals(operationId).first()
        if (txExisting) {
          return { enrollment: txExisting, notificationArgs: null }
        }

        const txExistingForMember = await db.enrollments
          .where('courseId')
          .equals(courseId)
          .and((item) => item.memberId === memberId && item.status !== 'Dropped')
          .first()
        if (txExistingForMember) {
          return { enrollment: txExistingForMember, notificationArgs: null }
        }

        const course = await db.courses.get(courseId)
        if (!course || !(course.status === 'Open' || course.status === 'Full')) {
          throw new Error('Course is not open for enrollment.')
        }
        assertVersion(course.version, options.expectedCourseVersion)

        const completed = await db.enrollments
          .where('memberId')
          .equals(memberId)
          .and((item) => item.status === 'Completed')
          .toArray()

        const completedSet = new Set(completed.map((item) => item.courseId))
        const missing = course.prerequisiteCourseIds.filter((required) => !completedSet.has(required))
        if (missing.length > 0) {
          throw new EnrollmentError('ENROLL_PREREQ_NOT_MET', 'Prerequisites not met.', missing)
        }

        const currentEnrollments = await db.enrollments
          .where('courseId')
          .equals(courseId)
          .and((item) => item.status === 'Enrolled')
          .count()

        const currentWaitlist = await db.enrollments
          .where('courseId')
          .equals(courseId)
          .and((item) => item.status === 'Waitlisted')
          .count()

        const now = Date.now()
        let newEnrollment: Enrollment
        if (currentEnrollments < course.capacity) {
          newEnrollment = {
            operationId,
            courseId,
            memberId,
            status: 'Enrolled',
            enrolledAt: now,
            changeHistory: [
              {
                fromStatus: 'None',
                toStatus: 'Enrolled',
                actor: memberId,
                timestamp: now,
              },
            ],
            version: 1,
          }

          if (currentEnrollments + 1 === course.capacity) {
            await db.courses.put({ ...course, status: 'Full', version: course.version + 1 })
          }

          notificationArgs = { memberId, template: 'COURSE_ENROLLED', data: { courseTitle: course.title } }
        } else {
          newEnrollment = {
            operationId,
            courseId,
            memberId,
            status: 'Waitlisted',
            waitlistPosition: currentWaitlist + 1,
            changeHistory: [
              {
                fromStatus: 'None',
                toStatus: 'Waitlisted',
                actor: memberId,
                timestamp: now,
              },
            ],
            version: 1,
          }

          notificationArgs = {
            memberId,
            template: 'COURSE_WAITLISTED',
            data: { position: String(currentWaitlist + 1), courseTitle: course.title },
          }
        }

        const id = await db.enrollments.add(newEnrollment)
        await createAudit(`user:${memberId}`, 'COURSE_ENROLLMENT_CREATED', 'Enrollment', id)
        return { enrollment: { ...newEnrollment, id }, notificationArgs }
      },
    )

    // Send notifications outside the transaction
    if (result.notificationArgs) {
      await notificationService.send(
        result.notificationArgs.memberId,
        result.notificationArgs.template,
        result.notificationArgs.data,
      )
    }

    return result.enrollment
  },

  async drop(
    enrollmentId: number,
    actor: User,
    reason: string,
    options: EnrollmentMutationOptions,
  ): Promise<void> {
    const result = await db.transaction(
      'rw',
      db.enrollments,
      db.courses,
      db.auditLogs,
      async (): Promise<{
        droppedMemberId: number
        courseTitle: string
        promoted: WaitlistPromotionNotification | null
      }> => {
      const enrollment = await db.enrollments.get(enrollmentId)
      if (!enrollment) {
        throw new EnrollmentError('ENROLL_NOT_FOUND', 'Enrollment not found.')
      }
      if (actor.role !== 'Administrator' && actor.id !== enrollment.memberId) {
        throw new EnrollmentError('ENROLL_INVALID_STATE', 'You can only drop your own enrollment unless you are an Administrator.')
      }
      if (!(enrollment.status === 'Enrolled' || enrollment.status === 'Waitlisted')) {
        throw new EnrollmentError('ENROLL_INVALID_STATE', 'Enrollment cannot be dropped.')
      }
      assertVersion(enrollment.version, options.expectedEnrollmentVersion)

      const course = await db.courses.get(enrollment.courseId)
      if (!course) {
        throw new EnrollmentError('ENROLL_NOT_FOUND', 'Course not found.')
      }
      assertVersion(course.version, options.expectedCourseVersion)

      const deadlineMs = parseUsDateTime(course.dropDeadline).getTime()
      if (Date.now() > deadlineMs) {
        throw new EnrollmentError(
          'ENROLL_DROP_DEADLINE_PASSED',
          'Drop deadline has passed for this course.',
        )
      }

      const fromStatus = enrollment.status
      await db.enrollments.put({
        ...enrollment,
        status: 'Dropped',
        droppedAt: Date.now(),
        waitlistPosition: undefined,
        version: enrollment.version + 1,
        changeHistory: addChange(enrollment, fromStatus, 'Dropped', actor.id ?? 0, reason),
      })

      let promoted: WaitlistPromotionNotification | null = null
      if (fromStatus === 'Enrolled') {
        promoted = await promoteWaitlistInternal(course)
      }

      await createAudit(actor.username, 'COURSE_ENROLLMENT_DROPPED', 'Enrollment', enrollmentId)
      return {
        droppedMemberId: enrollment.memberId,
        courseTitle: course.title,
        promoted,
      }
    })

    await notificationService.send(result.droppedMemberId, 'COURSE_DROPPED', {
      courseTitle: result.courseTitle,
    })
    if (result.promoted) {
      await notificationService.send(result.promoted.promotedMemberId, 'COURSE_WAITLIST_PROMOTED', {
        courseTitle: result.promoted.courseTitle,
      })
    }
  },

  async promoteWaitlist(courseId: number, options: EnrollOptions): Promise<void> {
    const promoted = await db.transaction(
      'rw',
      db.enrollments,
      db.courses,
      async (): Promise<WaitlistPromotionNotification | null> => {
      const course = await db.courses.get(courseId)
      if (!course) {
        throw new EnrollmentError('ENROLL_NOT_FOUND', 'Course not found.')
      }
      assertVersion(course.version, options.expectedCourseVersion)
      return promoteWaitlistInternal(course)
    })

    if (promoted) {
      await notificationService.send(promoted.promotedMemberId, 'COURSE_WAITLIST_PROMOTED', {
        courseTitle: promoted.courseTitle,
      })
    }
  },

  async markEnrollmentStatus(
    enrollmentId: number,
    status: 'Completed' | 'NoShow',
    actor: User,
    reason: string,
    options: EnrollmentMutationOptions,
  ): Promise<void> {
    if (!(actor.role === 'Instructor' || actor.role === 'Administrator')) {
      throw new EnrollmentError('ENROLL_INVALID_STATE', 'Only instructors or administrators can mark enrollment status.')
    }

    await db.transaction('rw', db.enrollments, async () => {
      const enrollment = await db.enrollments.get(enrollmentId)
      if (!enrollment) {
        throw new EnrollmentError('ENROLL_NOT_FOUND', 'Enrollment not found.')
      }
      assertVersion(enrollment.version, options.expectedEnrollmentVersion)

      await db.enrollments.put({
        ...enrollment,
        status,
        version: enrollment.version + 1,
        changeHistory: addChange(enrollment, enrollment.status, status, actor.id ?? 0, reason),
      })
    })
  },

  async updateCourseFee(courseId: number, newFee: number, actor: User): Promise<Course> {
    if (!(actor.role === 'Instructor' || actor.role === 'Administrator')) {
      throw new Error('Only Instructor or Administrator can update course fees.')
    }
    if (!Number.isFinite(newFee) || newFee < 0) {
      throw new Error('Course fee must be a non-negative number.')
    }

    const course = await db.courses.get(courseId)
    if (!course) {
      throw new Error('Course not found.')
    }

    const updated = { ...course, fee: newFee, version: course.version + 1 }
    await db.courses.put(updated)
    await createAudit(actor.username, 'COURSE_FEE_UPDATED', 'Course', courseId)

    const enrolledMembers = await db.enrollments
      .where('courseId')
      .equals(courseId)
      .and((item) => item.status === 'Enrolled' || item.status === 'Waitlisted')
      .toArray()

    await Promise.all(
      enrolledMembers.map((item) =>
        notificationService.send(item.memberId, 'FEE_CHANGED', {
          courseTitle: course.title,
          newFee: newFee.toFixed(2),
        }),
      ),
    )

    return updated
  },

  async getEnrolledCounts(actor: { role: User['role'] }): Promise<Map<number, number>> {
    assertAuthenticated(actor)
    const enrolled = await db.enrollments.where('status').equals('Enrolled').toArray()
    const map = new Map<number, number>()
    for (const e of enrolled) {
      map.set(e.courseId, (map.get(e.courseId) ?? 0) + 1)
    }
    return map
  },

  async getMyEnrollmentStatuses(memberId: number, actor: { role: User['role'] }): Promise<Map<number, string>> {
    assertAuthenticated(actor)
    const mine = await db.enrollments.where('memberId').equals(memberId).toArray()
    const map = new Map<number, string>()
    for (const e of mine) {
      map.set(e.courseId, e.status)
    }
    return map
  },

  async getEnrollments(courseId: number, actor: { id?: number; role: User['role'] }): Promise<Enrollment[]> {
    if (actor.role === 'Administrator' || actor.role === 'Instructor') {
      return db.enrollments.where('courseId').equals(courseId).toArray()
    }
    if (!actor.id) return []
    return db.enrollments
      .where('courseId')
      .equals(courseId)
      .and((item) => item.memberId === actor.id)
      .toArray()
  },
}
