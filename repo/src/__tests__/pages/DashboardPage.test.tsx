// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DashboardPage from '../../pages/DashboardPage.tsx'

const { mockUseLiveQuery } = vi.hoisted(() => ({
  mockUseLiveQuery: vi.fn(),
}))

vi.mock('dexie-react-hooks', () => ({ useLiveQuery: mockUseLiveQuery }))

describe('DashboardPage', () => {
  beforeEach(() => {
    mockUseLiveQuery.mockReset()
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders Dashboard heading', () => {
    mockUseLiveQuery.mockReturnValue(undefined)
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('Dashboard')).toBeTruthy()
  })

  it('shows stat cards with dash (—) when counts are undefined (loading)', () => {
    mockUseLiveQuery.mockReturnValue(undefined)
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('Open Campaigns')).toBeTruthy()
    expect(screen.getByText('Confirmed Orders')).toBeTruthy()
    expect(screen.getByText('Unassigned Tasks')).toBeTruthy()
    expect(screen.getByText('Pending Notifications')).toBeTruthy()
    expect(screen.getByText('Published Fish')).toBeTruthy()
    expect(screen.getByText('Open Courses')).toBeTruthy()
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(6)
  })

  it('shows numeric values when counts are returned', () => {
    mockUseLiveQuery.mockReturnValue({
      openCampaigns: 3,
      confirmedOrders: 7,
      unassignedTasks: 2,
      pendingNotifications: 5,
      publishedFish: 12,
      openCourses: 4,
    })
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('7')).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()
  })
})
