// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Sidebar } from '../../components/Layout/Sidebar.tsx'
import type { UserRole } from '../../types/index.ts'

// Use a mutable auth object so individual tests can change the role.
// hasRole reads currentUser.role at call-time, not at definition-time.
const { mockAuthValue } = vi.hoisted(() => {
  const auth = {
    currentUser: { id: 1, username: 'admin', role: 'Administrator' as UserRole, passwordHash: '', salt: '', failedAttempts: 0 },
    hasRole: (...roles: UserRole[]) => roles.includes(auth.currentUser.role),
    encryptionKey: null as CryptoKey | null,
    login: vi.fn(),
    logout: vi.fn(),
    isReady: true,
  }
  return { mockAuthValue: auth }
})

vi.mock('../../hooks/useAuth.ts', () => ({ useAuth: () => mockAuthValue }))

function renderSidebar(isOpen = false) {
  return render(
    <MemoryRouter>
      <Sidebar isOpen={isOpen} />
    </MemoryRouter>,
  )
}

describe('Sidebar', () => {
  beforeEach(() => {
    // Reset to Administrator before each test
    mockAuthValue.currentUser = { id: 1, username: 'admin', role: 'Administrator', passwordHash: '', salt: '', failedAttempts: 0 }
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders Dashboard link always', () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeTruthy()
  })

  it('shows Admin link for Administrator role', () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: /admin/i })).toBeTruthy()
  })

  it('shows Dispatch Board link for Administrator', () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: /dispatch board/i })).toBeTruthy()
  })

  it('applies open class when isOpen=true', () => {
    const { container } = renderSidebar(true)
    const aside = container.querySelector('aside')
    expect(aside?.classList.contains('open')).toBe(true)
  })

  it('does not apply open class when isOpen=false', () => {
    const { container } = renderSidebar(false)
    const aside = container.querySelector('aside')
    expect(aside?.classList.contains('open')).toBe(false)
  })

  it('hides Admin link for Member role', () => {
    mockAuthValue.currentUser = { id: 2, username: 'member', role: 'Member', passwordHash: '', salt: '', failedAttempts: 0 }
    renderSidebar()
    expect(screen.queryByRole('link', { name: /^admin$/i })).toBeNull()
  })

  it('hides Dispatch Board link for Member role', () => {
    mockAuthValue.currentUser = { id: 2, username: 'member', role: 'Member', passwordHash: '', salt: '', failedAttempts: 0 }
    renderSidebar()
    expect(screen.queryByRole('link', { name: /dispatch board/i })).toBeNull()
  })

  it('hides Finance link for Member role', () => {
    mockAuthValue.currentUser = { id: 2, username: 'member', role: 'Member', passwordHash: '', salt: '', failedAttempts: 0 }
    renderSidebar()
    expect(screen.queryByRole('link', { name: /finance/i })).toBeNull()
  })

  it('shows Group Buys link for Member role', () => {
    mockAuthValue.currentUser = { id: 2, username: 'member', role: 'Member', passwordHash: '', salt: '', failedAttempts: 0 }
    renderSidebar()
    expect(screen.getByRole('link', { name: /group buys/i })).toBeTruthy()
  })

  it('shows Dispatch Board link for Dispatcher role', () => {
    mockAuthValue.currentUser = { id: 3, username: 'dispatcher', role: 'Dispatcher', passwordHash: '', salt: '', failedAttempts: 0 }
    renderSidebar()
    expect(screen.getByRole('link', { name: /dispatch board/i })).toBeTruthy()
  })

  it('hides Admin link for FinanceClerk role', () => {
    mockAuthValue.currentUser = { id: 4, username: 'finance', role: 'FinanceClerk', passwordHash: '', salt: '', failedAttempts: 0 }
    renderSidebar()
    expect(screen.queryByRole('link', { name: /^admin$/i })).toBeNull()
  })
})
