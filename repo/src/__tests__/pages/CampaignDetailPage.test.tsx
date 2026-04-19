// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CampaignDetailPage from '../../pages/CampaignDetailPage.tsx'
import type { Campaign } from '../../types/index.ts'

const { mockUseLiveQuery, mockAuthAdmin } = vi.hoisted(() => ({
  mockUseLiveQuery: vi.fn(),
  mockAuthAdmin: {
    currentUser: { id: 1, username: 'admin', role: 'Administrator' as const, passwordHash: '', salt: '', failedAttempts: 0 },
    hasRole: (...roles: string[]) => roles.includes('Administrator'),
    encryptionKey: null,
    login: vi.fn(),
    logout: vi.fn(),
    isReady: true,
  },
}))

vi.mock('dexie-react-hooks', () => ({ useLiveQuery: mockUseLiveQuery }))
vi.mock('../../hooks/useAuth.ts', () => ({ useAuth: () => mockAuthAdmin }))

const sampleCampaign: Campaign = {
  id: 1,
  title: 'Spring Salmon Run',
  description: 'Great salmon campaign',
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

function renderWithId(id = '1') {
  return render(
    <MemoryRouter initialEntries={[`/campaigns/${id}`]}>
      <Routes>
        <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('CampaignDetailPage', () => {
  beforeEach(() => {
    mockUseLiveQuery.mockReset()
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows Loading when campaign is undefined', () => {
    mockUseLiveQuery.mockReturnValue(undefined)
    renderWithId()
    expect(screen.getByText('Loading...')).toBeTruthy()
  })

  it('shows Campaign not found when campaign is null', () => {
    mockUseLiveQuery.mockReturnValue(null)
    renderWithId()
    expect(screen.getByText('Campaign not found.')).toBeTruthy()
  })

  it('renders campaign title for valid campaign', () => {
    let callCount = 0
    mockUseLiveQuery.mockImplementation(() => {
      callCount++
      if (callCount === 1) return sampleCampaign
      if (callCount === 2) return undefined // fish
      if (callCount === 3) return [] // orders
      return new Map()
    })
    renderWithId()
    expect(screen.getByText('Spring Salmon Run')).toBeTruthy()
    expect(screen.getByText('Great salmon campaign')).toBeTruthy()
  })
})
