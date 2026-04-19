// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AdminPage from '../../pages/AdminPage.tsx'

const { mockUseLiveQuery, mockAuthAdmin } = vi.hoisted(() => ({
  mockUseLiveQuery: vi.fn(),
  mockAuthAdmin: {
    currentUser: { id: 1, username: 'admin', role: 'Administrator' as const, passwordHash: '', salt: '', failedAttempts: 0 },
    hasRole: (...roles: string[]) => roles.includes('Administrator'),
    encryptionKey: null as CryptoKey | null,
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
      <AdminPage />
    </MemoryRouter>,
  )
}

describe('AdminPage', () => {
  beforeEach(() => {
    mockUseLiveQuery.mockReset()
    mockUseLiveQuery.mockReturnValue([])
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders Administration heading', () => {
    renderPage()
    expect(screen.getByText('Administration')).toBeTruthy()
  })

  it('shows Create User form', () => {
    renderPage()
    // "Create User" appears as both h3 heading and button text - use queryAllByText
    const createUserElements = screen.getAllByText('Create User')
    expect(createUserElements.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByLabelText(/username/i)).toBeTruthy()
    expect(screen.getByLabelText(/initial password/i)).toBeTruthy()
  })

  it('shows sensitive notes section for Administrator when encryptionKey is null', () => {
    renderPage()
    // The sensitive notes section renders when hasRole('Administrator') but encryptionKey is null
    // it shows the "Re-login required" message
    expect(screen.getByText('My Sensitive Notes')).toBeTruthy()
    expect(screen.getByText(/re-login required/i)).toBeTruthy()
  })

  it('shows User List section', () => {
    renderPage()
    expect(screen.getByText('User List')).toBeTruthy()
  })
})
