// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CourseListPage from '../../pages/CourseListPage.tsx'
import type { Course } from '../../types/index.ts'

const { mockUseLiveQuery, mockAuthInstructor } = vi.hoisted(() => ({
  mockUseLiveQuery: vi.fn(),
  mockAuthInstructor: {
    currentUser: { id: 1, username: 'instructor', role: 'Instructor' as const, passwordHash: '', salt: '', failedAttempts: 0 },
    hasRole: (...roles: string[]) => roles.includes('Instructor') || roles.includes('Administrator'),
    encryptionKey: null,
    login: vi.fn(),
    logout: vi.fn(),
    isReady: true,
  },
}))

vi.mock('dexie-react-hooks', () => ({ useLiveQuery: mockUseLiveQuery }))
vi.mock('../../hooks/useAuth.ts', () => ({ useAuth: () => mockAuthInstructor }))

const sampleCourse: Course = {
  id: 1,
  title: 'Fish Identification 101',
  description: 'Learn to identify fish',
  instructorId: 1,
  startDateTime: '2027-03-01T09:00',
  endDateTime: '2027-03-01T17:00',
  dropDeadline: '02/28/2027 23:59',
  capacity: 20,
  prerequisiteCourseIds: [],
  status: 'Open',
  version: 1,
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CourseListPage />
    </MemoryRouter>,
  )
}

describe('CourseListPage', () => {
  beforeEach(() => {
    mockUseLiveQuery.mockReset()
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders Course Registration heading', () => {
    mockUseLiveQuery.mockReturnValue([])
    renderPage()
    expect(screen.getByText('Course Registration')).toBeTruthy()
  })

  it('shows create form for Instructor role', () => {
    mockUseLiveQuery.mockReturnValue([])
    renderPage()
    expect(screen.getByText('New Course')).toBeTruthy()
    expect(screen.getByRole('button', { name: /create course/i })).toBeTruthy()
  })

  it('shows courses in a list', () => {
    let callCount = 0
    mockUseLiveQuery.mockImplementation(() => {
      callCount++
      if (callCount === 1) return [sampleCourse]
      if (callCount === 2) return []
      if (callCount === 3) return new Map()
      return new Map()
    })
    renderPage()
    expect(screen.getByText('Fish Identification 101')).toBeTruthy()
  })

  it('shows empty state when no courses', () => {
    mockUseLiveQuery.mockReturnValue([])
    renderPage()
    expect(screen.getByText('No courses found.')).toBeTruthy()
  })
})
