import { useParams } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '../hooks/useAuth.ts'
import { courseService, EnrollmentError } from '../services/courseService.ts'
import { userService } from '../services/userService.ts'
import type { Enrollment } from '../types/index.ts'

export default function CourseDetailPage() {
  const { id } = useParams()
  const courseId = Number(id)
  const { currentUser, hasRole } = useAuth()
  const course = useLiveQuery(
    () => (Number.isFinite(courseId) && currentUser ? courseService.getCourse(courseId, currentUser) : undefined),
    [courseId, currentUser?.role],
  )

  // Scoped query: members fetch only their own enrollment; admin/instructor see all
  const enrollmentsRaw = useLiveQuery(
    () => {
      if (!Number.isFinite(courseId) || !currentUser) return undefined
      return courseService.getEnrollments(courseId, currentUser)
    },
    [courseId, currentUser?.id, currentUser?.role],
  )
  const enrollments = useMemo(() => enrollmentsRaw ?? [], [enrollmentsRaw])

  // Admin/Instructor only: resolve member usernames for the enrollment tables.
  // Uses targeted ID lookup instead of fetching the entire users table.
  const isStaff = currentUser?.role === 'Administrator' || currentUser?.role === 'Instructor'
  const staffUserMap = useLiveQuery(
    async () => {
      if (!isStaff || enrollments.length === 0) return new Map<number, string>()
      const memberIds = enrollments.map((e) => e.memberId)
      const actorIds = enrollments.flatMap((e) => e.changeHistory.map((c) => c.actor))
      const allIds = [...new Set([...memberIds, ...actorIds])]
      return userService.getUsernames(allIds)
    },
    [enrollments, isStaff],
  )

  const [tab, setTab] = useState<'enrollment' | 'waitlist' | 'history'>('enrollment')
  const [error, setError] = useState<string | null>(null)
  const [feeInput, setFeeInput] = useState('')
  const [feeError, setFeeError] = useState<string | null>(null)
  const [feeSuccess, setFeeSuccess] = useState(false)

  const history = useMemo(() => {
    const items = enrollmentsRaw ?? []
    return items
      .flatMap((enrollment) =>
        enrollment.changeHistory.map((change: Enrollment['changeHistory'][number]) => ({
          enrollmentId: enrollment.id,
          memberId: enrollment.memberId,
          ...change,
        })),
      )
      .sort((a, b) => b.timestamp - a.timestamp)
  }, [enrollmentsRaw])

  const myEnrollment = enrollments.find((item) => item.memberId === currentUser?.id)

  async function drop() {
    if (!currentUser || !myEnrollment?.id || !course) return
    setError(null)
    try {
      await courseService.drop(myEnrollment.id, currentUser, 'Member requested drop', {
        expectedEnrollmentVersion: myEnrollment.version,
        expectedCourseVersion: course.version,
      })
    } catch (dropError) {
      if (dropError instanceof EnrollmentError) {
        setError(dropError.message)
      } else {
        setError('Drop failed.')
      }
    }
  }

  async function updateFee() {
    if (!currentUser || !course?.id) return
    setFeeError(null)
    setFeeSuccess(false)
    const fee = Number(feeInput)
    try {
      await courseService.updateCourseFee(course.id, fee, currentUser)
      setFeeSuccess(true)
      setFeeInput('')
    } catch (err) {
      setFeeError(err instanceof Error ? err.message : 'Failed to update fee.')
    }
  }

  async function markStatus(enrollmentId: number, status: 'Completed' | 'NoShow') {
    if (!currentUser || !course) return
    setError(null)
    try {
      const enrollment = enrollments.find((e) => e.id === enrollmentId)
      if (!enrollment) return
      await courseService.markEnrollmentStatus(enrollmentId, status, currentUser, 'Managed in detail page', {
        expectedEnrollmentVersion: enrollment.version,
        expectedCourseVersion: course.version,
      })
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : 'Failed to update enrollment')
    }
  }

  if (course === undefined) {
    return (
      <main className="page">
        <section className="card">Loading...</section>
      </main>
    )
  }

  if (course === null) {
    return (
      <main className="page">
        <section className="card">Course not found.</section>
      </main>
    )
  }

  const userMap = staffUserMap ?? new Map<number, string>()

  return (
    <main className="page">
      <section className="card">
        <h2 style={{ marginTop: 0 }}>{course.title}</h2>
        <p>{course.description}</p>
        <p>
          Dates: {course.startDateTime} – {course.endDateTime}
        </p>
        <p>Drop deadline: {course.dropDeadline}</p>
        <p>Status: {course.status}</p>
        {course.fee !== undefined && <p>Fee: ${course.fee.toFixed(2)}</p>}
        {error && <p className="error">{error}</p>}
        {hasRole('Member') && (myEnrollment?.status === 'Enrolled' || myEnrollment?.status === 'Waitlisted') && (
          <button className="btn secondary" onClick={() => void drop()}>
            Drop {myEnrollment.status === 'Waitlisted' ? 'Waitlist' : 'Enrollment'}
          </button>
        )}
      </section>

      {hasRole('Administrator', 'Instructor') && (
        <section className="card" style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className={`btn ${tab === 'enrollment' ? '' : 'secondary'}`} onClick={() => setTab('enrollment')}>Enrollment</button>
            <button className={`btn ${tab === 'waitlist' ? '' : 'secondary'}`} onClick={() => setTab('waitlist')}>Waitlist</button>
            <button className={`btn ${tab === 'history' ? '' : 'secondary'}`} onClick={() => setTab('history')}>Change History</button>
          </div>

          {tab === 'enrollment' && (
            <div style={{ marginTop: '0.7rem', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Member</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Status</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments.filter((item) => item.status !== 'Waitlisted').map((item) => (
                    <tr key={item.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.5rem' }}>{userMap.get(item.memberId) ?? `User ${item.memberId}`}</td>
                      <td style={{ padding: '0.5rem' }}>{item.status}</td>
                      <td style={{ padding: '0.5rem', display: 'flex', gap: '0.4rem' }}>
                        <button className="btn secondary" onClick={() => void markStatus(item.id!, 'Completed')}>Mark Completed</button>
                        <button className="btn secondary" onClick={() => void markStatus(item.id!, 'NoShow')}>Mark No-Show</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'waitlist' && (
            <div style={{ marginTop: '0.7rem' }}>
              {enrollments
                .filter((item) => item.status === 'Waitlisted')
                .sort((a, b) => (a.waitlistPosition ?? 0) - (b.waitlistPosition ?? 0))
                .map((item) => (
                  <div key={item.id} className="card" style={{ marginTop: '0.4rem' }}>
                    {userMap.get(item.memberId) ?? `User ${item.memberId}`} - position {item.waitlistPosition}
                  </div>
                ))}
            </div>
          )}

          {tab === 'history' && (
            <div style={{ marginTop: '0.7rem' }}>
              {history.map((item, idx) => (
                <div key={`${item.enrollmentId}-${idx}`} className="card" style={{ marginTop: '0.4rem' }}>
                  {new Date(item.timestamp).toLocaleString()} - Enrollment #{item.enrollmentId}: {item.fromStatus} -&gt; {item.toStatus} by {userMap.get(item.actor) ?? item.actor}
                  {item.reason ? ` (${item.reason})` : ''}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {hasRole('Administrator', 'Instructor') && (
        <section className="card" style={{ marginTop: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>Update Course Fee</h3>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ flex: 1 }}>
              New Fee (USD)
              <input
                type="number"
                min={0}
                step={0.01}
                placeholder={course.fee !== undefined ? String(course.fee) : '0.00'}
                value={feeInput}
                onChange={(e) => { setFeeInput(e.target.value); setFeeSuccess(false) }}
                style={{ display: 'block', width: '100%' }}
              />
            </label>
            <button className="btn" onClick={() => void updateFee()} disabled={feeInput === ''}>
              Update Fee
            </button>
          </div>
          {feeError && <p className="error">{feeError}</p>}
          {feeSuccess && <p style={{ color: 'var(--success, green)' }}>Fee updated and members notified.</p>}
        </section>
      )}

      {hasRole('Member') && (
        <section className="card" style={{ marginTop: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>My Enrollment</h3>
          {!myEnrollment ? (
            <p>You are not enrolled in this course.</p>
          ) : (
            <div>
              <p>Status: <strong>{myEnrollment.status}</strong></p>
              {myEnrollment.waitlistPosition !== undefined && (
                <p>Waitlist position: {myEnrollment.waitlistPosition}</p>
              )}
            </div>
          )}
        </section>
      )}
    </main>
  )
}
