// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CampaignListPage from '../../pages/CampaignListPage.tsx'
import type { Campaign } from '../../types/index.ts'

const { mockUseLiveQuery, mockAuthAdmin } = vi.hoisted(() => ({
  mockUseLiveQuery: vi.fn(),
  mockAuthAdmin: {
    currentUser: { id: 1, username: 'admin', role: 'Administrator' as const, passwordHash: '', salt: '', failedAttempts: 0 },
    hasRole: (...roles: string[]) => roles.includes('Administrator') || roles.includes('Member'),
    encryptionKey: null,
    login: vi.fn(),
    logout: vi.fn(),
    isReady: true,
  },
}))

vi.mock('dexie-react-hooks', () => ({ useLiveQuery: mockUseLiveQuery }))
vi.mock('../../hooks/useAuth.ts', () => ({ useAuth: () => mockAuthAdmin }))

function renderPage() {
  return render(
    <MemoryRouter>
      <CampaignListPage />
    </MemoryRouter>,
  )
}

const sampleCampaign: Campaign = {
  id: 1,
  title: 'Spring Salmon Run',
  description: 'Great salmon deal',
  fishEntryId: 1,
  pricePerUnit: 12.50,
  unit: 'lb',
  minParticipants: 5,
  cutoffAt: Date.now() + 86400000,
  status: 'Open',
  createdBy: 1,
  createdAt: Date.now(),
  version: 1,
}

describe('CampaignListPage', () => {
  beforeEach(() => {
    mockUseLiveQuery.mockReset()
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders Group-Buy Campaigns heading', () => {
    mockUseLiveQuery.mockReturnValue([])
    renderPage()
    expect(screen.getByText('Group-Buy Campaigns')).toBeTruthy()
  })

  it('shows create form for Administrator role', () => {
    mockUseLiveQuery.mockReturnValue([])
    renderPage()
    expect(screen.getByText('New Campaign')).toBeTruthy()
  })

  it('shows campaigns in list', () => {
    let callCount = 0
    mockUseLiveQuery.mockImplementation(() => {
      callCount++
      if (callCount === 1) return [sampleCampaign]
      if (callCount === 2) return new Map()
      return []
    })
    renderPage()
    expect(screen.getByText('Spring Salmon Run')).toBeTruthy()
    expect(screen.getByText('Great salmon deal')).toBeTruthy()
  })

  it('shows No campaigns empty state when list is empty', () => {
    mockUseLiveQuery.mockImplementation(() => {
      return []
    })
    renderPage()
    expect(screen.getByText('No campaigns to show')).toBeTruthy()
  })

  it('shows filter tab buttons', () => {
    mockUseLiveQuery.mockReturnValue([])
    renderPage()
    expect(screen.getByRole('button', { name: 'All' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Confirmed' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Closed' })).toBeTruthy()
  })
})
