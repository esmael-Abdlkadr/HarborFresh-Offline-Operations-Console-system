// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import FishListPage from '../../pages/FishListPage.tsx'
import type { FishEntry, UserRole } from '../../types/index.ts'

// We control auth via this mutable object
const authState: {
  currentUser: { id: number; username: string; role: UserRole; passwordHash: string; salt: string; failedAttempts: number }
  hasRole: (...roles: string[]) => boolean
  encryptionKey: CryptoKey | null
  login: ReturnType<typeof vi.fn>
  logout: ReturnType<typeof vi.fn>
  isReady: boolean
} = {
  currentUser: { id: 1, username: 'editor', role: 'ContentEditor', passwordHash: '', salt: '', failedAttempts: 0 },
  hasRole: (...roles: string[]) => roles.includes(authState.currentUser.role),
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

function renderPage() {
  return render(
    <MemoryRouter>
      <FishListPage />
    </MemoryRouter>,
  )
}

describe('FishListPage', () => {
  beforeEach(() => {
    mockUseLiveQuery.mockReset()
    // Reset to ContentEditor
    authState.currentUser = { id: 1, username: 'editor', role: 'ContentEditor', passwordHash: '', salt: '', failedAttempts: 0 }
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders Fish Knowledge Base heading', () => {
    mockUseLiveQuery.mockReturnValue([])
    renderPage()
    expect(screen.getByText('Fish Knowledge Base')).toBeTruthy()
  })

  it('shows New Entry button for ContentEditor role', () => {
    mockUseLiveQuery.mockReturnValue([])
    renderPage()
    expect(screen.getByRole('button', { name: /new entry/i })).toBeTruthy()
  })

  it('hides New Entry button for Member role', () => {
    authState.currentUser = { id: 2, username: 'member', role: 'Member', passwordHash: '', salt: '', failedAttempts: 0 }
    mockUseLiveQuery.mockReturnValue([])
    renderPage()
    expect(screen.queryByRole('button', { name: /new entry/i })).toBeNull()
  })

  it('shows empty state message for Member with no entries', () => {
    authState.currentUser = { id: 2, username: 'member', role: 'Member', passwordHash: '', salt: '', failedAttempts: 0 }
    mockUseLiveQuery.mockReturnValue([])
    renderPage()
    const cell = screen.getByRole('cell')
    expect(cell.textContent).toMatch(/no fish entries/i)
  })

  it('shows editorial empty state for ContentEditor with no entries', () => {
    mockUseLiveQuery.mockReturnValue([])
    renderPage()
    expect(screen.getByText(/No fish entries yet\. Create the first entry/i)).toBeTruthy()
  })

  it('shows status filter dropdown for editorial user', () => {
    mockUseLiveQuery.mockReturnValue([])
    renderPage()
    const selects = screen.getAllByRole('combobox')
    expect(selects.length).toBeGreaterThanOrEqual(2)
  })

  it('does not show status filter for Member role', () => {
    authState.currentUser = { id: 2, username: 'member', role: 'Member', passwordHash: '', salt: '', failedAttempts: 0 }
    mockUseLiveQuery.mockReturnValue([])
    renderPage()
    // Member only sees protection level filter (1 select)
    const selects = screen.getAllByRole('combobox')
    expect(selects.length).toBe(1)
  })

  it('filters table rows when search is typed', () => {
    const entries: FishEntry[] = [
      {
        id: 1, slug: 'salmon', commonName: 'Atlantic Salmon', scientificName: 'Salmo salar',
        taxonomy: { kingdom: '', phylum: '', class: '', order: '', family: '', genus: '', species: '' },
        morphologyNotes: '', habitat: '', distribution: '', protectionLevel: 'None',
        mediaAssets: [], status: 'published', currentVersion: 1, tags: [], createdBy: 1, updatedAt: Date.now(),
      },
      {
        id: 2, slug: 'tuna', commonName: 'Bluefin Tuna', scientificName: 'Thunnus thynnus',
        taxonomy: { kingdom: '', phylum: '', class: '', order: '', family: '', genus: '', species: '' },
        morphologyNotes: '', habitat: '', distribution: '', protectionLevel: 'None',
        mediaAssets: [], status: 'published', currentVersion: 1, tags: [], createdBy: 1, updatedAt: Date.now(),
      },
    ]
    mockUseLiveQuery.mockReturnValue(entries)
    renderPage()

    expect(screen.getByText('Atlantic Salmon')).toBeTruthy()
    expect(screen.getByText('Bluefin Tuna')).toBeTruthy()

    const searchInput = screen.getByPlaceholderText(/search/i)
    fireEvent.change(searchInput, { target: { value: 'salmon' } })

    expect(screen.queryByText('Atlantic Salmon')).toBeTruthy()
    expect(screen.queryByText('Bluefin Tuna')).toBeNull()
  })
})
