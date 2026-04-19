// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CourseDetailPage from '../../pages/CourseDetailPage.tsx'
import type { Course } from '../../types/index.ts'

const { mockUseLiveQuery, mockAuthAdmin } = vi.hoisted(() => ({
  mockUseLiveQuery: vi.fn(),
  mockAuthAdmin: {
    currentUser: { id: 1, username: 'admin', role: 'Administrator' as const, passwordHash: '', salt: '', failedAttempts: 0 },
    hasRole: (...roles: string[]) => roles.includes('Administrator') || roles.includes('Instructor'),
    encryptionKey: null,
    login: vi.fn(),
    logout: vi.fn(),
    isReady: true,
  },
}))

vi.mock('dexie-react-hooks', () => ({ useLiveQuery: mockUseLiveQuery }))
vi.mock('../../hooks/useAuth.ts', () => ({ useAuth: () => mockAuthAdmin }))

const sampleCourse: Course = {
  id: 1,
  title: 'Fish Identification 101',
  description: 'Learn to identify common fish species',
  instructorId: 1,
  startDateTime: '2027-03-01T09:00',
  endDateTime: '2027-03-01T17:00',
  dropDeadline: '02/28/2027 23:59',
  capacity: 20,
  prerequisiteCourseIds: [],
  status: 'Open',
  version: 1,
}

function renderWithId(id = '1') {
  return render(
    <MemoryRouter initialEntries={[`/courses/${id}`]}>
      <Routes>
        <Route path="/courses/:id" element={<CourseDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('CourseDetailPage', () => {
  beforeEach(() => {
    mockUseLiveQuery.mockReset()
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows loading when course is undefined', () => {
    mockUseLiveQuery.mockReturnValue(undefined)
    renderWithId()
    expect(screen.getByText('Loading...')).toBeTruthy()
  })

  it('shows Course not found when course is null', () => {
    mockUseLiveQuery.mockReturnValue(null)
    renderWithId()
    expect(screen.getByText('Course not found.')).toBeTruthy()
  })

  it('renders course title for valid course', () => {
    let callCount = 0
    mockUseLiveQuery.mockImplementation(() => {
      callCount++
      if (callCount === 1) return sampleCourse
      if (callCount === 2) return []
      return new Map()
    })
    renderWithId()
    expect(screen.getByText('Fish Identification 101')).toBeTruthy()
    expect(screen.getByText('Learn to identify common fish species')).toBeTruthy()
  })
})
