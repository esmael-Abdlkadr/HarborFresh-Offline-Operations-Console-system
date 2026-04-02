import { useMemo, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db/db.ts'
import { useAuth } from '../hooks/useAuth.ts'
import { courseService } from '../services/courseService.ts'

export default function CourseListPage() {
  const { currentUser, hasRole } = useAuth()
  const coursesRaw = useLiveQuery(() => db.courses.toArray(), [])
  const users = useLiveQuery(() => db.users.toArray(), []) ?? []
  const enrollments = useLiveQuery(() => db.enrollments.toArray(), []) ?? []

  const [statusFilter, setStatusFilter] = useState<'All' | 'Draft' | 'Open' | 'Full' | 'Closed' | 'Completed'>('All')
  const [instructorFilter, setInstructorFilter] = useState<number>(0)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    instructorId: 0,
    startDateTime: '',
    endDateTime: '',
    dropDeadline: '',
    capacity: 20,
    prerequisites: '',
  })

  const filtered = useMemo(() => {
    const items = coursesRaw ?? []
    return items.filter((course) => {
      if (statusFilter !== 'All' && course.status !== statusFilter) {
        return false
      }
      if (instructorFilter && course.instructorId !== instructorFilter) {
        return false
      }
      if (fromDate && course.startDateTime.slice(0, 10) < fromDate) {
        return false
      }
      if (toDate && course.endDateTime.slice(0, 10) > toDate) {
        return false
      }
      return true
    })
  }, [coursesRaw, fromDate, instructorFilter, statusFilter, toDate])

  function toUsDateTimeLocal(isoDateTime: string): string {
    if (isoDateTime.includes('T')) {
      const [datePart, timePart] = isoDateTime.split('T')
      const [year, month, day] = datePart.split('-')
      const [hh, mm] = (timePart ?? '00:00').split(':')
      return `${month}/${day}/${year} ${hh}:${mm}`
    }
    const [datePart, timePart] = isoDateTime.split(' ')
    const [year, month, day] = datePart.split('-')
    const [hh, mm] = (timePart ?? '00:00').split(':')
    return `${month}/${day}/${year} ${hh}:${mm}`
  }

  function formatDateTimeDisplay(iso: string): string {
    const sep = iso.includes('T') ? 'T' : ' '
    const [datePart, timePart] = iso.split(sep)
    const [year, month, day] = (datePart ?? '').split('-')
    return `${month}/${day}/${year} ${(timePart ?? '00:00').slice(0, 5)}`
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!currentUser) return

    setCreating(true)
    setError(null)
    try {
      const course = await courseService.createCourse(
        {
          title: form.title,
          description: form.description,
          instructorId: Number(form.instructorId),
          startDateTime: form.startDateTime,
          endDateTime: form.endDateTime,
          dropDeadline: form.dropDeadline ? toUsDateTimeLocal(form.dropDeadline) : undefined,
          capacity: Number(form.capacity),
          prerequisiteCourseIds: form.prerequisites
            .split(',')
            .map((value) => Number(value.trim()))
            .filter((value) => Number.isFinite(value) && value > 0),
        },
        currentUser,
      )
      await courseService.openCourse(course.id!, currentUser)
      setForm({
        title: '',
        description: '',
        instructorId: 0,
        startDateTime: '',
        endDateTime: '',
        dropDeadline: '',
        capacity: 20,
        prerequisites: '',
      })
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create course.')
    } finally {
      setCreating(false)
    }
  }

  async function enroll(courseId: number) {
    if (!currentUser?.id) return
    setError(null)
    try {
      const course = (coursesRaw ?? []).find((c) => c.id === courseId)
      await courseService.enroll(courseId, currentUser.id, crypto.randomUUID(), {
        expectedCourseVersion: course?.version,
      })
    } catch (enrollError) {
      setError(enrollError instanceof Error ? enrollError.message : 'Enrollment failed.')
    }
  }

  return (
    <main className="page">
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Course Registration</h2>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
            <option>All</option>
            <option>Draft</option>
            <option>Open</option>
            <option>Full</option>
            <option>Closed</option>
            <option>Completed</option>
          </select>
          <select value={instructorFilter} onChange={(event) => setInstructorFilter(Number(event.target.value))}>
            <option value={0}>All instructors</option>
            {users
              .filter((user) => (user.role === 'Instructor' || user.role === 'Administrator') && user.id)
              .map((user) => (
                <option key={user.id} value={user.id}>
                  {user.username}
                </option>
              ))}
          </select>
          <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        </div>
      </section>

      {(hasRole('Instructor', 'Administrator')) && (
        <section className="card" style={{ marginTop: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>New Course</h3>
          <form className="form" style={{ maxWidth: '100%' }} onSubmit={onCreate}>
            <label>Title<input value={form.title} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} required /></label>
            <label>Description<textarea value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} rows={3} /></label>
            <label>
              Instructor
              <select value={form.instructorId} onChange={(e) => setForm((s) => ({ ...s, instructorId: Number(e.target.value) }))} required>
                <option value={0}>Select instructor</option>
                {users.filter((u) => (u.role === 'Instructor' || u.role === 'Administrator') && u.id).map((u) => (
                  <option key={u.id} value={u.id}>{u.username}</option>
                ))}
              </select>
            </label>
            <label>Start Date &amp; Time<input type="datetime-local" value={form.startDateTime} onChange={(e) => setForm((s) => ({ ...s, startDateTime: e.target.value }))} required /></label>
            <label>End Date &amp; Time<input type="datetime-local" value={form.endDateTime} onChange={(e) => setForm((s) => ({ ...s, endDateTime: e.target.value }))} required /></label>
            <label>Drop Deadline (optional)<input type="datetime-local" value={form.dropDeadline} onChange={(e) => setForm((s) => ({ ...s, dropDeadline: e.target.value }))} /></label>
            <label>Capacity<input type="number" min={1} value={form.capacity} onChange={(e) => setForm((s) => ({ ...s, capacity: Number(e.target.value) }))} required /></label>
            <label>Prerequisite Course IDs (comma-separated)<input value={form.prerequisites} onChange={(e) => setForm((s) => ({ ...s, prerequisites: e.target.value }))} /></label>
            {error && <p className="error">{error}</p>}
            <button className="btn" disabled={creating}>{creating ? 'Creating...' : 'Create Course'}</button>
          </form>
        </section>
      )}

      <section className="card" style={{ marginTop: '1rem', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Title</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Instructor</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Dates</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Status</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Enrolled/Capacity</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>My Status</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {coursesRaw === undefined ? (
              <tr>
                <td colSpan={7} style={{ padding: '1rem', color: 'var(--muted)', textAlign: 'center' }}>
                  Loading...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '1rem', color: 'var(--muted)', textAlign: 'center' }}>
                  No courses found.
                </td>
              </tr>
            ) : null}
            {filtered.map((course) => {
              const enrolledCount = enrollments.filter((item) => item.courseId === course.id && item.status === 'Enrolled').length
              const myEnrollment = enrollments.find((item) => item.courseId === course.id && item.memberId === currentUser?.id)
              return (
                <tr key={course.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.5rem' }}>{course.title}</td>
                  <td style={{ padding: '0.5rem' }}>{users.find((u) => u.id === course.instructorId)?.username ?? `User ${course.instructorId}`}</td>
                  <td style={{ padding: '0.5rem' }}>{formatDateTimeDisplay(course.startDateTime)} – {formatDateTimeDisplay(course.endDateTime)}</td>
                  <td style={{ padding: '0.5rem' }}>{course.status}</td>
                  <td style={{ padding: '0.5rem' }}>{enrolledCount}/{course.capacity}</td>
                  <td style={{ padding: '0.5rem' }}>{myEnrollment?.status ?? '-'}</td>
                  <td style={{ padding: '0.5rem', display: 'flex', gap: '0.4rem' }}>
                    {hasRole('Member') && (course.status === 'Open' || course.status === 'Full') && (
                      <button className="btn secondary" onClick={() => void enroll(course.id!)}>Enroll</button>
                    )}
                    {(hasRole('Instructor', 'Administrator')) && <Link to={`/courses/${course.id}`}>Manage</Link>}
                    {hasRole('Member') && <Link to={`/courses/${course.id}`}>View</Link>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
      {error && <p className="error">{error}</p>}
    </main>
  )
}
