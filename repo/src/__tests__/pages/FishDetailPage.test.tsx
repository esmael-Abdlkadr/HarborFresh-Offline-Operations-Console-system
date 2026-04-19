// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import FishDetailPage from '../../pages/FishDetailPage.tsx'
import type { FishEntry } from '../../types/index.ts'
import type { UserRole } from '../../types/index.ts'

// Mutable auth state we can change between tests
const authState = {
  currentUser: { id: 1, username: 'editor', role: 'ContentEditor' as UserRole, passwordHash: '', salt: '', failedAttempts: 0 },
  hasRole: (...roles: UserRole[]) => roles.includes(authState.currentUser.role),
  encryptionKey: null as CryptoKey | null,
  login: vi.fn(),
  logout: vi.fn(),
  isReady: true,
}

const { mockUseLiveQuery } = vi.hoisted(() => ({
  mockUseLiveQuery: vi.fn(),
}))

vi.mock('dexie-react-hooks', () => ({ useLiveQuery: mockUseLiveQuery }))
vi.mock('../../hooks/useAuth.ts', () => ({ useAuth: () => authState }))

const sampleEntry: FishEntry = {
  id: 1,
  slug: 'atlantic-salmon',
  commonName: 'Atlantic Salmon',
  scientificName: 'Salmo salar',
  taxonomy: { kingdom: 'Animalia', phylum: 'Chordata', class: 'Actinopterygii', order: 'Salmoniformes', family: 'Salmonidae', genus: 'Salmo', species: 'salar' },
  morphologyNotes: 'Silver body with black spots',
  habitat: 'Atlantic Ocean',
  distribution: 'North Atlantic',
  protectionLevel: 'None',
  mediaAssets: [],
  status: 'published',
  currentVersion: 1,
  tags: ['salmon'],
  createdBy: 1,
  updatedAt: Date.now(),
}

function renderWithId(id = '1') {
  return render(
    <MemoryRouter initialEntries={[`/fish/${id}`]}>
      <Routes>
        <Route path="/fish/:id" element={<FishDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('FishDetailPage', () => {
  beforeEach(() => {
    mockUseLiveQuery.mockReset()
    authState.currentUser = { id: 1, username: 'editor', role: 'ContentEditor' as UserRole, passwordHash: '', salt: '', failedAttempts: 0 }
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows Loading when entry is undefined', () => {
    mockUseLiveQuery.mockReturnValue(undefined)
    renderWithId()
    expect(screen.getByText('Loading...')).toBeTruthy()
  })

  it('shows Fish entry not found when entry is null', () => {
    mockUseLiveQuery.mockReturnValue(null)
    renderWithId()
    expect(screen.getByText('Fish entry not found.')).toBeTruthy()
  })

  it('renders Info tab with entry details for editorial user', () => {
    let callCount = 0
    mockUseLiveQuery.mockImplementation(() => {
      callCount++
      if (callCount === 1) return sampleEntry
      if (callCount === 2) return []
      return undefined
    })
    renderWithId()
    expect(screen.getByText('Atlantic Salmon')).toBeTruthy()
    expect(screen.getByText(/Salmo salar/)).toBeTruthy()
  })

  it('shows Workflow tab for editorial users', () => {
    let callCount = 0
    mockUseLiveQuery.mockImplementation(() => {
      callCount++
      if (callCount === 1) return sampleEntry
      if (callCount === 2) return []
      return undefined
    })
    renderWithId()
    expect(screen.getByRole('button', { name: /workflow/i })).toBeTruthy()
  })

  it('shows Edit Entry button for ContentEditor role', () => {
    let callCount = 0
    mockUseLiveQuery.mockImplementation(() => {
      callCount++
      if (callCount === 1) return sampleEntry
      if (callCount === 2) return []
      return undefined
    })
    renderWithId()
    expect(screen.getByRole('button', { name: /edit entry/i })).toBeTruthy()
  })

  it('shows Fish entry not found for non-editorial user viewing non-published entry', () => {
    authState.currentUser = { id: 2, username: 'member', role: 'Member' as UserRole, passwordHash: '', salt: '', failedAttempts: 0 }

    const draftEntry: FishEntry = { ...sampleEntry, status: 'draft' }
    let callCount = 0
    mockUseLiveQuery.mockImplementation(() => {
      callCount++
      if (callCount === 1) return draftEntry
      return []
    })

    renderWithId()
    expect(screen.getByText('Fish entry not found.')).toBeTruthy()
  })
})
